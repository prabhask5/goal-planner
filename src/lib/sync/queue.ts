import { db } from '$lib/db/client';
import type { SyncQueueItem, SyncOperation } from '$lib/types';

export async function queueSync(
  table: SyncQueueItem['table'],
  operation: SyncOperation,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const item: SyncQueueItem = {
    table,
    operation,
    entityId,
    payload,
    timestamp: new Date().toISOString(),
    retries: 0
  };

  await db.syncQueue.add(item);
}

export async function getPendingSync(): Promise<SyncQueueItem[]> {
  return db.syncQueue.orderBy('timestamp').toArray();
}

export async function getPendingCount(): Promise<number> {
  return db.syncQueue.count();
}

export async function removeSyncItem(id: number): Promise<void> {
  await db.syncQueue.delete(id);
}

export async function incrementRetry(id: number): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (item) {
    await db.syncQueue.update(id, { retries: item.retries + 1 });
  }
}

export async function clearSyncQueue(): Promise<void> {
  await db.syncQueue.clear();
}

// Remove items that have failed too many times (max 5 retries)
export async function pruneFailedItems(): Promise<void> {
  const items = await db.syncQueue.toArray();
  for (const item of items) {
    if (item.id && item.retries >= 5) {
      await db.syncQueue.delete(item.id);
    }
  }
}
