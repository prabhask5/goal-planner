import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getPendingSync, removeSyncItem, incrementRetry, getPendingItemsByEntityId, removeSyncItemsForEntity } from './queue';
import type { SyncQueueItem, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, GoalListWithProgress } from '$lib/types';
import { syncStatusStore } from '$lib/stores/sync';
import { calculateGoalProgress } from '$lib/utils/colors';

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500; // 1.5 seconds debounce for writes

// Callbacks for auto-refresh on reconnection
const reconnectionCallbacks: Set<() => Promise<void>> = new Set();

export function onReconnection(callback: () => Promise<void>): () => void {
  reconnectionCallbacks.add(callback);
  return () => reconnectionCallbacks.delete(callback);
}

// ============================================================
// WRITE OPERATIONS - Debounced background sync to Supabase
// ============================================================

// Schedule a debounced sync push - call this after local writes
export function scheduleSyncPush(): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(() => {
    pushChanges();
  }, SYNC_DEBOUNCE_MS);
}

// Push local changes to Supabase
export async function pushChanges(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    syncStatusStore.setStatus('offline');
    return;
  }

  const pendingItems = await getPendingSync();
  if (pendingItems.length === 0) {
    syncStatusStore.setStatus('idle');
    return;
  }

  syncStatusStore.setStatus('syncing');
  syncStatusStore.setPendingCount(pendingItems.length);

  for (const item of pendingItems) {
    try {
      await processSyncItem(item);
      if (item.id) {
        await removeSyncItem(item.id);
      }
    } catch (error) {
      console.error(`Failed to sync item ${item.id}:`, error);
      if (item.id) {
        await incrementRetry(item.id);
      }
    }
  }

  const remaining = await getPendingSync();
  syncStatusStore.setPendingCount(remaining.length);
  syncStatusStore.setStatus(remaining.length > 0 ? 'error' : 'idle');

  if (remaining.length === 0) {
    syncStatusStore.setLastSyncTime(new Date().toISOString());
  }
}

async function processSyncItem(item: SyncQueueItem): Promise<'applied' | 'discarded' | 'error'> {
  const { table, operation, entityId, payload } = item;
  const localUpdatedAt = payload.updated_at as string | undefined;

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from(table)
        .insert({ id: entityId, ...payload });
      // Ignore duplicate key errors (item already exists)
      if (error && !error.message.includes('duplicate')) {
        throw error;
      }
      return 'applied';
    }
    case 'update': {
      // First, fetch current remote data to compare timestamps
      const { data: remoteData, error: fetchError } = await supabase
        .from(table)
        .select('updated_at')
        .eq('id', entityId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = row not found
        throw fetchError;
      }

      // If remote doesn't exist (was deleted), discard this update
      if (!remoteData) {
        console.log(`Entity ${entityId} no longer exists in remote, discarding update`);
        return 'discarded';
      }

      // Compare timestamps - only apply if local is newer
      const remoteUpdatedAt = remoteData.updated_at as string;
      if (localUpdatedAt && remoteUpdatedAt) {
        const localTime = new Date(localUpdatedAt).getTime();
        const remoteTime = new Date(remoteUpdatedAt).getTime();

        if (remoteTime > localTime) {
          // Remote is newer, discard this sync and update local cache with remote data
          console.log(`Remote is newer for ${entityId}, discarding local sync`);
          await syncRemoteToLocal(table, entityId);
          return 'discarded';
        }
      }

      // Local is newer or equal, apply the update
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', entityId);
      if (error) throw error;
      return 'applied';
    }
    case 'delete': {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', entityId);
      if (error) throw error;
      return 'applied';
    }
  }
  return 'applied';
}

// Sync a single entity from remote to local cache
async function syncRemoteToLocal(table: SyncQueueItem['table'], entityId: string): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', entityId)
    .single();

  if (error || !data) return;

  switch (table) {
    case 'goal_lists':
      await db.goalLists.put(data as GoalList);
      break;
    case 'goals':
      await db.goals.put(data as Goal);
      break;
    case 'daily_routine_goals':
      await db.dailyRoutineGoals.put(data as DailyRoutineGoal);
      break;
    case 'daily_goal_progress':
      await db.dailyGoalProgress.put(data as DailyGoalProgress);
      break;
  }
}

// Manual sync trigger (for UI button)
export async function performSync(): Promise<void> {
  await pushChanges();
}

// ============================================================
// MERGE HELPERS - Keep newer version based on updated_at
// ============================================================

interface Timestamped {
  id: string;
  updated_at: string;
}

