import { db, generateId, now } from '../client';
import type { GoalList } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

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
  markEntityModified(newList.id);
  scheduleSyncPush();

  return newList;
}

export async function updateGoalList(id: string, name: string): Promise<GoalList | undefined> {
  const timestamp = now();

  // Get the goal list first to check if it belongs to a project
  const goalList = await db.goalLists.get(id);
  if (!goalList) return undefined;

  // Use transaction to ensure atomicity
  let updated: GoalList | undefined;
  await db.transaction(
    'rw',
    [db.goalLists, db.projects, db.taskCategories, db.commitments, db.syncQueue],
    async () => {
      // Update the goal list
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

      // If this goal list belongs to a project, also update the project name
      // (which cascades to tag and commitment names)
      if (goalList.project_id) {
        const project = await db.projects.get(goalList.project_id);
        if (project) {
          // Update project name
          await db.projects.update(project.id, { name, updated_at: timestamp });
          await queueSyncOperation({
            table: 'projects',
            entityId: project.id,
            operationType: 'set',
            value: { name, updated_at: timestamp }
          });
          markEntityModified(project.id);

          // Update associated tag name
          if (project.tag_id) {
            await db.taskCategories.update(project.tag_id, { name, updated_at: timestamp });
            await queueSyncOperation({
              table: 'task_categories',
              entityId: project.tag_id,
              operationType: 'set',
              value: { name, updated_at: timestamp }
            });
            markEntityModified(project.tag_id);
          }

          // Update associated commitment name
          if (project.commitment_id) {
            await db.commitments.update(project.commitment_id, { name, updated_at: timestamp });
            await queueSyncOperation({
              table: 'commitments',
              entityId: project.commitment_id,
              operationType: 'set',
              value: { name, updated_at: timestamp }
            });
            markEntityModified(project.commitment_id);
          }
        }
      }
    }
  );

  if (updated) {
    markEntityModified(id);
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

  // Mark all deleted entities as modified
  for (const goal of goals) {
    markEntityModified(goal.id);
  }
  markEntityModified(id);
  scheduleSyncPush();
}
