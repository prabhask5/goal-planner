import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getPendingSync, removeSyncItem, incrementRetry, getPendingEntityIds } from './queue';
import type { SyncQueueItem, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, GoalListWithProgress } from '$lib/types';
import { syncStatusStore } from '$lib/stores/sync';
import { calculateGoalProgress } from '$lib/utils/colors';

// ============================================================
// LOCAL-FIRST SYNC ENGINE
//
// Rules:
// 1. All reads come from local DB (IndexedDB)
// 2. All writes go to local DB first, immediately
// 3. Every write creates a pending operation in the outbox
// 4. Sync loop ships outbox to server in background
// 5. On refresh, load local state instantly, then run background sync
// ============================================================

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
const SYNC_DEBOUNCE_MS = 2000; // 2 seconds debounce after writes
const SYNC_INTERVAL_MS = 60000; // 1 minute periodic sync

// Callbacks for when sync completes (stores can refresh from local)
const syncCompleteCallbacks: Set<() => void> = new Set();

export function onSyncComplete(callback: () => void): () => void {
  syncCompleteCallbacks.add(callback);
  return () => syncCompleteCallbacks.delete(callback);
}

function notifySyncComplete(): void {
  for (const callback of syncCompleteCallbacks) {
    try {
      callback();
    } catch (e) {
      console.error('Sync callback error:', e);
    }
  }
}

// ============================================================
// LOCAL READ OPERATIONS - UI always reads from here
// ============================================================

// Helper to calculate progress for a list
function calculateListProgress(goals: Goal[]): { totalGoals: number; completedGoals: number; completionPercentage: number } {
  // Filter out deleted goals
  const activeGoals = goals.filter(g => !g.deleted);
  const totalGoals = activeGoals.length;
  const completedProgress = activeGoals.reduce((sum: number, goal: Goal) => {
    return sum + calculateGoalProgress(goal.type, goal.completed, goal.current_value, goal.target_value);
  }, 0);
  const completionPercentage = totalGoals > 0 ? completedProgress / totalGoals : 0;

  return {
    totalGoals,
    completedGoals: activeGoals.filter((g: Goal) =>
      g.type === 'completion' ? g.completed : g.current_value >= (g.target_value || 0)
    ).length,
    completionPercentage: Math.round(completionPercentage)
  };
}

// Get all goal lists from LOCAL DB, fetch from remote if empty
export async function getGoalLists(): Promise<GoalListWithProgress[]> {
  let lists = await db.goalLists.orderBy('created_at').reverse().toArray();

  // If local is empty and online, try to hydrate from remote
  if (lists.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    lists = await db.goalLists.orderBy('created_at').reverse().toArray();
  }

  // Filter out deleted lists
  const activeLists = lists.filter(l => !l.deleted);

  const listsWithProgress: GoalListWithProgress[] = await Promise.all(
    activeLists.map(async (list) => {
      const goals = await db.goals.where('goal_list_id').equals(list.id).toArray();
      return { ...list, ...calculateListProgress(goals) };
    })
  );
  return listsWithProgress;
}

// Get a single goal list from LOCAL DB, fetch from remote if not found
export async function getGoalList(id: string): Promise<(GoalList & { goals: Goal[] }) | null> {
  let list = await db.goalLists.get(id);

  // If not found locally and online, try to fetch from remote
  if (!list && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data: remoteList, error: listError } = await supabase
        .from('goal_lists')
        .select('*')
        .eq('id', id)
        .single();

      if (!listError && remoteList && !remoteList.deleted) {
        await db.goalLists.put(remoteList);
        list = remoteList;

        // Also fetch its goals
        const { data: remoteGoals, error: goalsError } = await supabase
          .from('goals')
          .select('*')
          .eq('goal_list_id', id);

        if (!goalsError && remoteGoals) {
          await db.goals.bulkPut(remoteGoals);
        }
      }
    } catch (e) {
      console.error('Failed to fetch goal list from remote:', e);
    }
  }

  if (!list || list.deleted) return null;

  const goals = await db.goals.where('goal_list_id').equals(id).toArray();
  // Filter out deleted goals and sort by order
  const activeGoals = goals.filter(g => !g.deleted).sort((a, b) => a.order - b.order);
  return { ...list, goals: activeGoals };
}

// Get all daily routine goals from LOCAL DB, fetch from remote if empty
export async function getDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  let routines = await db.dailyRoutineGoals.orderBy('created_at').reverse().toArray();

  // If local is empty and online, try to hydrate from remote
  if (routines.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    routines = await db.dailyRoutineGoals.orderBy('created_at').reverse().toArray();
  }

  return routines.filter(r => !r.deleted);
}

