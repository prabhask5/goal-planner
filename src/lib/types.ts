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

export interface DailyRoutineGoal {
  id: string;
  user_id: string;
  name: string;
  type: GoalType;
  target_value: number | null;
  start_date: string;
  end_date: string | null;
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
  table: 'goal_lists' | 'goals' | 'daily_routine_goals' | 'daily_goal_progress' | 'task_categories' | 'commitments' | 'daily_tasks' | 'long_term_tasks';
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
