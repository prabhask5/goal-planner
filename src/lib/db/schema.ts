import Dexie, { type Table } from 'dexie';
import type { Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, SyncQueueItem } from '$lib/types';

export class GoalPlannerDB extends Dexie {
  goalLists!: Table<GoalList, string>;
  goals!: Table<Goal, string>;
  dailyRoutineGoals!: Table<DailyRoutineGoal, string>;
  dailyGoalProgress!: Table<DailyGoalProgress, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('GoalPlannerDB');

    this.version(1).stores({
      // Primary key is id, indexed by user_id and updated_at for sync
      goalLists: 'id, user_id, updated_at',
      // Primary key is id, indexed by goal_list_id for fetching goals in a list
      goals: 'id, goal_list_id, updated_at',
      // Primary key is id, indexed by user_id, start_date, end_date for date filtering
      dailyRoutineGoals: 'id, user_id, start_date, end_date, updated_at',
      // Primary key is id, compound index for finding progress by goal+date
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      // Auto-increment id for sync queue, indexed by table for batch operations
      syncQueue: '++id, table, timestamp'
    });
  }
}

export const db = new GoalPlannerDB();
