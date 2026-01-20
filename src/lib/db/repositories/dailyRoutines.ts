import { db, generateId, now } from '../client';
import type { DailyRoutineGoal, GoalType } from '$lib/types';
import { queueSync } from '$lib/sync/queue';
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

  const newRoutine: DailyRoutineGoal = {
    id: generateId(),
    user_id: userId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    start_date: startDate,
    end_date: endDate,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.dailyRoutineGoals.add(newRoutine);

  // Queue for sync and schedule debounced push
  await queueSync('daily_routine_goals', 'create', newRoutine.id, {
    user_id: userId,
    name,
    type,
    target_value: newRoutine.target_value,
    start_date: startDate,
    end_date: endDate,
    created_at: timestamp,
    updated_at: timestamp
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

  await db.transaction('rw', [db.dailyRoutineGoals, db.dailyGoalProgress], async () => {
    // Delete all progress records for this routine (progress can be hard deleted)
    await db.dailyGoalProgress.where('daily_routine_goal_id').equals(id).delete();
    // Tombstone delete the routine
    await db.dailyRoutineGoals.update(id, { deleted: true, updated_at: timestamp });
  });

  // Queue for sync and schedule debounced push
  await queueSync('daily_routine_goals', 'delete', id, { updated_at: timestamp });
  scheduleSyncPush();
}
