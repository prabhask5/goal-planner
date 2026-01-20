import { db, generateId, now } from '../client';
import type { GoalList } from '$lib/types';
import { queueSync } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createGoalList(name: string, userId: string): Promise<GoalList> {
  const timestamp = now();
  const newList: GoalList = {
    id: generateId(),
    user_id: userId,
    name,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.goalLists.add(newList);

  // Queue for sync and schedule debounced push
  await queueSync('goal_lists', 'create', newList.id, {
    name,
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return newList;
}

export async function updateGoalList(id: string, name: string): Promise<GoalList | undefined> {
  const timestamp = now();

  await db.goalLists.update(id, { name, updated_at: timestamp });

  const updated = await db.goalLists.get(id);
  if (!updated) return undefined;

  // Queue for sync and schedule debounced push
  await queueSync('goal_lists', 'update', id, { name, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function deleteGoalList(id: string): Promise<void> {
  const timestamp = now();

  // Get goals first, then do tombstone deletes
  const goals = await db.goals.where('goal_list_id').equals(id).toArray();

  // Tombstone delete all goals in this list
  for (const goal of goals) {
    await db.goals.update(goal.id, { deleted: true, updated_at: timestamp });
    await queueSync('goals', 'delete', goal.id, { updated_at: timestamp });
  }

  // Tombstone delete the list
  await db.goalLists.update(id, { deleted: true, updated_at: timestamp });

  // Queue for sync and schedule debounced push
  await queueSync('goal_lists', 'delete', id, { updated_at: timestamp });
  scheduleSyncPush();
}
