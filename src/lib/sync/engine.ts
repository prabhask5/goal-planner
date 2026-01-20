import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getPendingSync, removeSyncItem, incrementRetry, getPendingEntityIds, cleanupFailedItems } from './queue';
import type { SyncQueueItem, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, GoalListWithProgress, TaskCategory, Commitment, DailyTask, LongTermTask, LongTermTaskWithCategory } from '$lib/types';
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
let hasHydrated = false; // Track if initial hydration has been attempted
let isTabVisible = true; // Track tab visibility
let visibilityDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 2000; // 2 seconds debounce after writes
const SYNC_INTERVAL_MS = 300000; // 5 minutes periodic sync (reduced frequency)
const VISIBILITY_SYNC_DEBOUNCE_MS = 1000; // Debounce for visibility change syncs

// Promise-based mutex to prevent concurrent syncs (atomic lock)
let syncMutex: Promise<void> = Promise.resolve();
let isSyncLocked = false;

// Store event listener references for cleanup
let handleOnlineRef: (() => void) | null = null;
let handleOfflineRef: (() => void) | null = null;
let handleVisibilityChangeRef: (() => void) | null = null;

async function acquireSyncLock(): Promise<boolean> {
  // If already locked, return false immediately
  if (isSyncLocked) return false;

  // Atomically set the lock by chaining onto the mutex
  let acquired = false;
  const previousMutex = syncMutex;

  syncMutex = previousMutex.then(() => {
    if (!isSyncLocked) {
      isSyncLocked = true;
      acquired = true;
    }
  });

  await syncMutex;
  return acquired;
}

function releaseSyncLock(): void {
  isSyncLocked = false;
}

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

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (lists.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
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
  let routines = await db.dailyRoutineGoals.toArray();

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (routines.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    routines = await db.dailyRoutineGoals.toArray();
  }

  // Sort by order (ascending), filter out deleted
  return routines
    .filter(r => !r.deleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (allRoutines.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    allRoutines = await db.dailyRoutineGoals.toArray();
  }

  return allRoutines
    .filter((routine) => {
      if (routine.deleted) return false;
      if (routine.start_date > date) return false;
      if (routine.end_date && routine.end_date < date) return false;
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
        .eq('date', date)
        .or('deleted.is.null,deleted.eq.false');

      if (!error && remoteProgress && remoteProgress.length > 0) {
        await db.dailyGoalProgress.bulkPut(remoteProgress);
        progress = remoteProgress;
      }
    } catch (e) {
      console.error('Failed to fetch daily progress from remote:', e);
    }
  }

  // Filter out deleted records
  return progress.filter(p => !p.deleted);
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
        .lte('date', endDate)
        .or('deleted.is.null,deleted.eq.false');

      if (!error && remoteProgress && remoteProgress.length > 0) {
        await db.dailyGoalProgress.bulkPut(remoteProgress);
        progress = remoteProgress;
      }
    } catch (e) {
      console.error('Failed to fetch month progress from remote:', e);
    }
  }

  // Filter out deleted records
  return progress.filter(p => !p.deleted);
}

// ============================================================
// TASKS FEATURE LOCAL READ OPERATIONS
// ============================================================

// Get all task categories from LOCAL DB
export async function getTaskCategories(): Promise<TaskCategory[]> {
  let categories = await db.taskCategories.toArray();

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (categories.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    categories = await db.taskCategories.toArray();
  }

  // Sort by order, filter out deleted
  return categories
    .filter(c => !c.deleted)
    .sort((a, b) => a.order - b.order);
}

// Get all commitments from LOCAL DB
export async function getCommitments(): Promise<Commitment[]> {
  let commitments = await db.commitments.toArray();

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (commitments.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    commitments = await db.commitments.toArray();
  }

  // Sort by order, filter out deleted
  return commitments
    .filter(c => !c.deleted)
    .sort((a, b) => a.order - b.order);
}

// Get all daily tasks from LOCAL DB
export async function getDailyTasks(): Promise<DailyTask[]> {
  let tasks = await db.dailyTasks.toArray();

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (tasks.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    tasks = await db.dailyTasks.toArray();
  }

  // Sort by order, filter out deleted
  return tasks
    .filter(t => !t.deleted)
    .sort((a, b) => a.order - b.order);
}

