import { db, generateId, now } from '../client';
import type { GoalList } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
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

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.goalLists, db.syncQueue], async () => {
    await db.goalLists.add(newList);
    await queueCreateOperation('goal_lists', newList.id, {
      name,
      user_id: userId,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newList;
}

export async function updateGoalList(id: string, name: string): Promise<GoalList | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: GoalList | undefined;
  await db.transaction('rw', [db.goalLists, db.syncQueue], async () => {
    await db.goalLists.update(id, { name, updated_at: timestamp });
    updated = await db.goalLists.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'goal_lists',
        entityId: id,
        operationType: 'set',
        field: 'name',
        value: name
      });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

export async function deleteGoalList(id: string): Promise<void> {
  const timestamp = now();

  // Get goals first (outside transaction for read)
  const goals = await db.goals.where('goal_list_id').equals(id).toArray();

  // Use single transaction for all deletes + queue operations (atomic)
  await db.transaction('rw', [db.goalLists, db.goals, db.syncQueue], async () => {
    // Tombstone delete all goals in this list
    for (const goal of goals) {
      await db.goals.update(goal.id, { deleted: true, updated_at: timestamp });
      await queueDeleteOperation('goals', goal.id);
    }

    // Tombstone delete the list
    await db.goalLists.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('goal_lists', id);
  });

  scheduleSyncPush();
}
