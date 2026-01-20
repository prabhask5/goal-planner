import { db, generateId, now } from '../client';
import type { DailyRoutineGoal, GoalType } from '$lib/types';
import { queueSync, queueSyncDirect } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createDailyRoutineGoal(
  name: string,
  type: GoalType,
  targetValue: number | null,
  startDate: string,
  endDate: string | null,
  userId: string
): Promise<DailyRoutineGoal> {
  const timestamp = now();

  // Get the current max order (outside transaction for read)
  const existingRoutines = await db.dailyRoutineGoals
    .where('user_id')
    .equals(userId)
    .toArray();

  const maxOrder = existingRoutines.reduce((max, r) => Math.max(max, r.order ?? -1), -1);
  const nextOrder = maxOrder + 1;

  const newRoutine: DailyRoutineGoal = {
    id: generateId(),
    user_id: userId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    start_date: startDate,
    end_date: endDate,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.dailyRoutineGoals, db.syncQueue], async () => {
    await db.dailyRoutineGoals.add(newRoutine);
    await queueSyncDirect('daily_routine_goals', 'create', newRoutine.id, {
      user_id: userId,
      name,
      type,
      target_value: newRoutine.target_value,
      start_date: startDate,
      end_date: endDate,
      order: nextOrder,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newRoutine;
}

export async function updateDailyRoutineGoal(
  id: string,
  updates: Partial<Pick<DailyRoutineGoal, 'name' | 'type' | 'target_value' | 'start_date' | 'end_date'>>
): Promise<DailyRoutineGoal | undefined> {
  const timestamp = now();

  await db.dailyRoutineGoals.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.dailyRoutineGoals.get(id);
  if (!updated) return undefined;

  // Queue for sync and schedule debounced push
  await queueSync('daily_routine_goals', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

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
  await db.transaction('rw', [db.dailyRoutineGoals, db.dailyGoalProgress, db.syncQueue], async () => {
    // Soft delete all progress records for this routine and queue sync
    for (const progress of progressRecords) {
      await db.dailyGoalProgress.update(progress.id, { deleted: true, updated_at: timestamp });
      await queueSyncDirect('daily_goal_progress', 'delete', progress.id, { updated_at: timestamp });
    }

    // Tombstone delete the routine and queue sync
    await db.dailyRoutineGoals.update(id, { deleted: true, updated_at: timestamp });
    await queueSyncDirect('daily_routine_goals', 'delete', id, { updated_at: timestamp });
  });

  scheduleSyncPush();
}

export async function reorderDailyRoutineGoal(id: string, newOrder: number): Promise<DailyRoutineGoal | undefined> {
  const timestamp = now();

  await db.dailyRoutineGoals.update(id, { order: newOrder, updated_at: timestamp });

  const updated = await db.dailyRoutineGoals.get(id);
  if (!updated) return undefined;

  // Queue for sync and schedule debounced push
  await queueSync('daily_routine_goals', 'update', id, { order: newOrder, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}
