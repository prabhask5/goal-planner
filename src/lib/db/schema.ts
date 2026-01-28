import Dexie, { type Table } from 'dexie';
import type { Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, SyncOperationItem, TaskCategory, Commitment, DailyTask, LongTermTask, OfflineCredentials, OfflineSession, FocusSettings, FocusSession, BlockList, BlockedWebsite } from '$lib/types';

export class GoalPlannerDB extends Dexie {
  goalLists!: Table<GoalList, string>;
  goals!: Table<Goal, string>;
  dailyRoutineGoals!: Table<DailyRoutineGoal, string>;
  dailyGoalProgress!: Table<DailyGoalProgress, string>;
  syncQueue!: Table<SyncOperationItem, number>;
  taskCategories!: Table<TaskCategory, string>;
  commitments!: Table<Commitment, string>;
  dailyTasks!: Table<DailyTask, string>;
  longTermTasks!: Table<LongTermTask, string>;
  offlineCredentials!: Table<OfflineCredentials, string>;
  offlineSession!: Table<OfflineSession, string>;
  focusSettings!: Table<FocusSettings, string>;
  focusSessions!: Table<FocusSession, string>;
  blockLists!: Table<BlockList, string>;
  blockedWebsites!: Table<BlockedWebsite, string>;

  constructor() {
    super('GoalPlannerDB');

    this.version(2).stores({
      // Primary key is id, indexed by user_id, created_at for sorting, updated_at for sync
      goalLists: 'id, user_id, created_at, updated_at',
      // Primary key is id, indexed by goal_list_id for fetching goals in a list
      goals: 'id, goal_list_id, created_at, updated_at',
      // Primary key is id, indexed by user_id, start_date, end_date for date filtering, created_at for sorting
      dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
      // Primary key is id, compound index for finding progress by goal+date
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      // Auto-increment id for sync queue, indexed by table for batch operations
      syncQueue: '++id, table, timestamp'
    });

    this.version(3).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      // Added entityId index for coalescing updates to the same entity
      syncQueue: '++id, table, entityId, timestamp'
    });

    // Version 4: Add order index to dailyRoutineGoals for drag-drop reordering
    this.version(4).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, order, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      syncQueue: '++id, table, entityId, timestamp'
    }).upgrade(async (tx) => {
      // Assign sequential order to existing daily routine goals
      const routines = await tx.table('dailyRoutineGoals').toArray();
      // Sort by created_at descending (newest first, matching current display order)
      const sorted = routines.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      for (let i = 0; i < sorted.length; i++) {
        await tx.table('dailyRoutineGoals').update(sorted[i].id, { order: i });
      }
    });

    // Version 5: Add Tasks feature tables (task_categories, commitments, daily_tasks, long_term_tasks)
    this.version(5).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, order, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      syncQueue: '++id, table, entityId, timestamp',
      taskCategories: 'id, user_id, order, created_at, updated_at',
      commitments: 'id, user_id, section, order, created_at, updated_at',
      dailyTasks: 'id, user_id, order, created_at, updated_at',
      longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at'
    });

    // Version 6: Add offline authentication tables (offlineCredentials, offlineSession)
    this.version(6).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, order, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      syncQueue: '++id, table, entityId, timestamp',
      taskCategories: 'id, user_id, order, created_at, updated_at',
      commitments: 'id, user_id, section, order, created_at, updated_at',
      dailyTasks: 'id, user_id, order, created_at, updated_at',
      longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
      offlineCredentials: 'id',  // singleton: 'current_user'
      offlineSession: 'id'       // singleton: 'current_session'
    });

    // Version 7: Add Focus feature tables (focusSettings, focusSessions, blockLists, blockedWebsites)
    this.version(7).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, order, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      syncQueue: '++id, table, entityId, timestamp',
      taskCategories: 'id, user_id, order, created_at, updated_at',
      commitments: 'id, user_id, section, order, created_at, updated_at',
      dailyTasks: 'id, user_id, order, created_at, updated_at',
      longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
      offlineCredentials: 'id',
      offlineSession: 'id',
      focusSettings: 'id, user_id, updated_at',
      focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
      blockLists: 'id, user_id, order, updated_at',
      blockedWebsites: 'id, block_list_id, updated_at'
    });
  }
}

export const db = new GoalPlannerDB();
