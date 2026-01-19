import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getPendingSync, removeSyncItem, incrementRetry } from './queue';
import { isRemoteNewer } from './conflicts';
import type { SyncQueueItem, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress } from '$lib/types';
import { syncStatusStore } from '$lib/stores/sync';

let syncInProgress = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;

// Start the sync engine
export function startSyncEngine(): void {
  if (syncInterval) return;

  // Initial sync
  performSync();

  // Sync every 30 seconds when online
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      performSync();
    }
  }, 30000);

  // Listen for online/offline events
  window.addEventListener('online', performSync);
}

// Stop the sync engine
export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  window.removeEventListener('online', performSync);
}

// Main sync function
export async function performSync(): Promise<void> {
  if (syncInProgress || !navigator.onLine) {
    syncStatusStore.setStatus(navigator.onLine ? 'idle' : 'offline');
    return;
  }

  syncInProgress = true;
  syncStatusStore.setStatus('syncing');

  try {
    // Push local changes to remote
    await pushChanges();

    // Pull remote changes to local
    await pullChanges();

    syncStatusStore.setStatus('idle');
  } catch (error) {
    console.error('Sync error:', error);
    syncStatusStore.setStatus('error');
    syncStatusStore.setError(error instanceof Error ? error.message : 'Sync failed');
  } finally {
    syncInProgress = false;
    // Update pending count
    const pending = await getPendingSync();
    syncStatusStore.setPendingCount(pending.length);
  }
}

// Push local changes to Supabase
async function pushChanges(): Promise<void> {
  const pendingItems = await getPendingSync();

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
}

async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { table, operation, entityId, payload } = item;

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from(table)
        .insert({ id: entityId, ...payload });
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
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', entityId);
      if (error) throw error;
      break;
    }
  }
}

// Pull remote changes to local IndexedDB
async function pullChanges(): Promise<void> {
  // Get last sync timestamp from local storage
  const lastSync = localStorage.getItem('lastSyncTimestamp') || '1970-01-01T00:00:00Z';

  await Promise.all([
    pullGoalLists(lastSync),
    pullGoals(lastSync),
    pullDailyRoutineGoals(lastSync),
    pullDailyGoalProgress(lastSync)
  ]);

  // Update last sync timestamp
  localStorage.setItem('lastSyncTimestamp', new Date().toISOString());
}

async function pullGoalLists(since: string): Promise<void> {
  const { data, error } = await supabase
    .from('goal_lists')
    .select('*')
    .gte('updated_at', since);

  if (error) throw error;
  if (!data) return;

  for (const remote of data as GoalList[]) {
    const local = await db.goalLists.get(remote.id);
    if (!local || isRemoteNewer(local, remote)) {
      await db.goalLists.put(remote);
    }
  }
}

async function pullGoals(since: string): Promise<void> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .gte('updated_at', since);

  if (error) throw error;
  if (!data) return;

  for (const remote of data as Goal[]) {
    const local = await db.goals.get(remote.id);
    if (!local || isRemoteNewer(local, remote)) {
      await db.goals.put(remote);
    }
  }
}

async function pullDailyRoutineGoals(since: string): Promise<void> {
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .gte('updated_at', since);

  if (error) throw error;
  if (!data) return;

  for (const remote of data as DailyRoutineGoal[]) {
    const local = await db.dailyRoutineGoals.get(remote.id);
    if (!local || isRemoteNewer(local, remote)) {
      await db.dailyRoutineGoals.put(remote);
    }
  }
}

async function pullDailyGoalProgress(since: string): Promise<void> {
  const { data, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .gte('updated_at', since);

  if (error) throw error;
  if (!data) return;

  for (const remote of data as DailyGoalProgress[]) {
    const local = await db.dailyGoalProgress.get(remote.id);
    if (!local || isRemoteNewer(local, remote)) {
      await db.dailyGoalProgress.put(remote);
    }
  }
}

// Full sync - pulls all data (used for initial load)
export async function fullSync(): Promise<void> {
  if (!navigator.onLine) return;

  syncInProgress = true;
  syncStatusStore.setStatus('syncing');

  try {
    const { data: goalLists } = await supabase.from('goal_lists').select('*');
    const { data: goals } = await supabase.from('goals').select('*');
    const { data: routines } = await supabase.from('daily_routine_goals').select('*');
    const { data: progress } = await supabase.from('daily_goal_progress').select('*');

    await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress], async () => {
      if (goalLists) {
        for (const item of goalLists) {
          await db.goalLists.put(item);
        }
      }
      if (goals) {
        for (const item of goals) {
          await db.goals.put(item);
        }
      }
      if (routines) {
        for (const item of routines) {
          await db.dailyRoutineGoals.put(item);
        }
      }
      if (progress) {
        for (const item of progress) {
          await db.dailyGoalProgress.put(item);
        }
      }
    });

    localStorage.setItem('lastSyncTimestamp', new Date().toISOString());
    syncStatusStore.setStatus('idle');
  } catch (error) {
    console.error('Full sync error:', error);
    syncStatusStore.setStatus('error');
  } finally {
    syncInProgress = false;
  }
}

// Handle deleted items from remote
export async function syncDeletedItems(): Promise<void> {
  // This would require tracking deletions on the server side
  // For now, we rely on the user to manage deletions
  // A production app would have a "deleted_at" soft delete pattern
}
