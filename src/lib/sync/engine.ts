import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getPendingSync, removeSyncItem, incrementRetry, getPendingEntityIds, cleanupFailedItems, coalescePendingOps } from './queue';
import type { SyncQueueItem, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, GoalListWithProgress, TaskCategory, Commitment, DailyTask, LongTermTask, LongTermTaskWithCategory, FocusSettings, FocusSession, BlockList, BlockedWebsite } from '$lib/types';
import { syncStatusStore } from '$lib/stores/sync';
import { calculateGoalProgressCapped } from '$lib/utils/colors';
import { isRoutineActiveOnDate } from '$lib/utils/dates';

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

// Track if we were recently offline (for auth validation on reconnect)
let wasOffline = false;
let authValidatedAfterReconnect = true; // Start as true (no validation needed initially)

/**
 * Clear all pending sync operations (used when auth is invalid)
 * SECURITY: Called when offline credentials are found to be invalid
 * to prevent unauthorized data from being synced to the server
 */
export async function clearPendingSyncQueue(): Promise<number> {
  try {
    const count = await db.syncQueue.count();
    await db.syncQueue.clear();
    console.log(`[SYNC] Cleared ${count} pending sync operations (auth invalid)`);
    return count;
  } catch (e) {
    console.error('[SYNC] Failed to clear sync queue:', e);
    return 0;
  }
}

/**
 * Mark that we need auth validation before next sync
 * Called when going offline
 */
export function markOffline(): void {
  wasOffline = true;
  authValidatedAfterReconnect = false;
}

/**
 * Mark auth as validated (safe to sync)
 * Called after successful credential validation on reconnect
 */
export function markAuthValidated(): void {
  authValidatedAfterReconnect = true;
  wasOffline = false;
}

/**
 * Check if auth needs validation before syncing
 */
export function needsAuthValidation(): boolean {
  return wasOffline && !authValidatedAfterReconnect;
}

// ============================================================
// EGRESS MONITORING - Track sync cycles for debugging
// ============================================================
interface SyncCycleStats {
  timestamp: string;
  trigger: string;
  pushedItems: number;
  pulledTables: number;
  pulledRecords: number;
  egressBytes: number;
  durationMs: number;
}

const syncStats: SyncCycleStats[] = [];
let totalSyncCycles = 0;

// Egress tracking
interface EgressStats {
  totalBytes: number;
  totalRecords: number;
  byTable: Record<string, { bytes: number; records: number }>;
  sessionStart: string;
}

const egressStats: EgressStats = {
  totalBytes: 0,
  totalRecords: 0,
  byTable: {},
  sessionStart: new Date().toISOString()
};

// Helper to estimate JSON size in bytes
function estimateJsonSize(data: unknown): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    // Fallback: rough estimate based on JSON string length
    return JSON.stringify(data).length;
  }
}

// Track egress for a table
function trackEgress(tableName: string, data: unknown[] | null): { bytes: number; records: number } {
  if (!data || data.length === 0) {
    return { bytes: 0, records: 0 };
  }

  const bytes = estimateJsonSize(data);
  const records = data.length;

  // Update totals
  egressStats.totalBytes += bytes;
  egressStats.totalRecords += records;

  // Update per-table stats
  if (!egressStats.byTable[tableName]) {
    egressStats.byTable[tableName] = { bytes: 0, records: 0 };
  }
  egressStats.byTable[tableName].bytes += bytes;
  egressStats.byTable[tableName].records += records;

  return { bytes, records };
}

// Format bytes for display
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function logSyncCycle(stats: Omit<SyncCycleStats, 'timestamp'>) {
  const entry: SyncCycleStats = {
    ...stats,
    timestamp: new Date().toISOString(),
  };
  syncStats.push(entry);
  totalSyncCycles++;

  // Keep only last 100 entries
  if (syncStats.length > 100) {
    syncStats.shift();
  }

  console.log(
    `[SYNC] Cycle #${totalSyncCycles}: ` +
    `trigger=${stats.trigger}, pushed=${stats.pushedItems}, ` +
    `pulled=${stats.pulledRecords} records (${formatBytes(stats.egressBytes)}), ${stats.durationMs}ms`
  );
}

// Export for debugging in browser console: window.__stellarSyncStats?.()
// Also: window.__stellarTombstones?.() or window.__stellarTombstones?.({ cleanup: true, force: true })
// Also: window.__stellarEgress?.()
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__stellarSyncStats = () => {
    const recentMinute = syncStats.filter(s =>
      new Date(s.timestamp).getTime() > Date.now() - 60000
    );
    console.log('=== STELLAR SYNC STATS ===');
    console.log(`Total cycles: ${totalSyncCycles}`);
    console.log(`Last minute: ${recentMinute.length} cycles`);
    console.log(`Recent cycles:`, syncStats.slice(-10));
    return { totalSyncCycles, recentMinute: recentMinute.length, recent: syncStats.slice(-10) };
  };

  (window as unknown as Record<string, unknown>).__stellarEgress = () => {
    console.log('=== STELLAR EGRESS STATS ===');
    console.log(`Session started: ${egressStats.sessionStart}`);
    console.log(`Total egress: ${formatBytes(egressStats.totalBytes)} (${egressStats.totalRecords} records)`);
    console.log('');
    console.log('--- BY TABLE ---');

    // Sort tables by bytes descending
    const sortedTables = Object.entries(egressStats.byTable)
      .sort(([, a], [, b]) => b.bytes - a.bytes);

    for (const [table, stats] of sortedTables) {
      const pct = egressStats.totalBytes > 0
        ? ((stats.bytes / egressStats.totalBytes) * 100).toFixed(1)
        : '0';
      console.log(`  ${table}: ${formatBytes(stats.bytes)} (${stats.records} records, ${pct}%)`);
    }

    console.log('');
    console.log('--- RECENT SYNC CYCLES ---');
    const recent = syncStats.slice(-5);
    for (const cycle of recent) {
      console.log(`  ${cycle.timestamp}: ${formatBytes(cycle.egressBytes)} (${cycle.pulledRecords} records)`);
    }

    return {
      sessionStart: egressStats.sessionStart,
      totalBytes: egressStats.totalBytes,
      totalFormatted: formatBytes(egressStats.totalBytes),
      totalRecords: egressStats.totalRecords,
      byTable: egressStats.byTable,
      recentCycles: syncStats.slice(-10)
    };
  };

  // Tombstone debug - will be initialized after debugTombstones function is defined
  // See below where it's assigned after the function definition
}

