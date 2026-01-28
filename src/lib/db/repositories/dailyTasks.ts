import { db, generateId, now } from '../client';
import type { DailyTask } from '$lib/types';
import { queueCreateOperation, queueDeleteOperation, queueSyncOperation } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createDailyTask(name: string, userId: string): Promise<DailyTask> {
  const timestamp = now();

  // Get the lowest order to prepend new items at the top
  // This is backwards-compatible: existing items (order 0,1,2...) stay in place,
  // new items get -1,-2,-3... and appear first when sorted ascending
  const existing = await db.dailyTasks.where('user_id').equals(userId).toArray();
  const activeItems = existing.filter(t => !t.deleted);
  const minOrder = activeItems.length > 0
    ? Math.min(...activeItems.map(t => t.order))
    : 0;
  const nextOrder = minOrder - 1;

  const newTask: DailyTask = {
    id: generateId(),
    user_id: userId,
    name,
    order: nextOrder,
    completed: false,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
    await db.dailyTasks.add(newTask);
    await queueCreateOperation('daily_tasks', newTask.id, {
      name,
      order: nextOrder,
      completed: false,
      user_id: userId,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newTask;
}

export async function updateDailyTask(id: string, updates: Partial<Pick<DailyTask, 'name' | 'completed'>>): Promise<DailyTask | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: DailyTask | undefined;
  await db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
    await db.dailyTasks.update(id, { ...updates, updated_at: timestamp });
    updated = await db.dailyTasks.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'daily_tasks',
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

export async function toggleDailyTaskComplete(id: string): Promise<DailyTask | undefined> {
  const task = await db.dailyTasks.get(id);
  if (!task) return undefined;

  const timestamp = now();
  const newCompleted = !task.completed;

  // Use transaction to ensure atomicity
  let updated: DailyTask | undefined;
  await db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
    await db.dailyTasks.update(id, { completed: newCompleted, updated_at: timestamp });
    updated = await db.dailyTasks.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'daily_tasks',
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

export async function deleteDailyTask(id: string): Promise<void> {
  const timestamp = now();

  // Use transaction to ensure atomicity of delete + queue operation
  await db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
    // Tombstone delete
    await db.dailyTasks.update(id, { deleted: true, updated_at: timestamp });
    await queueDeleteOperation('daily_tasks', id);
  });
  scheduleSyncPush();
}

export async function reorderDailyTask(id: string, newOrder: number): Promise<DailyTask | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: DailyTask | undefined;
  await db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
    await db.dailyTasks.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.dailyTasks.get(id);
    if (updated) {
      await queueSyncOperation({
        table: 'daily_tasks',
        entityId: id,
        operationType: 'set',
        field: 'order',
        value: newOrder
      });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

export async function clearCompletedDailyTasks(userId: string): Promise<void> {
  const timestamp = now();

  // Get tasks outside transaction for read
  const tasks = await db.dailyTasks.where('user_id').equals(userId).toArray();
  const completedTasks = tasks.filter(t => t.completed && !t.deleted);

  if (completedTasks.length === 0) return;

  // Use single transaction for all deletes + queue operations (atomic)
  await db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
    for (const task of completedTasks) {
      await db.dailyTasks.update(task.id, { deleted: true, updated_at: timestamp });
      await queueDeleteOperation('daily_tasks', task.id);
    }
  });

  scheduleSyncPush();
}