// Get all long-term tasks from LOCAL DB with optional category join
export async function getLongTermTasks(): Promise<LongTermTaskWithCategory[]> {
  let tasks = await db.longTermTasks.toArray();

  // If local is empty and online and we haven't tried hydrating yet, try to hydrate from remote
  if (tasks.length === 0 && !hasHydrated && typeof navigator !== 'undefined' && navigator.onLine) {
    await hydrateFromRemote();
    tasks = await db.longTermTasks.toArray();
  }

  // Filter out deleted
  const activeTasks = tasks.filter(t => !t.deleted);

  // Get all categories for joining
  const categories = await db.taskCategories.toArray();
  const categoryMap = new Map<string, TaskCategory>();
  for (const cat of categories) {
    if (!cat.deleted) {
      categoryMap.set(cat.id, cat);
    }
  }

  // Join with categories
  return activeTasks.map(task => ({
    ...task,
    category: task.category_id ? categoryMap.get(task.category_id) : undefined
  }));
}

// Get a single long-term task from LOCAL DB
export async function getLongTermTask(id: string): Promise<LongTermTaskWithCategory | null> {
  const task = await db.longTermTasks.get(id);
  if (!task || task.deleted) return null;

  let category: TaskCategory | undefined;
  if (task.category_id) {
    const cat = await db.taskCategories.get(task.category_id);
    if (cat && !cat.deleted) {
      category = cat;
    }
  }

  return { ...task, category };
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
    runFullSync(false); // Show syncing indicator for user-triggered writes
  }, SYNC_DEBOUNCE_MS);
}

// Get current user ID for sync cursor isolation
async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// Get last sync cursor from localStorage (per-user to prevent cross-user sync issues)
function getLastSyncCursor(userId: string | null): string {
  if (typeof localStorage === 'undefined') return '1970-01-01T00:00:00.000Z';
  const key = userId ? `lastSyncCursor_${userId}` : 'lastSyncCursor';
  return localStorage.getItem(key) || '1970-01-01T00:00:00.000Z';
}

// Set last sync cursor (per-user)
function setLastSyncCursor(cursor: string, userId: string | null): void {
  if (typeof localStorage !== 'undefined') {
    const key = userId ? `lastSyncCursor_${userId}` : 'lastSyncCursor';
    localStorage.setItem(key, cursor);
  }
}