// Returns true if local is newer than remote
function isLocalNewer<T extends Timestamped>(local: T | undefined, remote: T): boolean {
  if (!local) return false;
  return new Date(local.updated_at) > new Date(remote.updated_at);
}

// Merge arrays, keeping the newer version of each entity by id
// pendingItems: map of entity IDs to pending sync items - used to compare timestamps
// staleEntityIds: output set that will be populated with entity IDs whose pending syncs are stale
function mergeByTimestamp<T extends Timestamped>(
  localItems: T[],
  remoteItems: T[],
  pendingItems: Map<string, SyncQueueItem>,
  staleEntityIds?: Set<string>
): T[] {
  const localMap = new Map(localItems.map(item => [item.id, item]));

  const result: T[] = [];
  const seenIds = new Set<string>();

  // Process remote items
  for (const remote of remoteItems) {
    const local = localMap.get(remote.id);
    const pendingItem = pendingItems.get(remote.id);

    if (local && pendingItem) {
      // There's a pending sync for this entity - compare actual timestamps
      const localUpdatedAt = new Date(local.updated_at).getTime();
      const remoteUpdatedAt = new Date(remote.updated_at).getTime();

      if (remoteUpdatedAt > localUpdatedAt) {
        // Remote is newer - use remote, mark pending as stale
        result.push(remote);
        if (staleEntityIds) {
          staleEntityIds.add(remote.id);
        }
      } else {
        // Local is newer or equal - use local
        result.push(local);
      }
    } else if (isLocalNewer(local, remote)) {
      // No pending sync but local is newer (shouldn't happen normally)
      result.push(local!);
    } else {
      // Use remote
      result.push(remote);
    }
    seenIds.add(remote.id);
  }

  // Add local-only items (items that exist locally but not in remote - pending creates)
  for (const local of localItems) {
    if (!seenIds.has(local.id)) {
      result.push(local);
    }
  }

  return result;
}

// ============================================================
// READ OPERATIONS - Fetch from Supabase, merge with local cache
// ============================================================

// Helper to calculate progress for a list
function calculateListProgress(goals: Goal[]): { totalGoals: number; completedGoals: number; completionPercentage: number } {
  const totalGoals = goals.length;
  const completedProgress = goals.reduce((sum: number, goal: Goal) => {
    return sum + calculateGoalProgress(goal.type, goal.completed, goal.current_value, goal.target_value);
  }, 0);
  const completionPercentage = totalGoals > 0 ? completedProgress / totalGoals : 0;

  return {
    totalGoals,
    completedGoals: goals.filter((g: Goal) =>
      g.type === 'completion' ? g.completed : g.current_value >= (g.target_value || 0)
    ).length,
    completionPercentage: Math.round(completionPercentage)
  };
}

// Discard stale pending syncs for entities where remote is newer
async function discardStaleSyncs(staleEntityIds: Set<string>): Promise<void> {
  for (const entityId of staleEntityIds) {
    await removeSyncItemsForEntity(entityId);
    console.log(`Discarded stale pending syncs for entity ${entityId}`);
  }
}

// Fetch all goal lists with progress
export async function fetchGoalLists(): Promise<GoalListWithProgress[]> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    const lists = await db.goalLists.orderBy('created_at').reverse().toArray();
    const listsWithProgress: GoalListWithProgress[] = await Promise.all(
      lists.map(async (list) => {
        const goals = await db.goals.where('goal_list_id').equals(list.id).toArray();
        return { ...list, ...calculateListProgress(goals) };
      })
    );
    return listsWithProgress;
  }

  // Online: fetch from Supabase
  const { data: remoteLists, error } = await supabase
    .from('goal_lists')
    .select('*, goals(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();
  const staleEntityIds = new Set<string>();

  // Get local data for merging
  const localLists = await db.goalLists.toArray();
  const localGoals = await db.goals.toArray();

  // Separate goals from lists for merging
  const remoteGoals: Goal[] = [];
  const remoteListsOnly: GoalList[] = (remoteLists || []).map(list => {
    const { goals, ...listData } = list;
    if (goals) remoteGoals.push(...goals);
    return listData as GoalList;
  });

  // Merge keeping newer versions, track stale entities
  const mergedLists = mergeByTimestamp(localLists, remoteListsOnly, pendingItems, staleEntityIds);
  const mergedGoals = mergeByTimestamp(localGoals, remoteGoals, pendingItems, staleEntityIds);

  // Discard stale pending syncs
  await discardStaleSyncs(staleEntityIds);

  // Update cache with merged data
  await db.transaction('rw', [db.goalLists, db.goals], async () => {
    await db.goalLists.clear();
    await db.goals.clear();
    if (mergedLists.length > 0) {
      await db.goalLists.bulkPut(mergedLists);
    }
    if (mergedGoals.length > 0) {
      await db.goals.bulkPut(mergedGoals);
    }
  });

  // Return with progress calculated, sorted by created_at desc
  const sortedLists = mergedLists.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return sortedLists.map((list) => {
    const listGoals = mergedGoals.filter(g => g.goal_list_id === list.id);
    return { ...list, ...calculateListProgress(listGoals) };
  });
}

