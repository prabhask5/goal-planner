import { db, generateId, now } from '../client';
import type { Goal, GoalType } from '$lib/types';
import { queueSync } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createGoal(
  goalListId: string,
  name: string,
  type: GoalType,
  targetValue: number | null
): Promise<Goal> {
  const timestamp = now();

  // Get the current max order
  const existingGoals = await db.goals
    .where('goal_list_id')
    .equals(goalListId)
    .toArray();

  const maxOrder = existingGoals.reduce((max, g) => Math.max(max, g.order), -1);
  const nextOrder = maxOrder + 1;

  const newGoal: Goal = {
    id: generateId(),
    goal_list_id: goalListId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    current_value: 0,
    completed: false,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.goals.add(newGoal);

  // Queue for sync and schedule debounced push
  await queueSync('goals', 'create', newGoal.id, {
    goal_list_id: goalListId,
    name,
    type,
    target_value: newGoal.target_value,
    current_value: 0,
    completed: false,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return newGoal;
}

export async function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>
): Promise<Goal | undefined> {
  const timestamp = now();

  await db.goals.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.goals.get(id);
  if (!updated) return undefined;

  // Queue for sync and schedule debounced push
  await queueSync('goals', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id);

  // Queue for sync and schedule debounced push
  await queueSync('goals', 'delete', id, {});
  scheduleSyncPush();
}

export async function incrementGoal(id: string, amount: number = 1): Promise<Goal | undefined> {
  const goal = await db.goals.get(id);
  if (!goal) return undefined;

  const newValue = Math.min(goal.current_value + amount, goal.target_value || Infinity);
  const completed = goal.target_value ? newValue >= goal.target_value : false;

  return updateGoal(id, { current_value: newValue, completed });
}

export async function getGoalsByListId(goalListId: string): Promise<Goal[]> {
  const goals = await db.goals
    .where('goal_list_id')
    .equals(goalListId)
    .toArray();

  return goals.sort((a, b) => a.order - b.order);
}