// PULL: Fetch changes from remote since last sync
async function pullRemoteChanges(): Promise<void> {
  const userId = await getCurrentUserId();

  // Abort if no authenticated user (avoids confusing RLS errors)
  if (!userId) {
    throw new Error('Not authenticated. Please sign in to sync.');
  }

  const lastSync = getLastSyncCursor(userId);
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

  // Pull task_categories changed since last sync
  const { data: remoteCategories, error: categoriesError } = await supabase
    .from('task_categories')
    .select('*')
    .gt('updated_at', lastSync);

  if (categoriesError) throw categoriesError;

  // Pull commitments changed since last sync
  const { data: remoteCommitments, error: commitmentsError } = await supabase
    .from('commitments')
    .select('*')
    .gt('updated_at', lastSync);

  if (commitmentsError) throw commitmentsError;

  // Pull daily_tasks changed since last sync
  const { data: remoteDailyTasks, error: dailyTasksError } = await supabase
    .from('daily_tasks')
    .select('*')
    .gt('updated_at', lastSync);

  if (dailyTasksError) throw dailyTasksError;

  // Pull long_term_tasks changed since last sync
  const { data: remoteLongTermTasks, error: longTermTasksError } = await supabase
    .from('long_term_tasks')
    .select('*')
    .gt('updated_at', lastSync);

  if (longTermTasksError) throw longTermTasksError;

  // Apply changes to local DB with conflict handling
  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks], async () => {
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

    // Apply task_categories
    for (const remote of (remoteCategories || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.taskCategories.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.taskCategories.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply commitments
    for (const remote of (remoteCommitments || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.commitments.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.commitments.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply daily_tasks
    for (const remote of (remoteDailyTasks || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.dailyTasks.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.dailyTasks.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply long_term_tasks
    for (const remote of (remoteLongTermTasks || [])) {
      if (pendingEntityIds.has(remote.id)) continue;

      const local = await db.longTermTasks.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.longTermTasks.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }
  });

  // Update sync cursor (per-user)
  setLastSyncCursor(newestUpdate, userId);
}

// PUSH: Send pending operations to remote
// Continues until queue is empty to catch items added during sync
async function pushPendingOps(): Promise<void> {
  const maxIterations = 10; // Safety limit to prevent infinite loops
  let iterations = 0;

  while (iterations < maxIterations) {
    const pendingItems = await getPendingSync();
    if (pendingItems.length === 0) break;

    iterations++;
    let processedAny = false;

    for (const item of pendingItems) {
      try {
        await processSyncItem(item);
        if (item.id) {
          await removeSyncItem(item.id);
          processedAny = true;
        }
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        if (item.id) {
          await incrementRetry(item.id);
        }
      }
    }

    // If we didn't process anything (all items in backoff), stop iterating
    if (!processedAny) break;
  }
}

// Check if error is a duplicate key violation (item already exists)
function isDuplicateKeyError(error: { code?: string; message?: string }): boolean {
  // PostgreSQL error code for unique violation
  if (error.code === '23505') return true;
  // PostgREST error codes
  if (error.code === 'PGRST409') return true;
  // Fallback to message check for compatibility
  const msg = (error.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists');
}

// Check if error is a "not found" error (item doesn't exist)
function isNotFoundError(error: { code?: string; message?: string }): boolean {
  // PostgREST error code for no rows affected/found
  if (error.code === 'PGRST116') return true;
  // HTTP 404 style code
  if (error.code === '404') return true;
  // Fallback to message check
  const msg = (error.message || '').toLowerCase();
  return msg.includes('not found') || msg.includes('no rows');
}

// Process a single sync item
async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { table, operation, entityId, payload } = item;

  switch (operation) {
    case 'create': {
      const { error } = await supabase
        .from(table)
        .insert({ id: entityId, ...payload });
      // Ignore duplicate key errors (item already synced from another device)
      if (error && !isDuplicateKeyError(error)) {
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
      // Soft delete on Supabase - set deleted=true so other devices can pull the deletion
      // This replaces the old hard delete which broke multi-device sync
      const { error } = await supabase
        .from(table)
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq('id', entityId);
      // Ignore "not found" errors - item may already be deleted by another device
      if (error && !isNotFoundError(error)) {
        throw error;
      }
      break;
    }
  }
}

// Parse error into user-friendly message
function parseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Network errors
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
      return 'Network connection lost. Changes saved locally.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'Server took too long to respond. Will retry.';
    }

    // Auth errors
    if (msg.includes('jwt') || msg.includes('token') || msg.includes('unauthorized') || msg.includes('401')) {
      return 'Session expired. Please sign in again.';
    }

    // Rate limiting
    if (msg.includes('rate') || msg.includes('limit') || msg.includes('429')) {
      return 'Too many requests. Will retry shortly.';
    }

    // Server errors
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return 'Server is temporarily unavailable.';
    }

    // Return clean error message
    return error.message.length > 100 ? error.message.substring(0, 100) + '...' : error.message;
  }
  return 'An unexpected error occurred';
}

// Full sync: push first (so our changes are persisted), then pull
// quiet: if true, don't update UI status at all (for background periodic syncs)
export async function runFullSync(quiet: boolean = false): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    if (!quiet) {
      syncStatusStore.setStatus('offline');
      syncStatusStore.setSyncMessage('You\'re offline. Changes will sync when reconnected.');
    }
    return;
  }

  // Atomically acquire sync lock to prevent concurrent syncs
  const acquired = await acquireSyncLock();
  if (!acquired) return;

  let pushSucceeded = false;
  let pullSucceeded = false;

  try {
    // Check if there are pending items
    const pendingItems = await getPendingSync();

    // Only show "syncing" indicator for non-quiet syncs
    if (!quiet) {
      syncStatusStore.setStatus('syncing');
      if (pendingItems.length > 0) {
        syncStatusStore.setSyncMessage(`Uploading ${pendingItems.length} change${pendingItems.length === 1 ? '' : 's'}...`);
      } else {
        syncStatusStore.setSyncMessage('Checking for updates...');
      }
    }

    // Push first so local changes are persisted
    await pushPendingOps();
    pushSucceeded = true;

    if (!quiet) {
      syncStatusStore.setSyncMessage('Downloading latest data...');
    }

    // Then pull remote changes - retry up to 3 times if push succeeded
    let pullAttempts = 0;
    const maxPullAttempts = 3;
    let lastPullError: unknown = null;

    while (pullAttempts < maxPullAttempts && !pullSucceeded) {
      try {
        await pullRemoteChanges();
        pullSucceeded = true;
      } catch (pullError) {
        lastPullError = pullError;
        pullAttempts++;
        if (pullAttempts < maxPullAttempts) {
          // Wait before retry (exponential backoff: 1s, 2s)
          await new Promise(resolve => setTimeout(resolve, pullAttempts * 1000));
        }
      }
    }

    if (!pullSucceeded && lastPullError) {
      throw lastPullError;
    }

    // Update status only for non-quiet syncs
    if (!quiet) {
      const remaining = await getPendingSync();
      syncStatusStore.setPendingCount(remaining.length);
      syncStatusStore.setStatus(remaining.length > 0 ? 'error' : 'idle');
      syncStatusStore.setLastSyncTime(new Date().toISOString());
      syncStatusStore.setSyncMessage(remaining.length > 0
        ? `${remaining.length} change${remaining.length === 1 ? '' : 's'} failed to sync`
        : 'Everything is synced!');
      syncStatusStore.setError(null);
    }

    // Notify stores that sync is complete so they can refresh from local
    notifySyncComplete();
  } catch (error) {
    console.error('Sync failed:', error);

    // Only show errors for user-initiated syncs (non-quiet)
    // Background syncs fail silently - they'll retry automatically
    if (!quiet) {
      const friendlyMessage = parseErrorMessage(error);
      const rawMessage = error instanceof Error ? error.message : String(error);
      syncStatusStore.setStatus('error');
      syncStatusStore.setError(friendlyMessage, rawMessage);
      syncStatusStore.setSyncMessage(friendlyMessage);
    }

    // If push succeeded but pull failed, still notify so UI refreshes with pushed data
    if (pushSucceeded && !pullSucceeded) {
      notifySyncComplete();
    }
  } finally {
    releaseSyncLock();
  }
}