// Fetch a single goal list with its goals
export async function fetchGoalList(id: string): Promise<(GoalList & { goals: Goal[] }) | null> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    const list = await db.goalLists.get(id);
    if (!list) return null;
    const goals = await db.goals.where('goal_list_id').equals(id).toArray();
    goals.sort((a, b) => a.order - b.order);
    return { ...list, goals };
  }

  // Online: fetch from Supabase
  const { data: remoteList, error: listError } = await supabase
    .from('goal_lists')
    .select('*')
    .eq('id', id)
    .single();

  if (listError) throw listError;
  if (!remoteList) return null;

  const { data: remoteGoals, error: goalsError } = await supabase
    .from('goals')
    .select('*')
    .eq('goal_list_id', id)
    .order('order', { ascending: true });

  if (goalsError) throw goalsError;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();
  const staleEntityIds = new Set<string>();

  // Get local data for merging
  const localList = await db.goalLists.get(id);
  const localGoals = await db.goals.where('goal_list_id').equals(id).toArray();

  // Merge keeping newer versions
  const pendingItem = pendingItems.get(id);
  let mergedList: GoalList;

  if (localList && pendingItem) {
    const localTime = new Date(localList.updated_at).getTime();
    const remoteTime = new Date(remoteList.updated_at).getTime();
    if (remoteTime > localTime) {
      mergedList = remoteList;
      staleEntityIds.add(id);
    } else {
      mergedList = localList;
    }
  } else if (isLocalNewer(localList, remoteList)) {
    mergedList = localList!;
  } else {
    mergedList = remoteList;
  }

  const mergedGoals = mergeByTimestamp(localGoals, remoteGoals || [], pendingItems, staleEntityIds);

  // Discard stale pending syncs
  await discardStaleSyncs(staleEntityIds);

  // Update cache
  await db.goalLists.put(mergedList);
  await db.transaction('rw', db.goals, async () => {
    await db.goals.where('goal_list_id').equals(id).delete();
    if (mergedGoals.length > 0) {
      await db.goals.bulkPut(mergedGoals);
    }
  });

  // Sort by order and return
  mergedGoals.sort((a, b) => a.order - b.order);
  return { ...mergedList, goals: mergedGoals };
}

// Fetch all daily routine goals
export async function fetchDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return db.dailyRoutineGoals.orderBy('created_at').reverse().toArray();
  }

  // Online: fetch from Supabase
  const { data: remoteRoutines, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();
  const staleEntityIds = new Set<string>();

  // Get local data for merging
  const localRoutines = await db.dailyRoutineGoals.toArray();

  // Merge keeping newer versions, track stale entities
  const mergedRoutines = mergeByTimestamp(localRoutines, remoteRoutines || [], pendingItems, staleEntityIds);

  // Discard stale pending syncs
  await discardStaleSyncs(staleEntityIds);

  // Update cache
  await db.transaction('rw', db.dailyRoutineGoals, async () => {
    await db.dailyRoutineGoals.clear();
    if (mergedRoutines.length > 0) {
      await db.dailyRoutineGoals.bulkPut(mergedRoutines);
    }
  });

  // Sort by created_at desc
  return mergedRoutines.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// Fetch a single daily routine goal
export async function fetchDailyRoutineGoal(id: string): Promise<DailyRoutineGoal | null> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return (await db.dailyRoutineGoals.get(id)) || null;
  }

  // Online: fetch from Supabase
  const { data: remoteRoutine, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!remoteRoutine) return null;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();

  // Get local for merging
  const localRoutine = await db.dailyRoutineGoals.get(id);
  const pendingItem = pendingItems.get(id);

  let mergedRoutine: DailyRoutineGoal;

  if (localRoutine && pendingItem) {
    const localTime = new Date(localRoutine.updated_at).getTime();
    const remoteTime = new Date(remoteRoutine.updated_at).getTime();
    if (remoteTime > localTime) {
      mergedRoutine = remoteRoutine;
      // Discard stale sync
      await removeSyncItemsForEntity(id);
    } else {
      mergedRoutine = localRoutine;
    }
  } else if (isLocalNewer(localRoutine, remoteRoutine)) {
    mergedRoutine = localRoutine!;
  } else {
    mergedRoutine = remoteRoutine;
  }

  // Update cache
  await db.dailyRoutineGoals.put(mergedRoutine);

  return mergedRoutine;
}

