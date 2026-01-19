import { db, generateId, now } from '../client';
import type { DailyRoutineGoal, GoalType } from '$lib/types';
import { queueSync } from '$lib/sync/queue';

export async function getDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  return db.dailyRoutineGoals.orderBy('created_at').reverse().toArray();
}

export async function getDailyRoutineGoal(id: string): Promise<DailyRoutineGoal | undefined> {
  return db.dailyRoutineGoals.get(id);
}

export async function getActiveRoutinesForDate(date: string): Promise<DailyRoutineGoal[]> {
  // Get routines where start_date <= date AND (end_date is null OR end_date >= date)
  const allRoutines = await db.dailyRoutineGoals.toArray();

  return allRoutines.filter((routine) => {
    if (routine.start_date > date) return false;
    if (routine.end_date && routine.end_date < date) return false;
    return true;
  });
}

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

  // Queue for sync
  await queueSync('daily_routine_goals', 'create', newRoutine.id, {
    user_id: userId,
    name,
    type,
    target_value: newRoutine.target_value,
    start_date: startDate,
    end_date: endDate
  });

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

  // Queue for sync
  await queueSync('daily_routine_goals', 'update', id, updates);

  return updated;
}

export async function deleteDailyRoutineGoal(id: string): Promise<void> {
  await db.transaction('rw', [db.dailyRoutineGoals, db.dailyGoalProgress], async () => {
    // Delete all progress records for this routine
    await db.dailyGoalProgress.where('daily_routine_goal_id').equals(id).delete();
    await db.dailyRoutineGoals.delete(id);
  });

  // Queue for sync
  await queueSync('daily_routine_goals', 'delete', id, {});
}
