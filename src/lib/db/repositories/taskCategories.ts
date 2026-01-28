import { db, generateId, now } from '../client';
import type { TaskCategory } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush, markEntityModified } from '$lib/sync/engine';

export async function createTaskCategory(
  name: string,
  color: string,
  userId: string
): Promise<TaskCategory> {
  const timestamp = now();

  // Get the lowest order to insert at the top (outside transaction for read)
  const existing = await db.taskCategories.where('user_id').equals(userId).toArray();
  const minOrder = existing.length > 0 ? Math.min(...existing.map((c) => c.order)) - 1 : 0;

  const newCategory: TaskCategory = {
    id: generateId(),
    user_id: userId,
    name,
    color,
    order: minOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.taskCategories, db.syncQueue], async () => {
    await db.taskCategories.add(newCategory);
    await queueCreateOperation('task_categories', newCategory.id, {
      name,
      color,
      order: minOrder,
      user_id: userId,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  markEntityModified(newCategory.id);
  scheduleSyncPush();

  return newCategory;
}

export async function updateTaskCategory(
  id: string,
  updates: Partial<Pick<TaskCategory, 'name' | 'color'>>
): Promise<TaskCategory | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: TaskCategory | undefined;
  await db.transaction('rw', [db.taskCategories, db.syncQueue], async () => {
    await db.taskCategories.update(id, { ...updates, updated_at: timestamp });
    updated = await db.taskCategories.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'task_categories',
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

export async function deleteTaskCategory(id: string): Promise<void> {
  const timestamp = now();

  // Get tasks that reference this category (outside transaction for read)
  const tasks = await db.longTermTasks.where('category_id').equals(id).toArray();

  // Use single transaction for all updates + queue operations (atomic)
  await db.transaction('rw', [db.taskCategories, db.longTermTasks, db.syncQueue], async () => {
    // Tombstone delete the category
    await db.taskCategories.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('task_categories', id);

    // Update any long_term_tasks that reference this category to have null category_id
    for (const task of tasks) {
      await db.longTermTasks.update(task.id, { category_id: null, updated_at: timestamp });
      await queueSyncOperation({
        table: 'long_term_tasks',
        entityId: task.id,
        operationType: 'set',
        field: 'category_id',
        value: null
      });
    }
  });

  // Mark all modified entities
  markEntityModified(id);
  for (const task of tasks) {
    markEntityModified(task.id);
  }
  scheduleSyncPush();
}

export async function reorderTaskCategory(
  id: string,
  newOrder: number
): Promise<TaskCategory | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: TaskCategory | undefined;
  await db.transaction('rw', [db.taskCategories, db.syncQueue], async () => {
    await db.taskCategories.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.taskCategories.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'task_categories',
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