// Get a single daily routine goal from LOCAL DB, fetch from remote if not found
export async function getDailyRoutineGoal(id: string): Promise<DailyRoutineGoal | null> {
  let routine = await db.dailyRoutineGoals.get(id);

  // If not found locally and online, try to fetch from remote
  if (!routine && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data: remoteRoutine, error } = await supabase
        .from('daily_routine_goals')
        .select('*')
        .eq('id', id)
        .single();

      if (!error && remoteRoutine && !remoteRoutine.deleted) {
        await db.dailyRoutineGoals.put(remoteRoutine);
        routine = remoteRoutine;
      }
    } catch (e) {
      console.error('Failed to fetch routine from remote:', e);
    }
  }

  if (!routine || routine.deleted) return null;
  return routine;
}

// Get active routines for a specific date from LOCAL DB, fetch from remote if empty
export async function getActiveRoutinesForDate(date: string): Promise<DailyRoutineGoal[]> {
  let allRoutines = await db.dailyRoutineGoals.toArray();

  // If local is empty and online, try to hydrate from remote
  if (allRoutines.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    allRoutines = await db.dailyRoutineGoals.toArray();
  }

  return allRoutines.filter((routine) => {
    if (routine.deleted) return false;
    if (routine.start_date > date) return false;
    if (routine.end_date && routine.end_date < date) return false;
    return true;
  });
}

// Get daily progress for a specific date from LOCAL DB, fetch from remote if not found
export async function getDailyProgress(date: string): Promise<DailyGoalProgress[]> {
  let progress = await db.dailyGoalProgress.where('date').equals(date).toArray();

  // If no progress locally and online, try to fetch from remote
  if (progress.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data: remoteProgress, error } = await supabase
        .from('daily_goal_progress')
        .select('*')
        .eq('date', date);

      if (!error && remoteProgress && remoteProgress.length > 0) {
        await db.dailyGoalProgress.bulkPut(remoteProgress);
        progress = remoteProgress;
      }
    } catch (e) {
      console.error('Failed to fetch daily progress from remote:', e);
    }
  }

  return progress;
}

// Get month progress from LOCAL DB, fetch from remote if not found
export async function getMonthProgress(year: number, month: number): Promise<DailyGoalProgress[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  let progress = await db.dailyGoalProgress
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  // If no progress locally and online, try to fetch from remote
  if (progress.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data: remoteProgress, error } = await supabase
        .from('daily_goal_progress')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

      if (!error && remoteProgress && remoteProgress.length > 0) {
        await db.dailyGoalProgress.bulkPut(remoteProgress);
        progress = remoteProgress;
      }
    } catch (e) {
      console.error('Failed to fetch month progress from remote:', e);
    }
  }

  return progress;
}

// ============================================================
// SYNC OPERATIONS - Background sync to/from Supabase
// ============================================================

// Schedule a debounced sync after local writes
export function scheduleSyncPush(): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    runFullSync();
  }, SYNC_DEBOUNCE_MS);
}

// Get last sync cursor from localStorage
function getLastSyncCursor(): string {
  if (typeof localStorage === 'undefined') return '1970-01-01T00:00:00.000Z';
  return localStorage.getItem('lastSyncCursor') || '1970-01-01T00:00:00.000Z';
}

// Set last sync cursor
function setLastSyncCursor(cursor: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('lastSyncCursor', cursor);
  }
}

