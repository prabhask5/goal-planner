export type GoalType = 'completion' | 'incremental';

export interface Goal {
  id: string;
  goal_list_id: string;
  name: string;
  type: GoalType;
  target_value: number | null;
  current_value: number;
  completed: boolean;
  order: number;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

export interface GoalList {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
  goals?: Goal[];
}

// Days of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DailyRoutineGoal {
  id: string;
  user_id: string;
  name: string;
  type: GoalType;
  target_value: number | null;
  start_date: string;
  end_date: string | null;
  active_days: DayOfWeek[] | null; // null = all days (backwards compatible)
  order: number;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

export interface DailyGoalProgress {
  id: string;
  daily_routine_goal_id: string;
  date: string;
  current_value: number;
  completed: boolean;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

// Sync-related types
export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  id?: number;
  table: 'goal_lists' | 'goals' | 'daily_routine_goals' | 'daily_goal_progress' | 'task_categories' | 'commitments' | 'daily_tasks' | 'long_term_tasks' | 'focus_settings' | 'focus_sessions' | 'block_lists' | 'blocked_websites';
  operation: SyncOperation;
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  retries: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface DayProgress {
  date: string;
  totalGoals: number;
  completedGoals: number;
  completionPercentage: number;
}

export interface GoalListWithProgress extends GoalList {
  totalGoals: number;
  completedGoals: number;
  completionPercentage: number;
}

// ============================================================
// TASKS FEATURE TYPES
// ============================================================

export type CommitmentSection = 'career' | 'social' | 'personal';

export interface TaskCategory {
  id: string;
  user_id: string;
  name: string;
  color: string; // hex color for visual tag
  order: number;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

export interface Commitment {
  id: string;
  user_id: string;
  name: string;
  section: CommitmentSection;
  order: number;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

export interface DailyTask {
  id: string;
  user_id: string;
  name: string;
  order: number;
  completed: boolean;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

export interface LongTermTask {
  id: string;
  user_id: string;
  name: string;
  due_date: string; // YYYY-MM-DD
  category_id: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
  deleted?: boolean; // Tombstone flag
}

export interface LongTermTaskWithCategory extends LongTermTask {
  category?: TaskCategory;
}

// ============================================================
// OFFLINE AUTHENTICATION TYPES
// ============================================================

export interface OfflineCredentials {
  id: string;              // 'current_user' - singleton pattern
  userId: string;          // Supabase user ID
  email: string;
  password: string;        // Plaintext password (user's own password, stored locally)
  firstName: string;
  lastName: string;
  cachedAt: string;        // ISO timestamp when credentials were cached
}

export interface OfflineSession {
  id: string;              // 'current_session' - singleton pattern
  userId: string;          // Supabase user ID
  offlineToken: string;    // UUID token for offline session
  createdAt: string;       // ISO timestamp
  // Note: No expiresAt - sessions don't expire automatically
  // They are only revoked on: (1) successful online re-auth, (2) logout
}

export type AuthMode = 'supabase' | 'offline' | 'none';

// ============================================================
// FOCUS FEATURE TYPES
// ============================================================

export type FocusPhase = 'focus' | 'break' | 'idle';
export type FocusStatus = 'running' | 'paused' | 'stopped';

export interface FocusSettings {
  id: string;
  user_id: string;
  focus_duration: number;        // minutes (default: 25)
  break_duration: number;        // minutes (default: 5)
  long_break_duration: number;   // minutes (default: 15)
  cycles_before_long_break: number;
  auto_start_breaks: boolean;
  auto_start_focus: boolean;
  created_at: string;
  updated_at: string;
  deleted?: boolean;
}

export interface FocusSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  phase: FocusPhase;
  status: FocusStatus;
  current_cycle: number;
  total_cycles: number;
  focus_duration: number;
  break_duration: number;
  phase_started_at: string;
  phase_remaining_ms: number;
  elapsed_duration: number; // Total elapsed focus time in minutes
  created_at: string;
  updated_at: string;
  deleted?: boolean;
}

// ============================================================
// BLOCK LIST TYPES
// ============================================================

export interface BlockList {
  id: string;
  user_id: string;
  name: string;
  active_days: DayOfWeek[] | null;  // null = all days
  is_enabled: boolean;
  order: number;
  created_at: string;
  updated_at: string;
  deleted?: boolean;
}

export interface BlockedWebsite {
  id: string;
  block_list_id: string;
  domain: string;
  created_at: string;
  updated_at: string;
  deleted?: boolean;
}
