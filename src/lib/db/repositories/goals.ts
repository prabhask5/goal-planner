import { db, generateId, now } from '../client';
import type { Goal, GoalType } from '$lib/types';
import { queueSync, queueSyncDirect } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createGoal(
  goalListId: string,
  name: string,
  type: GoalType,
  targetValue: number | null
): Promise<Goal> {
  const timestamp = now();

  // Get the current max order (outside transaction for read)
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

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    await db.goals.add(newGoal);
    await queueSyncDirect('goals', 'create', newGoal.id, {
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
  const timestamp = now();

  // Use transaction to ensure atomicity of delete + queue operation
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    // Tombstone delete: mark as deleted instead of actually deleting
    await db.goals.update(id, { deleted: true, updated_at: timestamp });
    await queueSyncDirect('goals', 'delete', id, { updated_at: timestamp });
  });

  scheduleSyncPush();
}

export async function incrementGoal(id: string, amount: number = 1): Promise<Goal | undefined> {
  const goal = await db.goals.get(id);
  if (!goal) return undefined;

  const timestamp = now();
  const newValue = Math.min(goal.current_value + amount, goal.target_value || Infinity);
  const completed = goal.target_value ? newValue >= goal.target_value : false;

  // Update local immediately
  await db.goals.update(id, { current_value: newValue, completed, updated_at: timestamp });

  // Queue UPDATE with final value (will be coalesced if user clicks rapidly)
  await queueSync('goals', 'update', id, {
    current_value: newValue,
    completed,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return db.goals.get(id);
}

export async function reorderGoal(id: string, newOrder: number): Promise<Goal | undefined> {
  const timestamp = now();

  await db.goals.update(id, { order: newOrder, updated_at: timestamp });

  const updated = await db.goals.get(id);
  if (!updated) return undefined;

  // Queue for sync and schedule debounced push
  await queueSync('goals', 'update', id, { order: newOrder, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