// Column definitions for each table (explicit to reduce egress vs select('*'))
const COLUMNS = {
  goal_lists: 'id,user_id,name,created_at,updated_at,deleted',
  goals: 'id,goal_list_id,name,type,target_value,current_value,completed,order,created_at,updated_at,deleted',
  daily_routine_goals: 'id,user_id,name,type,target_value,start_date,end_date,active_days,order,created_at,updated_at,deleted',
  daily_goal_progress: 'id,daily_routine_goal_id,date,current_value,completed,updated_at,deleted',
  task_categories: 'id,user_id,name,color,order,created_at,updated_at,deleted',
  commitments: 'id,user_id,name,section,order,created_at,updated_at,deleted',
  daily_tasks: 'id,user_id,name,order,completed,created_at,updated_at,deleted',
  long_term_tasks: 'id,user_id,name,due_date,category_id,completed,created_at,updated_at,deleted',
  focus_settings: 'id,user_id,focus_duration,break_duration,long_break_duration,cycles_before_long_break,auto_start_breaks,auto_start_focus,created_at,updated_at,deleted',
  focus_sessions: 'id,user_id,started_at,ended_at,phase,status,current_cycle,total_cycles,focus_duration,break_duration,phase_started_at,phase_remaining_ms,elapsed_duration,created_at,updated_at,deleted',
  block_lists: 'id,user_id,name,active_days,is_enabled,order,created_at,updated_at,deleted',
  blocked_websites: 'id,block_list_id,domain,created_at,updated_at,deleted'
} as const;

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let hasHydrated = false; // Track if initial hydration has been attempted
let isTabVisible = true; // Track tab visibility
let visibilityDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
let tabHiddenAt: number | null = null; // Track when tab became hidden for smart sync
const SYNC_DEBOUNCE_MS = 2000; // 2 seconds debounce after writes
const SYNC_INTERVAL_MS = 900000; // 15 minutes periodic sync (optimized for single user egress)
const VISIBILITY_SYNC_DEBOUNCE_MS = 1000; // Debounce for visibility change syncs
const VISIBILITY_SYNC_MIN_AWAY_MS = 300000; // Only sync on tab return if away > 5 minutes
const RECENTLY_MODIFIED_TTL_MS = 5000; // Protect recently modified entities for 5 seconds

// Track recently modified entity IDs to prevent pull from overwriting fresh local changes
// This provides an additional layer of protection beyond the pending queue check
const recentlyModifiedEntities: Map<string, number> = new Map();

// Mark an entity as recently modified (called by repositories after local writes)
export function markEntityModified(entityId: string): void {
  recentlyModifiedEntities.set(entityId, Date.now());
}

// Check if entity was recently modified locally
function isRecentlyModified(entityId: string): boolean {
  const modifiedAt = recentlyModifiedEntities.get(entityId);
  if (!modifiedAt) return false;

  const age = Date.now() - modifiedAt;
  if (age > RECENTLY_MODIFIED_TTL_MS) {
    // Expired, clean up
    recentlyModifiedEntities.delete(entityId);
    return false;
  }
  return true;
}

// Clean up expired entries (called periodically)
function cleanupRecentlyModified(): void {
  const now = Date.now();
  for (const [entityId, modifiedAt] of recentlyModifiedEntities) {
    if (now - modifiedAt > RECENTLY_MODIFIED_TTL_MS) {
      recentlyModifiedEntities.delete(entityId);
    }
  }
}

// Proper async mutex to prevent concurrent syncs
// Uses a queue-based approach where each caller waits for the previous one
let lockPromise: Promise<void> | null = null;
let lockResolve: (() => void) | null = null;

// Store event listener references for cleanup
let handleOnlineRef: (() => void) | null = null;
let handleOfflineRef: (() => void) | null = null;
let handleVisibilityChangeRef: (() => void) | null = null;

async function acquireSyncLock(): Promise<boolean> {
  // If lock is held, return false (non-blocking check for callers that want to skip)
  if (lockPromise !== null) {
    return false;
  }

  // Create a new lock promise
  lockPromise = new Promise<void>((resolve) => {
    lockResolve = resolve;
  });

  return true;
}

