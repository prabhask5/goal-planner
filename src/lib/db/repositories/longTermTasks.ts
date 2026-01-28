import { db, generateId, now } from '../client';
import type { LongTermTask } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createLongTermTask(
  name: string,
  dueDate: string,
  categoryId: string | null,
  userId: string
): Promise<LongTermTask> {
  const timestamp = now();

  const newTask: LongTermTask = {
    id: generateId(),
    user_id: userId,
    name,
    due_date: dueDate,
    category_id: categoryId,
    completed: false,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.longTermTasks, db.syncQueue], async () => {
    await db.longTermTasks.add(newTask);
    await queueCreateOperation('long_term_tasks', newTask.id, {
      name,
      due_date: dueDate,
      category_id: categoryId,
      completed: false,
      user_id: userId,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newTask;
}

export async function updateLongTermTask(
  id: string,
  updates: Partial<Pick<LongTermTask, 'name' | 'due_date' | 'category_id' | 'completed'>>
): Promise<LongTermTask | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: LongTermTask | undefined;
  await db.transaction('rw', [db.longTermTasks, db.syncQueue], async () => {
    await db.longTermTasks.update(id, { ...updates, updated_at: timestamp });
    updated = await db.longTermTasks.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'long_term_tasks',
        entityId: id,
        operationType: 'set',
        value: { ...updates, updated_at: timestamp }
      });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

export async function toggleLongTermTaskComplete(id: string): Promise<LongTermTask | undefined> {
  const task = await db.longTermTasks.get(id);
  if (!task) return undefined;

  const timestamp = now();
  const newCompleted = !task.completed;

  // Use transaction to ensure atomicity
  let updated: LongTermTask | undefined;
  await db.transaction('rw', [db.longTermTasks, db.syncQueue], async () => {
    await db.longTermTasks.update(id, { completed: newCompleted, updated_at: timestamp });
    updated = await db.longTermTasks.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'long_term_tasks',
        entityId: id,
        operationType: 'set',
        field: 'completed',
        value: newCompleted
      });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

export async function deleteLongTermTask(id: string): Promise<void> {
  const timestamp = now();

  // Use transaction to ensure atomicity of delete + queue operation
  await db.transaction('rw', [db.longTermTasks, db.syncQueue], async () => {
    // Tombstone delete
    await db.longTermTasks.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('long_term_tasks', id);
  });
  scheduleSyncPush();
}