// PULL: Fetch changes from remote since last sync
async function pullRemoteChanges(): Promise<void> {
  const lastSync = getLastSyncCursor();
  const pendingEntityIds = await getPendingEntityIds();

  // Track the newest updated_at we see
  let newestUpdate = lastSync;

  // Pull goal_lists changed since last sync
  const { data: remoteLists, error: listsError } = await supabase
    .from('goal_lists')
    .select('*')
    .gt('updated_at', lastSync);

  if (listsError) throw listsError;

  // Pull goals changed since last sync
  const { data: remoteGoals, error: goalsError } = await supabase
    .from('goals')
    .select('*')
    .gt('updated_at', lastSync);

  if (goalsError) throw goalsError;

  // Pull daily_routine_goals changed since last sync
  const { data: remoteRoutines, error: routinesError } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .gt('updated_at', lastSync);

  if (routinesError) throw routinesError;

  // Pull daily_goal_progress changed since last sync
  const { data: remoteProgress, error: progressError } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .gt('updated_at', lastSync);

  if (progressError) throw progressError;

  // Apply changes to local DB with conflict handling
  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress], async () => {
    // Apply goal_lists
    for (const remote of (remoteLists || [])) {
      // Skip if we have pending ops for this entity (local takes precedence)
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.goalLists.get(remote.id);
      // Accept remote if no local or remote is newer
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.goalLists.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply goals
    for (const remote of (remoteGoals || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.goals.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.goals.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply daily_routine_goals
    for (const remote of (remoteRoutines || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.dailyRoutineGoals.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.dailyRoutineGoals.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply daily_goal_progress
    for (const remote of (remoteProgress || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.dailyGoalProgress.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.dailyGoalProgress.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }
  });

  // Update sync cursor
  setLastSyncCursor(newestUpdate);
}

// PUSH: Send pending operations to remote
async function pushPendingOps(): Promise<void> {
  const pendingItems = await getPendingSync();
  if (pendingItems.length === 0) return;

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
}

// Process a single sync item
async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { table, operation, entityId, payload } = item;

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from(table)
        .insert({ id: entityId, ...payload });
      // Ignore duplicate key errors (item already synced)
      if (error && !error.message.includes('duplicate')) {
        throw error;
      }
      break;
    }
    case 'update': {
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', entityId);
      if (error) throw error;
      break;
    }
    case 'delete': {
      // For deletes, we mark as deleted in Supabase (tombstone)
      const { error } = await supabase
        .from(table)
        .update({ deleted: true, updated_at: payload.updated_at })
        .eq('id', entityId);
      if (error) throw error;
      break;
    }
    case 'increment': {
      // Increment operations use Supabase RPC for atomicity
      // The payload contains: { field: 'current_value', amount: 1, ... }
      const { field, amount, ...otherUpdates } = payload as { field: string; amount: number; [key: string]: unknown };

      // First, try to do an atomic increment using raw SQL or update
      // Since Supabase doesn't have native increment, we fetch, add, update
      const { data: current, error: fetchError } = await supabase
        .from(table)
        .select(field)
        .eq('id', entityId)
        .single();

      if (fetchError) throw fetchError;

      const currentValue = (current as Record<string, number>)[field] || 0;
      const newValue = currentValue + (amount as number);

      const { error: updateError } = await supabase
        .from(table)
        .update({ [field]: newValue, ...otherUpdates })
        .eq('id', entityId);

      if (updateError) throw updateError;
      break;
    }
  }
}

// Full sync: push first (so our changes are persisted), then pull
export async function runFullSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    syncStatusStore.setStatus('offline');
    return;
  }

  try {
    syncStatusStore.setStatus('syncing');

    // Push first so local changes are persisted
    await pushPendingOps();

    // Then pull remote changes
    await pullRemoteChanges();

    const remaining = await getPendingSync();
    syncStatusStore.setStatus(remaining.length > 0 ? 'error' : 'idle');
    syncStatusStore.setLastSyncTime(new Date().toISOString());

    // Notify stores that sync is complete so they can refresh from local
    notifySyncComplete();
  } catch (error) {
    console.error('Sync failed:', error);
    syncStatusStore.setStatus('error');
    syncStatusStore.setError(error instanceof Error ? error.message : 'Sync failed');
  }
}

// Initial hydration: if local DB is empty, pull everything from remote
export async function hydrateFromRemote(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;

  // Check if local DB is empty
  const localListCount = await db.goalLists.count();
  const localRoutineCount = await db.dailyRoutineGoals.count();

  if (localListCount > 0 || localRoutineCount > 0) {
    // Local has data, just do a normal sync
    await runFullSync();
    return;
  }

  // Local is empty, do a full pull
  syncStatusStore.setStatus('syncing');

  try {
    // Pull all goal_lists
    const { data: lists, error: listsError } = await supabase
      .from('goal_lists')
      .select('*')
      .is('deleted', null);
    if (listsError) throw listsError;

    // Pull all goals
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .is('deleted', null);
    if (goalsError) throw goalsError;

    // Pull all daily_routine_goals
    const { data: routines, error: routinesError } = await supabase
      .from('daily_routine_goals')
      .select('*')
      .is('deleted', null);
    if (routinesError) throw routinesError;

    // Pull all daily_goal_progress
    const { data: progress, error: progressError } = await supabase
      .from('daily_goal_progress')
      .select('*');
    if (progressError) throw progressError;

    // Store everything locally
    await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress], async () => {
      if (lists && lists.length > 0) {
        await db.goalLists.bulkPut(lists);
      }
      if (goals && goals.length > 0) {
        await db.goals.bulkPut(goals);
      }
      if (routines && routines.length > 0) {
        await db.dailyRoutineGoals.bulkPut(routines);
      }
      if (progress && progress.length > 0) {
        await db.dailyGoalProgress.bulkPut(progress);
      }
    });

    // Set sync cursor to now
    setLastSyncCursor(new Date().toISOString());
    syncStatusStore.setStatus('idle');
    syncStatusStore.setLastSyncTime(new Date().toISOString());

    // Notify stores
    notifySyncComplete();
  } catch (error) {
    console.error('Hydration failed:', error);
    syncStatusStore.setStatus('error');
  }
}

// ============================================================
// LIFECYCLE
// ============================================================

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return;

  // Handle online event - run sync when connection restored
  const handleOnline = () => {
    runFullSync();
  };
  window.addEventListener('online', handleOnline);

  // Start periodic sync
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      runFullSync();
    }
  }, SYNC_INTERVAL_MS);

  // Initial sync: hydrate if empty, otherwise push pending
  if (navigator.onLine) {
    hydrateFromRemote();
  }
}

export function stopSyncEngine(): void {
  if (typeof window === 'undefined') return;

  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
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
  // Reset sync cursor
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('lastSyncCursor');
  }
}

// Manual sync trigger (for UI button)
export async function performSync(): Promise<void> {
  await runFullSync();
}
