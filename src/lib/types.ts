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
}

export interface GoalList {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface DailyGoalProgress {
  id: string;
  daily_routine_goal_id: string;
  date: string;
  current_value: number;
  completed: boolean;
  updated_at: string;
}

// Sync-related types
export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  id?: number;
  table: 'goal_lists' | 'goals' | 'daily_routine_goals' | 'daily_goal_progress';
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
