import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getPendingSync, removeSyncItem, incrementRetry } from './queue';
import type { SyncQueueItem, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, GoalListWithProgress } from '$lib/types';
import { syncStatusStore } from '$lib/stores/sync';
import { calculateGoalProgress } from '$lib/utils/colors';

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 1500; // 1.5 seconds debounce for writes

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

async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { table, operation, entityId, payload } = item;

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from(table)
        .insert({ id: entityId, ...payload });
      // Ignore duplicate key errors (item already exists)
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

// Manual sync trigger (for UI button)
export async function performSync(): Promise<void> {
  await pushChanges();
}

// ============================================================
// READ OPERATIONS - Fetch from Supabase when online, cache for offline
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
  const { data: lists, error } = await supabase
    .from('goal_lists')
    .select('*, goals(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Clear and replace local cache with remote data
  await db.transaction('rw', [db.goalLists, db.goals], async () => {
    await db.goalLists.clear();
    await db.goals.clear();

    if (lists && lists.length > 0) {
      for (const list of lists) {
        const { goals, ...listData } = list;
        await db.goalLists.put(listData);
        if (goals && goals.length > 0) {
          await db.goals.bulkPut(goals);
        }
      }
    }
  });

  // Return with progress calculated
  return (lists || []).map((list) => {
    const goals = list.goals || [];
    return { ...list, ...calculateListProgress(goals) };
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
  const { data: list, error: listError } = await supabase
    .from('goal_lists')
    .select('*')
    .eq('id', id)
    .single();

  if (listError) throw listError;
  if (!list) return null;

  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('*')
    .eq('goal_list_id', id)
    .order('order', { ascending: true });

  if (goalsError) throw goalsError;

  // Cache locally
  await db.goalLists.put(list);
  await db.transaction('rw', db.goals, async () => {
    // Remove old goals for this list and add fresh ones
    await db.goals.where('goal_list_id').equals(id).delete();
    if (goals && goals.length > 0) {
      await db.goals.bulkPut(goals);
    }
  });

  return { ...list, goals: goals || [] };
}

// Fetch all daily routine goals
export async function fetchDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return db.dailyRoutineGoals.orderBy('created_at').reverse().toArray();
  }

  // Online: fetch from Supabase
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Clear and replace local cache
  await db.transaction('rw', db.dailyRoutineGoals, async () => {
    await db.dailyRoutineGoals.clear();
    if (data && data.length > 0) {
      await db.dailyRoutineGoals.bulkPut(data);
    }
  });

  return data || [];
}

// Fetch a single daily routine goal
export async function fetchDailyRoutineGoal(id: string): Promise<DailyRoutineGoal | null> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return (await db.dailyRoutineGoals.get(id)) || null;
  }

  // Online: fetch from Supabase
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) return null;

  // Cache locally
  await db.dailyRoutineGoals.put(data);

  return data;
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
  const { data, error } = await supabase
    .from('daily_routine_goals')
    .select('*')
    .lte('start_date', date);

  if (error) throw error;

  const filtered = (data || []).filter((routine: DailyRoutineGoal) => {
    if (routine.end_date && routine.end_date < date) return false;
    return true;
  });

  // Cache all fetched routines
  if (data && data.length > 0) {
    await db.dailyRoutineGoals.bulkPut(data);
  }

  return filtered;
}

// Fetch daily progress for a specific date
export async function fetchDailyProgress(date: string): Promise<DailyGoalProgress[]> {
  // If offline, return from cache
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return db.dailyGoalProgress.where('date').equals(date).toArray();
  }

  // Online: fetch from Supabase
  const { data, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .eq('date', date);

  if (error) throw error;

  // Cache locally (replace for this date)
  if (data) {
    await db.transaction('rw', db.dailyGoalProgress, async () => {
      await db.dailyGoalProgress.where('date').equals(date).delete();
      if (data.length > 0) {
        await db.dailyGoalProgress.bulkPut(data);
      }
    });
  }

  return data || [];
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
  const { data, error } = await supabase
    .from('daily_goal_progress')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw error;

  // Cache locally (replace for this date range)
  if (data) {
    await db.transaction('rw', db.dailyGoalProgress, async () => {
      await db.dailyGoalProgress
        .where('date')
        .between(startDate, endDate, true, true)
        .delete();
      if (data.length > 0) {
        await db.dailyGoalProgress.bulkPut(data);
      }
    });
  }

  return data || [];
}

// ============================================================
// LIFECYCLE - Start/stop sync engine
// ============================================================

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    pushChanges();
  });

  // Push any pending changes on start
  if (navigator.onLine) {
    pushChanges();
  }
}

export function stopSyncEngine(): void {
  if (typeof window === 'undefined') return;

  window.removeEventListener('online', pushChanges);
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
