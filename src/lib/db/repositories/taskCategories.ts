import { db, generateId, now } from '../client';
import type { TaskCategory } from '$lib/types';
import { queueSync, queueSyncDirect } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createTaskCategory(name: string, color: string, userId: string): Promise<TaskCategory> {
  const timestamp = now();

  // Get the lowest order to insert at the top (outside transaction for read)
  const existing = await db.taskCategories.where('user_id').equals(userId).toArray();
  const minOrder = existing.length > 0 ? Math.min(...existing.map(c => c.order)) - 1 : 0;

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
    await queueSyncDirect('task_categories', 'create', newCategory.id, {
      name,
      color,
      order: minOrder,
      user_id: userId,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newCategory;
}

export async function updateTaskCategory(id: string, updates: Partial<Pick<TaskCategory, 'name' | 'color'>>): Promise<TaskCategory | undefined> {
  const timestamp = now();

  await db.taskCategories.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.taskCategories.get(id);
  if (!updated) return undefined;

  await queueSync('task_categories', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

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
    await queueSyncDirect('task_categories', 'delete', id, { updated_at: timestamp });

    // Update any long_term_tasks that reference this category to have null category_id
    for (const task of tasks) {
      await db.longTermTasks.update(task.id, { category_id: null, updated_at: timestamp });
      await queueSyncDirect('long_term_tasks', 'update', task.id, { category_id: null, updated_at: timestamp });
    }
  });

  scheduleSyncPush();
}

export async function reorderTaskCategory(id: string, newOrder: number): Promise<TaskCategory | undefined> {
  const timestamp = now();

  await db.taskCategories.update(id, { order: newOrder, updated_at: timestamp });

  const updated = await db.taskCategories.get(id);
  if (!updated) return undefined;

  await queueSync('task_categories', 'update', id, { order: newOrder, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}
