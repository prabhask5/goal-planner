import { db, generateId, now } from '../client';
import type { DailyGoalProgress } from '$lib/types';
import { queueSync } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

async function getProgressForRoutineAndDate(
  routineId: string,
  date: string
): Promise<DailyGoalProgress | undefined> {
  return db.dailyGoalProgress
    .where('[daily_routine_goal_id+date]')
    .equals([routineId, date])
    .first();
}

export async function upsertDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  currentValue: number,
  completed: boolean
): Promise<DailyGoalProgress> {
  const timestamp = now();

  // Check if progress exists
  const existing = await getProgressForRoutineAndDate(dailyRoutineGoalId, date);

  if (existing) {
    await db.dailyGoalProgress.update(existing.id, {
      current_value: currentValue,
      completed,
      updated_at: timestamp
    });

    const updated = await db.dailyGoalProgress.get(existing.id);
    if (updated) {
      // Queue for sync and schedule debounced push
      await queueSync('daily_goal_progress', 'update', existing.id, {
        current_value: currentValue,
        completed,
        updated_at: timestamp
      });
      scheduleSyncPush();
      return updated;
    }
  }

  // Create new progress record
  const newProgress: DailyGoalProgress = {
    id: generateId(),
    daily_routine_goal_id: dailyRoutineGoalId,
    date,
    current_value: currentValue,
    completed,
    updated_at: timestamp
  };

  await db.dailyGoalProgress.add(newProgress);

  // Queue for sync and schedule debounced push
  await queueSync('daily_goal_progress', 'create', newProgress.id, {
    daily_routine_goal_id: dailyRoutineGoalId,
    date,
    current_value: currentValue,
    completed,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return newProgress;
}

export async function incrementDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  targetValue: number,
  amount: number = 1
): Promise<DailyGoalProgress> {
  const timestamp = now();

  // Get current progress
  const existing = await getProgressForRoutineAndDate(dailyRoutineGoalId, date);

  const currentValue = existing ? existing.current_value : 0;
  const newValue = Math.min(currentValue + amount, targetValue);
  const completed = newValue >= targetValue;

  if (existing) {
    // Update local immediately
    await db.dailyGoalProgress.update(existing.id, {
      current_value: newValue,
      completed,
      updated_at: timestamp
    });

    // Queue UPDATE with final value (will be coalesced if user clicks rapidly)
    await queueSync('daily_goal_progress', 'update', existing.id, {
      current_value: newValue,
      completed,
      updated_at: timestamp
    });
    scheduleSyncPush();

    const updated = await db.dailyGoalProgress.get(existing.id);
    return updated!;
  }

  // Create new progress record
  const newProgress: DailyGoalProgress = {
    id: generateId(),
    daily_routine_goal_id: dailyRoutineGoalId,
    date,
    current_value: newValue,
    completed,
    updated_at: timestamp
  };

  await db.dailyGoalProgress.add(newProgress);

  // Queue for sync and schedule debounced push
  await queueSync('daily_goal_progress', 'create', newProgress.id, {
    daily_routine_goal_id: dailyRoutineGoalId,
    date,
    current_value: newValue,
    completed,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return newProgress;
}