// Fetch active routines for a specific date
export async function fetchActiveRoutinesForDate(date: string): Promise<DailyRoutineGoal[]> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    const allRoutines = await db.dailyRoutineGoals.toArray();
    return allRoutines.filter((routine) => {
      if (routine.start_date > date) return false;
      if (routine.end_date && routine.end_date < date) return false;
      return true;
    });
  }

  // Online: fetch from Supabase
  const { data: remoteRoutines, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .lte('start_date', date);

  if (error) throw error;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();
  const staleEntityIds = new Set<string>();

  // Get local data for merging
  const localRoutines = await db.dailyRoutineGoals.toArray();

  // Merge keeping newer versions, track stale entities
  const mergedRoutines = mergeByTimestamp(localRoutines, remoteRoutines || [], pendingItems, staleEntityIds);

  // Discard stale pending syncs
  await discardStaleSyncs(staleEntityIds);

  // Update cache with merged routines
  if (mergedRoutines.length > 0) {
    await db.dailyRoutineGoals.bulkPut(mergedRoutines);
  }

  // Filter for active routines on this date
  return mergedRoutines.filter((routine) => {
    if (routine.start_date > date) return false;
    if (routine.end_date && routine.end_date < date) return false;
    return true;
  });
}

// Fetch daily progress for a specific date
export async function fetchDailyProgress(date: string): Promise<DailyGoalProgress[]> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return db.dailyGoalProgress.where('date').equals(date).toArray();
  }

  // Online: fetch from Supabase
  const { data: remoteProgress, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .eq('date', date);

  if (error) throw error;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();
  const staleEntityIds = new Set<string>();

  // Get local data for merging
  const localProgress = await db.dailyGoalProgress.where('date').equals(date).toArray();

  // Merge keeping newer versions, track stale entities
  const mergedProgress = mergeByTimestamp(localProgress, remoteProgress || [], pendingItems, staleEntityIds);

  // Discard stale pending syncs
  await discardStaleSyncs(staleEntityIds);

  // Update cache
  await db.transaction('rw', db.dailyGoalProgress, async () => {
    await db.dailyGoalProgress.where('date').equals(date).delete();
    if (mergedProgress.length > 0) {
      await db.dailyGoalProgress.bulkPut(mergedProgress);
    }
  });

  return mergedProgress;
}

// Fetch month progress for calendar view
export async function fetchMonthProgress(year: number, month: number): Promise<DailyGoalProgress[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return db.dailyGoalProgress
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  }

  // Online: fetch from Supabase
  const { data: remoteProgress, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;

  // Get pending items for merge decisions
  const pendingItems = await getPendingItemsByEntityId();
  const staleEntityIds = new Set<string>();

  // Get local data for merging
  const localProgress = await db.dailyGoalProgress
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  // Merge keeping newer versions, track stale entities
  const mergedProgress = mergeByTimestamp(localProgress, remoteProgress || [], pendingItems, staleEntityIds);

  // Discard stale pending syncs
  await discardStaleSyncs(staleEntityIds);

  // Update cache
  await db.transaction('rw', db.dailyGoalProgress, async () => {
    await db.dailyGoalProgress
      .where('date')
      .between(startDate, endDate, true, true)
      .delete();
    if (mergedProgress.length > 0) {
      await db.dailyGoalProgress.bulkPut(mergedProgress);
    }
  });

  return mergedProgress;
}

// ============================================================
// LIFECYCLE - Start/stop sync engine
// ============================================================

// Handler for online event
async function handleOnline(): Promise<void> {
  console.log('Connection restored - syncing and refreshing...');

  // First push any valid pending changes (stale ones will be discarded by processSyncItem)
  await pushChanges();

  // Then trigger all reconnection callbacks to refresh UI with latest data
  for (const callback of reconnectionCallbacks) {
    try {
      await callback();
    } catch (error) {
      console.error('Reconnection callback failed:', error);
    }
  }
}

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', handleOnline);

  // Push any pending changes on start
  if (navigator.onLine) {
    pushChanges();
  }
}

export function stopSyncEngine(): void {
  if (typeof window === 'undefined') return;

  window.removeEventListener('online', handleOnline);
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
}

// Clear local cache (for logout)
export async function clearLocalCache(): Promise<void> {
  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.syncQueue], async () => {
    await db.goalLists.clear();
    await db.goals.clear();
    await db.dailyRoutineGoals.clear();
    await db.dailyGoalProgress.clear();
    await db.syncQueue.clear();
  });
}
