import { db, generateId, now } from '../client';
import type { DailyRoutineGoal, GoalType, DayOfWeek } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

export async function createDailyRoutineGoal(
  name: string,
  type: GoalType,
  targetValue: number | null,
  startDate: string,
  endDate: string | null,
  userId: string,
  activeDays: DayOfWeek[] | null = null // null = all days (backwards compatible)
): Promise<DailyRoutineGoal> {
  const timestamp = now();

  // Get the current min order to prepend new items at the top
  // This is backwards-compatible: existing items (order 0,1,2...) stay in place,
  // new items get -1,-2,-3... and appear first when sorted ascending
  const existingRoutines = await db.dailyRoutineGoals.where('user_id').equals(userId).toArray();

  const activeRoutines = existingRoutines.filter((r) => !r.deleted);
  const minOrder =
    activeRoutines.length > 0 ? Math.min(...activeRoutines.map((r) => r.order ?? 0)) : 0;
  const nextOrder = minOrder - 1;

  const newRoutine: DailyRoutineGoal = {
    id: generateId(),
    user_id: userId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    start_date: startDate,
    end_date: endDate,
    active_days: activeDays,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.dailyRoutineGoals, db.syncQueue], async () => {
    await db.dailyRoutineGoals.add(newRoutine);
    await queueCreateOperation('daily_routine_goals', newRoutine.id, {
      user_id: userId,
      name,
      type,
      target_value: newRoutine.target_value,
      start_date: startDate,
      end_date: endDate,
      active_days: activeDays,
      order: nextOrder,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  markEntityModified(newRoutine.id);
  scheduleSyncPush();

  return newRoutine;
}

export async function updateDailyRoutineGoal(
  id: string,
  updates: Partial<
    Pick<
      DailyRoutineGoal,
      'name' | 'type' | 'target_value' | 'start_date' | 'end_date' | 'active_days'
    >
  >
): Promise<DailyRoutineGoal | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: DailyRoutineGoal | undefined;
  await db.transaction('rw', [db.dailyRoutineGoals, db.syncQueue], async () => {
    await db.dailyRoutineGoals.update(id, { ...updates, updated_at: timestamp });
    updated = await db.dailyRoutineGoals.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'daily_routine_goals',
        entityId: id,
        operationType: 'set',
        value: { ...updates, updated_at: timestamp }
      });
    }
  });

  if (updated) {
    markEntityModified(id);
    scheduleSyncPush();
  }

  return updated;
}

export async function deleteDailyRoutineGoal(id: string): Promise<void> {
  const timestamp = now();

  // Get all progress records for this routine to soft delete them (outside transaction for read)
  const progressRecords = await db.dailyGoalProgress
    .where('daily_routine_goal_id')
    .equals(id)
    .toArray();

  // Use single transaction for all deletes + queue operations (atomic)
  await db.transaction(
    'rw',
    [db.dailyRoutineGoals, db.dailyGoalProgress, db.syncQueue],
    async () => {
      // Soft delete all progress records for this routine and queue sync
      for (const progress of progressRecords) {
        await db.dailyGoalProgress.update(progress.id, { deleted: true, updated_at: timestamp });
        await queueDeleteOperation('daily_goal_progress', progress.id);
      }

      // Tombstone delete the routine and queue sync
      await db.dailyRoutineGoals.update(id, { deleted: true, updated_at: timestamp });
      await queueDeleteOperation('daily_routine_goals', id);
    }
  );

  // Mark all deleted entities as modified
  for (const progress of progressRecords) {
    markEntityModified(progress.id);
  }
  markEntityModified(id);
  scheduleSyncPush();
}

export async function reorderDailyRoutineGoal(
  id: string,
  newOrder: number
): Promise<DailyRoutineGoal | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: DailyRoutineGoal | undefined;
  await db.transaction('rw', [db.dailyRoutineGoals, db.syncQueue], async () => {
    await db.dailyRoutineGoals.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.dailyRoutineGoals.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'daily_routine_goals',
        entityId: id,
        operationType: 'set',
        field: 'order',
        value: newOrder
      });
    }
  });

  if (updated) {
    markEntityModified(id);
    scheduleSyncPush();
  }

  return updated;
}