// Initial hydration: if local DB is empty, pull everything from remote
export async function hydrateFromRemote(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;

  // Atomically acquire sync lock to prevent concurrent syncs/hydrations
  const acquired = await acquireSyncLock();
  if (!acquired) return;

  // Get user ID for sync cursor isolation
  const userId = await getCurrentUserId();

  // Abort if no authenticated user (can't hydrate without auth)
  if (!userId) {
    releaseSyncLock();
    return;
  }

  // Mark that we've attempted hydration (even if local has data)
  hasHydrated = true;

  // Check if local DB is empty
  const localListCount = await db.goalLists.count();
  const localRoutineCount = await db.dailyRoutineGoals.count();
  const localDailyTaskCount = await db.dailyTasks.count();
  const localLongTermTaskCount = await db.longTermTasks.count();

  if (localListCount > 0 || localRoutineCount > 0 || localDailyTaskCount > 0 || localLongTermTaskCount > 0) {
    // Local has data, release lock and do a normal sync
    releaseSyncLock();
    await runFullSync();
    return;
  }

  // Local is empty, do a full pull (we already hold the lock)
  syncStatusStore.setStatus('syncing');
  syncStatusStore.setSyncMessage('Loading your data...');

  try {
    // Pull all non-deleted records from each table
    // Filter deleted = false OR deleted IS NULL to exclude tombstones
    const { data: lists, error: listsError } = await supabase
      .from('goal_lists')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (listsError) throw listsError;

    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (goalsError) throw goalsError;

    const { data: routines, error: routinesError } = await supabase
      .from('daily_routine_goals')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (routinesError) throw routinesError;

    const { data: progress, error: progressError } = await supabase
      .from('daily_goal_progress')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (progressError) throw progressError;

    const { data: categories, error: categoriesError } = await supabase
      .from('task_categories')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (categoriesError) throw categoriesError;

    const { data: commitments, error: commitmentsError } = await supabase
      .from('commitments')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (commitmentsError) throw commitmentsError;

    const { data: dailyTasks, error: dailyTasksError } = await supabase
      .from('daily_tasks')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (dailyTasksError) throw dailyTasksError;

    const { data: longTermTasks, error: longTermTasksError } = await supabase
      .from('long_term_tasks')
      .select('*')
      .or('deleted.is.null,deleted.eq.false');
    if (longTermTasksError) throw longTermTasksError;

    // Calculate the max updated_at from all pulled data to use as sync cursor
    // This prevents missing changes that happened during hydration
    let maxUpdatedAt = '1970-01-01T00:00:00.000Z';
    const allData = [
      ...(lists || []),
      ...(goals || []),
      ...(routines || []),
      ...(progress || []),
      ...(categories || []),
      ...(commitments || []),
      ...(dailyTasks || []),
      ...(longTermTasks || [])
    ];
    for (const item of allData) {
      if (item.updated_at && item.updated_at > maxUpdatedAt) {
        maxUpdatedAt = item.updated_at;
      }
    }

    // Store everything locally
    await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks], async () => {
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
      if (categories && categories.length > 0) {
        await db.taskCategories.bulkPut(categories);
      }
      if (commitments && commitments.length > 0) {
        await db.commitments.bulkPut(commitments);
      }
      if (dailyTasks && dailyTasks.length > 0) {
        await db.dailyTasks.bulkPut(dailyTasks);
      }
      if (longTermTasks && longTermTasks.length > 0) {
        await db.longTermTasks.bulkPut(longTermTasks);
      }
    });

    // Set sync cursor to MAX of pulled data timestamps (prevents missing concurrent changes)
    setLastSyncCursor(maxUpdatedAt, userId);
    syncStatusStore.setStatus('idle');
    syncStatusStore.setLastSyncTime(new Date().toISOString());
    syncStatusStore.setSyncMessage('Everything is synced!');
    syncStatusStore.setError(null);

    // Notify stores
    notifySyncComplete();
  } catch (error) {
    console.error('Hydration failed:', error);
    const friendlyMessage = parseErrorMessage(error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    syncStatusStore.setStatus('error');
    syncStatusStore.setError(friendlyMessage, rawMessage);
    syncStatusStore.setSyncMessage(friendlyMessage);
    // Reset hasHydrated so next read attempt can retry hydration
    hasHydrated = false;
  } finally {
    releaseSyncLock();
  }
}