function releaseSyncLock(): void {
  if (lockResolve) {
    lockResolve();
  }
  lockPromise = null;
  lockResolve = null;
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
    return sum + calculateGoalProgressCapped(goal.type, goal.completed, goal.current_value, goal.target_value);
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
        .select(COLUMNS.goal_lists)
        .eq('id', id)
        .single();

      if (!listError && remoteList && !remoteList.deleted) {
        await db.goalLists.put(remoteList);
        list = remoteList;

        // Also fetch its goals
        const { data: remoteGoals, error: goalsError } = await supabase
          .from('goals')
          .select(COLUMNS.goals)
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
        .select(COLUMNS.daily_routine_goals)
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
      return isRoutineActiveOnDate(routine, date);
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
        .select(COLUMNS.daily_goal_progress)
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
        .select(COLUMNS.daily_goal_progress)
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
// Returns egress stats for this pull operation
// minCursor: optional minimum cursor to use (e.g., timestamp after push completes)
async function pullRemoteChanges(minCursor?: string): Promise<{ bytes: number; records: number }> {
  const userId = await getCurrentUserId();

  // Abort if no authenticated user (avoids confusing RLS errors)
  if (!userId) {
    throw new Error('Not authenticated. Please sign in to sync.');
  }

  // Use the later of stored cursor or provided minCursor
  // This prevents re-fetching records we just pushed in this sync cycle
  const storedCursor = getLastSyncCursor(userId);
  const lastSync = minCursor && minCursor > storedCursor ? minCursor : storedCursor;
  const pendingEntityIds = await getPendingEntityIds();

  // Track the newest updated_at we see
  let newestUpdate = lastSync;

  // Track egress for this pull
  let pullBytes = 0;
  let pullRecords = 0;

  // Pull goal_lists changed since last sync
  const { data: remoteLists, error: listsError } = await supabase
    .from('goal_lists')
    .select(COLUMNS.goal_lists)
    .gt('updated_at', lastSync);

  if (listsError) throw listsError;
  const listsEgress = trackEgress('goal_lists', remoteLists);
  pullBytes += listsEgress.bytes;
  pullRecords += listsEgress.records;

  // Pull goals changed since last sync
  const { data: remoteGoals, error: goalsError } = await supabase
    .from('goals')
    .select(COLUMNS.goals)
    .gt('updated_at', lastSync);

  if (goalsError) throw goalsError;
  const goalsEgress = trackEgress('goals', remoteGoals);
  pullBytes += goalsEgress.bytes;
  pullRecords += goalsEgress.records;

  // Pull daily_routine_goals changed since last sync
  const { data: remoteRoutines, error: routinesError } = await supabase
    .from('daily_routine_goals')
    .select(COLUMNS.daily_routine_goals)
    .gt('updated_at', lastSync);

  if (routinesError) throw routinesError;
  const routinesEgress = trackEgress('daily_routine_goals', remoteRoutines);
  pullBytes += routinesEgress.bytes;
  pullRecords += routinesEgress.records;

  // Pull daily_goal_progress changed since last sync
  const { data: remoteProgress, error: progressError } = await supabase
    .from('daily_goal_progress')
    .select(COLUMNS.daily_goal_progress)
    .gt('updated_at', lastSync);

  if (progressError) throw progressError;
  const progressEgress = trackEgress('daily_goal_progress', remoteProgress);
  pullBytes += progressEgress.bytes;
  pullRecords += progressEgress.records;

  // Pull task_categories changed since last sync
  const { data: remoteCategories, error: categoriesError } = await supabase
    .from('task_categories')
    .select(COLUMNS.task_categories)
    .gt('updated_at', lastSync);

  if (categoriesError) throw categoriesError;
  const categoriesEgress = trackEgress('task_categories', remoteCategories);
  pullBytes += categoriesEgress.bytes;
  pullRecords += categoriesEgress.records;

  // Pull commitments changed since last sync
  const { data: remoteCommitments, error: commitmentsError } = await supabase
    .from('commitments')
    .select(COLUMNS.commitments)
    .gt('updated_at', lastSync);

  if (commitmentsError) throw commitmentsError;
  const commitmentsEgress = trackEgress('commitments', remoteCommitments);
  pullBytes += commitmentsEgress.bytes;
  pullRecords += commitmentsEgress.records;

  // Pull daily_tasks changed since last sync
  const { data: remoteDailyTasks, error: dailyTasksError } = await supabase
    .from('daily_tasks')
    .select(COLUMNS.daily_tasks)
    .gt('updated_at', lastSync);

  if (dailyTasksError) throw dailyTasksError;
  const dailyTasksEgress = trackEgress('daily_tasks', remoteDailyTasks);
  pullBytes += dailyTasksEgress.bytes;
  pullRecords += dailyTasksEgress.records;

  // Pull long_term_tasks changed since last sync
  const { data: remoteLongTermTasks, error: longTermTasksError } = await supabase
    .from('long_term_tasks')
    .select(COLUMNS.long_term_tasks)
    .gt('updated_at', lastSync);

  if (longTermTasksError) throw longTermTasksError;
  const longTermTasksEgress = trackEgress('long_term_tasks', remoteLongTermTasks);
  pullBytes += longTermTasksEgress.bytes;
  pullRecords += longTermTasksEgress.records;

  // Pull focus_settings changed since last sync
  const { data: remoteFocusSettings, error: focusSettingsError } = await supabase
    .from('focus_settings')
    .select(COLUMNS.focus_settings)
    .gt('updated_at', lastSync);

  if (focusSettingsError) throw focusSettingsError;
  const focusSettingsEgress = trackEgress('focus_settings', remoteFocusSettings);
  pullBytes += focusSettingsEgress.bytes;
  pullRecords += focusSettingsEgress.records;

  // Pull focus_sessions changed since last sync
  const { data: remoteFocusSessions, error: focusSessionsError } = await supabase
    .from('focus_sessions')
    .select(COLUMNS.focus_sessions)
    .gt('updated_at', lastSync);

  if (focusSessionsError) throw focusSessionsError;
  const focusSessionsEgress = trackEgress('focus_sessions', remoteFocusSessions);
  pullBytes += focusSessionsEgress.bytes;
  pullRecords += focusSessionsEgress.records;

  // Pull block_lists changed since last sync
  const { data: remoteBlockLists, error: blockListsError } = await supabase
    .from('block_lists')
    .select(COLUMNS.block_lists)
    .gt('updated_at', lastSync);

  if (blockListsError) throw blockListsError;
  const blockListsEgress = trackEgress('block_lists', remoteBlockLists);
  pullBytes += blockListsEgress.bytes;
  pullRecords += blockListsEgress.records;

  // Pull blocked_websites changed since last sync
  const { data: remoteBlockedWebsites, error: blockedWebsitesError } = await supabase
    .from('blocked_websites')
    .select(COLUMNS.blocked_websites)
    .gt('updated_at', lastSync);

  if (blockedWebsitesError) throw blockedWebsitesError;
  const blockedWebsitesEgress = trackEgress('blocked_websites', remoteBlockedWebsites);
  pullBytes += blockedWebsitesEgress.bytes;
  pullRecords += blockedWebsitesEgress.records;

  // Apply changes to local DB with conflict handling
  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks, db.focusSettings, db.focusSessions, db.blockLists, db.blockedWebsites], async () => {
    // Apply goal_lists
    for (const remote of (remoteLists || [])) {
      // Skip if we have pending ops for this entity (local takes precedence)
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.goalLists.get(remote.id);
      // Accept remote if no local or remote is newer
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.goalLists.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply goals
    for (const remote of (remoteGoals || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.goals.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.goals.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply daily_routine_goals
    for (const remote of (remoteRoutines || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.dailyRoutineGoals.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.dailyRoutineGoals.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply daily_goal_progress
    for (const remote of (remoteProgress || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.dailyGoalProgress.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.dailyGoalProgress.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply task_categories
    for (const remote of (remoteCategories || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.taskCategories.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.taskCategories.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply commitments
    for (const remote of (remoteCommitments || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.commitments.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.commitments.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply daily_tasks
    for (const remote of (remoteDailyTasks || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.dailyTasks.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.dailyTasks.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply long_term_tasks
    for (const remote of (remoteLongTermTasks || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.longTermTasks.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.longTermTasks.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply focus_settings
    for (const remote of (remoteFocusSettings || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.focusSettings.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.focusSettings.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply focus_sessions
    for (const remote of (remoteFocusSessions || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.focusSessions.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.focusSessions.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply block_lists
    for (const remote of (remoteBlockLists || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.blockLists.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.blockLists.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }

    // Apply blocked_websites
    for (const remote of (remoteBlockedWebsites || [])) {
      if (pendingEntityIds.has(remote.id) || isRecentlyModified(remote.id)) continue;

      const local = await db.blockedWebsites.get(remote.id);
      if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
        await db.blockedWebsites.put(remote);
      }
      if (remote.updated_at > newestUpdate) newestUpdate = remote.updated_at;
    }
  });

  // Update sync cursor (per-user)
  setLastSyncCursor(newestUpdate, userId);

  return { bytes: pullBytes, records: pullRecords };
}

// PUSH: Send pending operations to remote
// Continues until queue is empty to catch items added during sync
// Track push errors for this sync cycle
let pushErrors: Array<{ message: string; table: string; operation: string; entityId: string }> = [];

export function getPushErrors() {
  return pushErrors;
}

interface PushStats {
  originalCount: number;
  coalescedCount: number;
  actualPushed: number;
}

async function pushPendingOps(): Promise<PushStats> {
  const maxIterations = 10; // Safety limit to prevent infinite loops
  let iterations = 0;
  let actualPushed = 0;

  // Clear previous push errors
  pushErrors = [];

  // Get original count before coalescing
  const originalItems = await getPendingSync();
  const originalCount = originalItems.length;

  // Coalesce multiple updates to the same entity before pushing
  // This merges e.g. 50 rapid increments into 1 update request
  const coalescedCount = await coalescePendingOps();
  if (coalescedCount > 0) {
    console.log(`[SYNC] Coalesced ${coalescedCount} redundant operations (${originalCount} → ${originalCount - coalescedCount})`);
  }

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
          actualPushed++;
        }
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);

        // Determine if this is a transient error that will likely succeed on retry
        const transient = isTransientError(error);

        // Only show error in UI if:
        // 1. It's a persistent error (won't fix itself) OR
        // 2. It's a transient error AND this is the last retry attempt (retries >= 3)
        // This prevents momentary error flashes for network hiccups that resolve on retry
        const shouldShowError = !transient || item.retries >= 3;

        if (shouldShowError) {
          // Capture error details for UI display
          const errorInfo = {
            message: extractErrorMessage(error),
            table: item.table,
            operation: item.operation,
            entityId: item.entityId
          };
          pushErrors.push(errorInfo);

          // Also add to the sync status store for UI
          syncStatusStore.addSyncError({
            ...errorInfo,
            timestamp: new Date().toISOString()
          });
        }

        if (item.id) {
          await incrementRetry(item.id);
        }
      }
    }

    // If we didn't process anything (all items in backoff), stop iterating
    if (!processedAny) break;
  }

  return { originalCount, coalescedCount, actualPushed };
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

// Classify an error as transient (will likely succeed on retry) or persistent (won't improve)
// Transient errors should not show UI errors until retries are exhausted
// Persistent errors should show immediately since they require user action
function isTransientError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const errObj = error as { code?: string; status?: number };

  // Network/connectivity issues - transient
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
    return true;
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return true;
  }
  if (msg.includes('connection') || msg.includes('offline')) {
    return true;
  }

  // Rate limiting - transient (will succeed after backoff)
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
    return true;
  }
  if (errObj.code === '429' || errObj.status === 429) {
    return true;
  }

  // Server errors (5xx) - transient
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return true;
  }
  if (errObj.status && errObj.status >= 500 && errObj.status < 600) {
    return true;
  }

  // Service unavailable - transient
  if (msg.includes('unavailable') || msg.includes('temporarily')) {
    return true;
  }

  // Everything else (auth errors, validation errors, etc.) - persistent
  // These require user action and won't fix themselves with retries
  return false;
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

// Extract raw error message from various error formats (Supabase, Error, etc.)
function extractErrorMessage(error: unknown): string {
  // Standard Error object
  if (error instanceof Error) {
    return error.message;
  }

  // Supabase/PostgreSQL error object: { message, details, hint, code }
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Try common error message properties
    if (typeof err.message === 'string' && err.message) {
      // Include details/hint if available for more context
      let msg = err.message;
      if (typeof err.details === 'string' && err.details) {
        msg += ` - ${err.details}`;
      }
      if (typeof err.hint === 'string' && err.hint) {
        msg += ` (${err.hint})`;
      }
      return msg;
    }

    // Try error property (some wrappers use this)
    if (typeof err.error === 'string' && err.error) {
      return err.error;
    }

    // Try description property
    if (typeof err.description === 'string' && err.description) {
      return err.description;
    }

    // Last resort: stringify the object
    try {
      return JSON.stringify(error);
    } catch {
      return '[Unable to parse error]';
    }
  }

  // Primitive types
  return String(error);
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

  // SECURITY: If we were offline and came back online, auth must be validated first
  // This prevents syncing potentially unauthorized data from an invalid offline session
  if (needsAuthValidation()) {
    console.log('[SYNC] Waiting for auth validation before syncing (was offline)');
    if (!quiet) {
      syncStatusStore.setStatus('idle');
      syncStatusStore.setSyncMessage('Validating credentials...');
    }
    return;
  }

  // Atomically acquire sync lock to prevent concurrent syncs
  const acquired = await acquireSyncLock();
  if (!acquired) return;

  // Track sync cycle for egress monitoring
  const cycleStart = Date.now();
  const trigger = quiet ? 'periodic' : 'user';
  let pushedItems = 0;
  let cycleEgressBytes = 0;
  let cycleEgressRecords = 0;

  let pushSucceeded = false;
  let pullSucceeded = false;

  try {
    // Only show "syncing" indicator for non-quiet syncs
    if (!quiet) {
      syncStatusStore.setStatus('syncing');
      syncStatusStore.setSyncMessage('Preparing changes...');
    }

    // Push first so local changes are persisted
    // Note: pushPendingOps coalesces before pushing, so actual requests are lower
    const pushStats = await pushPendingOps();
    pushedItems = pushStats.actualPushed;
    pushSucceeded = true;

    // Capture timestamp AFTER push completes - this prevents re-fetching
    // records we just pushed (their server updated_at will be <= this time)
    const postPushCursor = new Date().toISOString();

    if (!quiet) {
      syncStatusStore.setSyncMessage('Downloading latest data...');
    }

    // Then pull remote changes - retry up to 3 times if push succeeded
    // Pass postPushCursor to avoid fetching records we just pushed
    let pullAttempts = 0;
    const maxPullAttempts = 3;
    let lastPullError: unknown = null;
    let pullEgress = { bytes: 0, records: 0 };

    while (pullAttempts < maxPullAttempts && !pullSucceeded) {
      try {
        pullEgress = await pullRemoteChanges(postPushCursor);
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

    // Store egress for logging
    cycleEgressBytes = pullEgress.bytes;
    cycleEgressRecords = pullEgress.records;

    // Update status only for non-quiet syncs
    if (!quiet) {
      const remaining = await getPendingSync();
      syncStatusStore.setPendingCount(remaining.length);

      // Only show error status if:
      // 1. We have push errors that were deemed serious enough to show, OR
      // 2. Remaining items have been retrying for a while (retries >= 2)
      // This prevents "error" flash for items that will succeed on next retry
      const hasSignificantErrors = pushErrors.length > 0;
      const hasStaleRetries = remaining.some(item => item.retries >= 2);
      const showErrorStatus = remaining.length > 0 && (hasSignificantErrors || hasStaleRetries);

      syncStatusStore.setStatus(showErrorStatus ? 'error' : 'idle');
      syncStatusStore.setLastSyncTime(new Date().toISOString());

      // Update message based on actual error state
      if (showErrorStatus) {
        syncStatusStore.setSyncMessage(
          `${remaining.length} change${remaining.length === 1 ? '' : 's'} failed to sync`
        );

        // Show error details
        if (hasSignificantErrors) {
          // Show the latest specific error
          const latestError = pushErrors[pushErrors.length - 1];
          syncStatusStore.setError(
            `Failed to sync ${latestError.table} (${latestError.operation})`,
            latestError.message
          );
        } else {
          // Items in retry backoff - no specific errors this cycle
          // Show pending retry info instead of clearing error details
          const retryInfo = remaining.map(item => `${item.table} (${item.operation})`).slice(0, 3);
          const moreCount = remaining.length - retryInfo.length;
          const details = moreCount > 0
            ? `${retryInfo.join(', ')} and ${moreCount} more`
            : retryInfo.join(', ');
          syncStatusStore.setError(
            `${remaining.length} change${remaining.length === 1 ? '' : 's'} pending retry`,
            `Affected: ${details}. Will retry automatically.`
          );
        }
      } else if (remaining.length > 0) {
        // Items exist but don't show error status yet (still early in retry cycle)
        // Show a neutral "syncing" message instead of error
        syncStatusStore.setSyncMessage('Syncing changes...');
        syncStatusStore.setError(null);
      } else {
        syncStatusStore.setSyncMessage('Everything is synced!');
        syncStatusStore.setError(null);
      }
    }

    // Notify stores that sync is complete so they can refresh from local
    notifySyncComplete();
  } catch (error) {
    console.error('Sync failed:', error);

    // Only show errors for user-initiated syncs (non-quiet)
    // Background syncs fail silently - they'll retry automatically
    if (!quiet) {
      const friendlyMessage = parseErrorMessage(error);
      const rawMessage = extractErrorMessage(error);
      syncStatusStore.setStatus('error');
      syncStatusStore.setError(friendlyMessage, rawMessage);
      syncStatusStore.setSyncMessage(friendlyMessage);
    }

    // If push succeeded but pull failed, still notify so UI refreshes with pushed data
    if (pushSucceeded && !pullSucceeded) {
      notifySyncComplete();
    }
  } finally {
    // Log sync cycle stats for egress monitoring
    logSyncCycle({
      trigger,
      pushedItems,
      pulledTables: pullSucceeded ? 12 : 0, // 12 tables pulled on success
      pulledRecords: cycleEgressRecords,
      egressBytes: cycleEgressBytes,
      durationMs: Date.now() - cycleStart,
    });
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
    // Pull all non-deleted records from each table (explicit columns for egress optimization)
    // Filter deleted = false OR deleted IS NULL to exclude tombstones
    const { data: lists, error: listsError } = await supabase
      .from('goal_lists')
      .select(COLUMNS.goal_lists)
      .or('deleted.is.null,deleted.eq.false');
    if (listsError) throw listsError;

    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select(COLUMNS.goals)
      .or('deleted.is.null,deleted.eq.false');
    if (goalsError) throw goalsError;

    const { data: routines, error: routinesError } = await supabase
      .from('daily_routine_goals')
      .select(COLUMNS.daily_routine_goals)
      .or('deleted.is.null,deleted.eq.false');
    if (routinesError) throw routinesError;

    const { data: progress, error: progressError } = await supabase
      .from('daily_goal_progress')
      .select(COLUMNS.daily_goal_progress)
      .or('deleted.is.null,deleted.eq.false');
    if (progressError) throw progressError;

    const { data: categories, error: categoriesError } = await supabase
      .from('task_categories')
      .select(COLUMNS.task_categories)
      .or('deleted.is.null,deleted.eq.false');
    if (categoriesError) throw categoriesError;

    const { data: commitments, error: commitmentsError } = await supabase
      .from('commitments')
      .select(COLUMNS.commitments)
      .or('deleted.is.null,deleted.eq.false');
    if (commitmentsError) throw commitmentsError;

    const { data: dailyTasks, error: dailyTasksError } = await supabase
      .from('daily_tasks')
      .select(COLUMNS.daily_tasks)
      .or('deleted.is.null,deleted.eq.false');
    if (dailyTasksError) throw dailyTasksError;

    const { data: longTermTasks, error: longTermTasksError } = await supabase
      .from('long_term_tasks')
      .select(COLUMNS.long_term_tasks)
      .or('deleted.is.null,deleted.eq.false');
    if (longTermTasksError) throw longTermTasksError;

    const { data: focusSettings, error: focusSettingsError } = await supabase
      .from('focus_settings')
      .select(COLUMNS.focus_settings)
      .or('deleted.is.null,deleted.eq.false');
    if (focusSettingsError) throw focusSettingsError;

    const { data: focusSessions, error: focusSessionsError } = await supabase
      .from('focus_sessions')
      .select(COLUMNS.focus_sessions)
      .or('deleted.is.null,deleted.eq.false');
    if (focusSessionsError) throw focusSessionsError;

    const { data: blockLists, error: blockListsError } = await supabase
      .from('block_lists')
      .select(COLUMNS.block_lists)
      .or('deleted.is.null,deleted.eq.false');
    if (blockListsError) throw blockListsError;

    const { data: blockedWebsites, error: blockedWebsitesError } = await supabase
      .from('blocked_websites')
      .select(COLUMNS.blocked_websites)
      .or('deleted.is.null,deleted.eq.false');
    if (blockedWebsitesError) throw blockedWebsitesError;

    // Track egress for initial hydration
    trackEgress('goal_lists', lists);
    trackEgress('goals', goals);
    trackEgress('daily_routine_goals', routines);
    trackEgress('daily_goal_progress', progress);
    trackEgress('task_categories', categories);
    trackEgress('commitments', commitments);
    trackEgress('daily_tasks', dailyTasks);
    trackEgress('long_term_tasks', longTermTasks);
    trackEgress('focus_settings', focusSettings);
    trackEgress('focus_sessions', focusSessions);
    trackEgress('block_lists', blockLists);
    trackEgress('blocked_websites', blockedWebsites);

    const totalRecords = (lists?.length || 0) + (goals?.length || 0) + (routines?.length || 0) +
      (progress?.length || 0) + (categories?.length || 0) + (commitments?.length || 0) +
      (dailyTasks?.length || 0) + (longTermTasks?.length || 0) + (focusSettings?.length || 0) +
      (focusSessions?.length || 0) + (blockLists?.length || 0) + (blockedWebsites?.length || 0);
    console.log(`[SYNC] Initial hydration: ${totalRecords} records (${formatBytes(egressStats.totalBytes)})`);

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
      ...(longTermTasks || []),
      ...(focusSettings || []),
      ...(focusSessions || []),
      ...(blockLists || []),
      ...(blockedWebsites || [])
    ];
    for (const item of allData) {
      if (item.updated_at && item.updated_at > maxUpdatedAt) {
        maxUpdatedAt = item.updated_at;
      }
    }

    // Store everything locally
    await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks, db.focusSettings, db.focusSessions, db.blockLists, db.blockedWebsites], async () => {
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
      if (focusSettings && focusSettings.length > 0) {
        await db.focusSettings.bulkPut(focusSettings);
      }
      if (focusSessions && focusSessions.length > 0) {
        await db.focusSessions.bulkPut(focusSessions);
      }
      if (blockLists && blockLists.length > 0) {
        await db.blockLists.bulkPut(blockLists);
      }
      if (blockedWebsites && blockedWebsites.length > 0) {
        await db.blockedWebsites.bulkPut(blockedWebsites);
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
    const rawMessage = extractErrorMessage(error);
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
async function cleanupLocalTombstones(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - TOMBSTONE_MAX_AGE_DAYS);
  const cutoffStr = cutoffDate.toISOString();

  let totalDeleted = 0;

  try {
    await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks, db.focusSettings, db.focusSessions, db.blockLists, db.blockedWebsites], async () => {
      // Delete old tombstones from each table and count
      const tables = [
        { table: db.goalLists, name: 'goalLists' },
        { table: db.goals, name: 'goals' },
        { table: db.dailyRoutineGoals, name: 'dailyRoutineGoals' },
        { table: db.dailyGoalProgress, name: 'dailyGoalProgress' },
        { table: db.taskCategories, name: 'taskCategories' },
        { table: db.commitments, name: 'commitments' },
        { table: db.dailyTasks, name: 'dailyTasks' },
        { table: db.longTermTasks, name: 'longTermTasks' },
        { table: db.focusSettings, name: 'focusSettings' },
        { table: db.focusSessions, name: 'focusSessions' },
        { table: db.blockLists, name: 'blockLists' },
        { table: db.blockedWebsites, name: 'blockedWebsites' }
      ];

      for (const { table, name } of tables) {
        const count = await table.filter(item => item.deleted && item.updated_at < cutoffStr).delete();
        if (count > 0) {
          console.log(`[Tombstone] Cleaned ${count} old records from local ${name}`);
          totalDeleted += count;
        }
      }
    });

    if (totalDeleted > 0) {
      console.log(`[Tombstone] Local cleanup complete: ${totalDeleted} total records removed`);
    }
  } catch (error) {
    console.error('[Tombstone] Failed to cleanup local tombstones:', error);
  }

  return totalDeleted;
}

// Clean up old tombstones from SUPABASE (runs once per day max)
async function cleanupServerTombstones(force = false): Promise<number> {
  // Only run once per day to avoid unnecessary requests (unless forced)
  const now = Date.now();
  if (!force && now - lastServerCleanup < CLEANUP_INTERVAL_MS) {
    return 0;
  }

  if (typeof navigator === 'undefined' || !navigator.onLine) return 0;

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
    'long_term_tasks',
    'focus_settings',
    'focus_sessions',
    'block_lists',
    'blocked_websites'
  ];

  let totalDeleted = 0;

  try {
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('deleted', true)
        .lt('updated_at', cutoffStr)
        .select('id');

      if (error) {
        console.error(`[Tombstone] Failed to cleanup ${table}:`, error.message);
      } else if (data && data.length > 0) {
        console.log(`[Tombstone] Cleaned ${data.length} old records from server ${table}`);
        totalDeleted += data.length;
      }
    }

    lastServerCleanup = now;

    if (totalDeleted > 0) {
      console.log(`[Tombstone] Server cleanup complete: ${totalDeleted} total records removed`);
    }
  } catch (error) {
    console.error('[Tombstone] Failed to cleanup server tombstones:', error);
  }

  return totalDeleted;
}

// Combined cleanup function
async function cleanupOldTombstones(): Promise<{ local: number; server: number }> {
  const local = await cleanupLocalTombstones();
  const server = await cleanupServerTombstones();
  return { local, server };
}

// Debug function to check tombstone status and manually trigger cleanup
export async function debugTombstones(options?: { cleanup?: boolean; force?: boolean }): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - TOMBSTONE_MAX_AGE_DAYS);
  const cutoffStr = cutoffDate.toISOString();

  console.log('=== TOMBSTONE DEBUG ===');
  console.log(`Cutoff date (${TOMBSTONE_MAX_AGE_DAYS} days ago): ${cutoffStr}`);
  console.log(`Last server cleanup: ${lastServerCleanup ? new Date(lastServerCleanup).toISOString() : 'Never'}`);
  console.log('');

  // Check local tombstones
  console.log('--- LOCAL TOMBSTONES (IndexedDB) ---');
  const localTables = [
    { table: db.goalLists, name: 'goalLists' },
    { table: db.goals, name: 'goals' },
    { table: db.dailyRoutineGoals, name: 'dailyRoutineGoals' },
    { table: db.dailyGoalProgress, name: 'dailyGoalProgress' },
    { table: db.taskCategories, name: 'taskCategories' },
    { table: db.commitments, name: 'commitments' },
    { table: db.dailyTasks, name: 'dailyTasks' },
    { table: db.longTermTasks, name: 'longTermTasks' },
    { table: db.focusSettings, name: 'focusSettings' },
    { table: db.focusSessions, name: 'focusSessions' },
    { table: db.blockLists, name: 'blockLists' },
    { table: db.blockedWebsites, name: 'blockedWebsites' }
  ];

  let totalLocalTombstones = 0;
  let totalLocalEligible = 0;

  for (const { table, name } of localTables) {
    const allDeleted = await table.filter(item => item.deleted === true).toArray();
    const eligible = allDeleted.filter(item => item.updated_at < cutoffStr);

    if (allDeleted.length > 0) {
      console.log(`  ${name}: ${allDeleted.length} tombstones (${eligible.length} eligible for cleanup)`);
      totalLocalTombstones += allDeleted.length;
      totalLocalEligible += eligible.length;

      // Show oldest tombstone
      if (allDeleted.length > 0) {
        const oldest = allDeleted.reduce((a, b) => a.updated_at < b.updated_at ? a : b);
        console.log(`    Oldest: ${oldest.updated_at}`);
      }
    }
  }

  console.log(`  TOTAL: ${totalLocalTombstones} tombstones (${totalLocalEligible} eligible)`);
  console.log('');

  // Check server tombstones (if online)
  if (navigator.onLine) {
    console.log('--- SERVER TOMBSTONES (Supabase) ---');
    const serverTables = [
      'goal_lists', 'goals', 'daily_routine_goals', 'daily_goal_progress',
      'task_categories', 'commitments', 'daily_tasks', 'long_term_tasks',
      'focus_settings', 'focus_sessions', 'block_lists', 'blocked_websites'
    ];

    let totalServerTombstones = 0;
    let totalServerEligible = 0;

    for (const table of serverTables) {
      const { data: allDeleted, error } = await supabase
        .from(table)
        .select('id,updated_at')
        .eq('deleted', true);

      if (error) {
        console.log(`  ${table}: ERROR - ${error.message}`);
        continue;
      }

      const eligible = (allDeleted || []).filter(item => item.updated_at < cutoffStr);

      if (allDeleted && allDeleted.length > 0) {
        console.log(`  ${table}: ${allDeleted.length} tombstones (${eligible.length} eligible for cleanup)`);
        totalServerTombstones += allDeleted.length;
        totalServerEligible += eligible.length;

        // Show oldest tombstone
        const oldest = allDeleted.reduce((a, b) => a.updated_at < b.updated_at ? a : b);
        console.log(`    Oldest: ${oldest.updated_at}`);
      }
    }

    console.log(`  TOTAL: ${totalServerTombstones} tombstones (${totalServerEligible} eligible)`);
  } else {
    console.log('--- SERVER TOMBSTONES: Offline, skipping ---');
  }

  console.log('');

  // Run cleanup if requested
  if (options?.cleanup) {
    console.log('--- RUNNING CLEANUP ---');
    const localDeleted = await cleanupLocalTombstones();
    const serverDeleted = options?.force
      ? await cleanupServerTombstones(true)
      : await cleanupServerTombstones();

    console.log(`Cleanup complete: ${localDeleted} local, ${serverDeleted} server records removed`);
  } else {
    console.log('To run cleanup, call: debugTombstones({ cleanup: true })');
    console.log('To force server cleanup (bypass 24h limit): debugTombstones({ cleanup: true, force: true })');
  }

  console.log('========================');
}

// Expose tombstone debug to window for console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__stellarTombstones = debugTombstones;
}

// ============================================================
// LIFECYCLE
// ============================================================

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return;

  // Clean up any existing listeners and intervals first (prevents duplicates if called multiple times)
  if (handleOnlineRef) {
    window.removeEventListener('online', handleOnlineRef);
  }
  if (handleOfflineRef) {
    window.removeEventListener('offline', handleOfflineRef);
  }
  if (handleVisibilityChangeRef) {
    document.removeEventListener('visibilitychange', handleVisibilityChangeRef);
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (visibilityDebounceTimeout) {
    clearTimeout(visibilityDebounceTimeout);
    visibilityDebounceTimeout = null;
  }

  // Reset sync status to clean state (clears any stale error from previous session)
  // This prevents error flash when navigating back after a previous sync failure
  syncStatusStore.reset();

  // IMPORTANT: If starting while offline, mark that auth validation is needed
  // This ensures we don't attempt to sync until credentials are validated on reconnect
  // Fixes race condition where sync engine's 'online' handler fires before auth check
  if (!navigator.onLine) {
    markOffline();
  }

  // Handle online event - run sync when connection restored (show indicator)
  handleOnlineRef = () => {
    runFullSync(false);
  };
  window.addEventListener('online', handleOnlineRef);

  // Handle offline event - immediately update status indicator and mark for auth validation
  handleOfflineRef = () => {
    markOffline(); // Mark that auth needs validation when we come back online
    syncStatusStore.setStatus('offline');
    syncStatusStore.setSyncMessage('You\'re offline. Changes will sync when reconnected.');
  };
  window.addEventListener('offline', handleOfflineRef);

  // Track visibility and sync when returning to tab (with smart timing)
  handleVisibilityChangeRef = () => {
    const wasHidden = !isTabVisible;
    isTabVisible = !document.hidden;
    syncStatusStore.setTabVisible(isTabVisible);

    // Track when tab becomes hidden
    if (!isTabVisible) {
      tabHiddenAt = Date.now();
      return;
    }

    // If tab just became visible, check if we should sync
    if (wasHidden && isTabVisible && navigator.onLine) {
      // Only sync if user was away for > 5 minutes (reduces egress for quick tab switches)
      const awayDuration = tabHiddenAt ? Date.now() - tabHiddenAt : 0;
      tabHiddenAt = null;

      if (awayDuration < VISIBILITY_SYNC_MIN_AWAY_MS) {
        // User was only away briefly, skip sync
        return;
      }

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

    // Cleanup old tombstones, failed sync items, and recently modified cache
    await cleanupOldTombstones();
    cleanupRecentlyModified();
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

  await db.transaction('rw', [db.goalLists, db.goals, db.dailyRoutineGoals, db.dailyGoalProgress, db.syncQueue, db.taskCategories, db.commitments, db.dailyTasks, db.longTermTasks, db.focusSettings, db.focusSessions, db.blockLists, db.blockedWebsites], async () => {
    await db.goalLists.clear();
    await db.goals.clear();
    await db.dailyRoutineGoals.clear();
    await db.dailyGoalProgress.clear();
    await db.taskCategories.clear();
    await db.commitments.clear();
    await db.dailyTasks.clear();
    await db.longTermTasks.clear();
    await db.focusSettings.clear();
    await db.focusSessions.clear();
    await db.blockLists.clear();
    await db.blockedWebsites.clear();
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