// ============================================================
// TOMBSTONE CLEANUP
// ============================================================

// Clean up old tombstones (deleted records) from local DB AND Supabase
// This prevents indefinite accumulation of soft-deleted records
const TOMBSTONE_MAX_AGE_DAYS = 30;
const CLEANUP_INTERVAL_MS = 86400000; // 24 hours - only run server cleanup once per day
let lastServerCleanup = 0;

// Clean up old tombstones from LOCAL IndexedDB
async function cleanupLocalTombstones(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - TOMBSTONE_MAX_AGE_DAYS);
  const cutoffStr = cutoffDate.toISOString();

  try {
    await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks], async () => {
      // Delete old tombstones from each table
      await db.goalLists.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.goals.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.dailyRoutineGoals.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.dailyGoalProgress.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.taskCategories.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.commitments.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.dailyTasks.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
      await db.longTermTasks.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
    });
  } catch (error) {
    console.error('Failed to cleanup local tombstones:', error);
  }
}

// Clean up old tombstones from SUPABASE (runs once per day max)
async function cleanupServerTombstones(): Promise<void> {
  // Only run once per day to avoid unnecessary requests
  const now = Date.now();
  if (now - lastServerCleanup < CLEANUP_INTERVAL_MS) return;

  if (typeof navigator === 'undefined' || !navigator.onLine) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - TOMBSTONE_MAX_AGE_DAYS);
  const cutoffStr = cutoffDate.toISOString();

  const tables = [
    'goal_lists',
    'goals',
    'daily_routine_goals',
    'daily_goal_progress',
    'task_categories',
    'commitments',
    'daily_tasks',
    'long_term_tasks'
  ];

  try {
    for (const table of tables) {
      await supabase
        .from(table)
        .delete()
        .eq('deleted', true)
        .lt('updated_at', cutoffStr);
    }
    lastServerCleanup = now;
  } catch (error) {
    console.error('Failed to cleanup server tombstones:', error);
  }
}

// Combined cleanup function
async function cleanupOldTombstones(): Promise<void> {
  await cleanupLocalTombstones();
  await cleanupServerTombstones();
}

// ============================================================
// LIFECYCLE
// ============================================================

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return;

  // Clean up any existing listeners first (prevents duplicates if called multiple times)
  if (handleOnlineRef) {
    window.removeEventListener('online', handleOnlineRef);
  }
  if (handleOfflineRef) {
    window.removeEventListener('offline', handleOfflineRef);
  }
  if (handleVisibilityChangeRef) {
    document.removeEventListener('visibilitychange', handleVisibilityChangeRef);
  }

  // Handle online event - run sync when connection restored (show indicator)
  handleOnlineRef = () => {
    runFullSync(false);
  };
  window.addEventListener('online', handleOnlineRef);

  // Handle offline event - immediately update status indicator
  handleOfflineRef = () => {
    syncStatusStore.setStatus('offline');
    syncStatusStore.setSyncMessage('You\'re offline. Changes will sync when reconnected.');
  };
  window.addEventListener('offline', handleOfflineRef);

  // Track visibility and sync when returning to tab (with debounce to prevent rapid syncs)
  handleVisibilityChangeRef = () => {
    const wasHidden = !isTabVisible;
    isTabVisible = !document.hidden;
    syncStatusStore.setTabVisible(isTabVisible);

    // If tab just became visible, do a quiet sync to get fresh data (debounced)
    if (wasHidden && isTabVisible && navigator.onLine) {
      // Clear any pending visibility sync
      if (visibilityDebounceTimeout) {
        clearTimeout(visibilityDebounceTimeout);
      }
      // Debounce to prevent rapid syncs when user quickly switches tabs
      visibilityDebounceTimeout = setTimeout(() => {
        visibilityDebounceTimeout = null;
        runFullSync(true); // Quiet - no error shown if it fails
      }, VISIBILITY_SYNC_DEBOUNCE_MS);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChangeRef);

  // Set initial visibility state
  isTabVisible = !document.hidden;
  syncStatusStore.setTabVisible(isTabVisible);

  // Start periodic sync (quiet mode - don't show indicator unless needed)
  syncInterval = setInterval(async () => {
    // Only run periodic sync if tab is visible and online
    if (navigator.onLine && isTabVisible) {
      runFullSync(true); // Quiet background sync
    }

    // Cleanup old tombstones and failed sync items periodically
    await cleanupOldTombstones();
    const failedResult = await cleanupFailedItems();

    // Notify user if items permanently failed
    if (failedResult.count > 0) {
      syncStatusStore.setStatus('error');
      syncStatusStore.setError(
        `${failedResult.count} change(s) could not be synced and were discarded.`,
        `Affected: ${failedResult.tables.join(', ')}`
      );
      syncStatusStore.setSyncMessage(`${failedResult.count} change(s) failed to sync`);
    }
  }, SYNC_INTERVAL_MS);

  // Initial sync: hydrate if empty, otherwise push pending
  if (navigator.onLine) {
    hydrateFromRemote();
  }

  // Run initial cleanup
  cleanupOldTombstones();
  cleanupFailedItems().then(failedResult => {
    if (failedResult.count > 0) {
      syncStatusStore.setStatus('error');
      syncStatusStore.setError(
        `${failedResult.count} change(s) could not be synced and were discarded.`,
        `Affected: ${failedResult.tables.join(', ')}`
      );
    }
  });
}

export function stopSyncEngine(): void {
  if (typeof window === 'undefined') return;

  // Remove event listeners to prevent memory leaks
  if (handleOnlineRef) {
    window.removeEventListener('online', handleOnlineRef);
    handleOnlineRef = null;
  }
  if (handleOfflineRef) {
    window.removeEventListener('offline', handleOfflineRef);
    handleOfflineRef = null;
  }
  if (handleVisibilityChangeRef) {
    document.removeEventListener('visibilitychange', handleVisibilityChangeRef);
    handleVisibilityChangeRef = null;
  }

  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (visibilityDebounceTimeout) {
    clearTimeout(visibilityDebounceTimeout);
    visibilityDebounceTimeout = null;
  }
  releaseSyncLock();
  hasHydrated = false;
}

// Clear local cache (for logout)
export async function clearLocalCache(): Promise<void> {
  // Get user ID before clearing to remove their sync cursor
  const userId = await getCurrentUserId();

  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.syncQueue, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks], async () => {
    await db.goalLists.clear();
    await db.goals.clear();
    await db.dailyRoutineGoals.clear();
    await db.dailyGoalProgress.clear();
    await db.taskCategories.clear();
    await db.commitments.clear();
    await db.dailyTasks.clear();
    await db.longTermTasks.clear();
    await db.syncQueue.clear();
  });
  // Reset sync cursor (user-specific) and hydration flag
  if (typeof localStorage !== 'undefined') {
    // Remove user-specific cursor if we have userId
    if (userId) {
      localStorage.removeItem(`lastSyncCursor_${userId}`);
    }
    // Also remove legacy cursor for cleanup
    localStorage.removeItem('lastSyncCursor');
  }
  hasHydrated = false;
}

// Manual sync trigger (for UI button / pull-to-refresh)
export async function performSync(): Promise<void> {
  await runFullSync(false); // Always show syncing indicator for manual sync
}
