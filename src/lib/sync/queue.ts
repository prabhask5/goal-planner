import { db } from '$lib/db/client';
import type { SyncQueueItem, SyncOperation } from '$lib/types';

export async function queueSync(
  table: SyncQueueItem['table'],
  operation: SyncOperation,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // For updates, coalesce with existing pending update for same entity
  // This prevents multiple ops when user rapidly clicks (e.g., increment spam)
  if (operation === 'update') {
    const existing = await db.syncQueue
      .where('entityId')
      .equals(entityId)
      .filter(item => item.table === table && item.operation === 'update')
      .first();

    if (existing && existing.id) {
      // Merge payloads, newer values overwrite older
      const mergedPayload = { ...existing.payload, ...payload };
      await db.syncQueue.update(existing.id, {
        payload: mergedPayload,
        timestamp: new Date().toISOString()
      });
      return;
    }
  }

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

export async function removeSyncItem(id: number): Promise<void> {
  await db.syncQueue.delete(id);
}

export async function incrementRetry(id: number): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (item) {
    await db.syncQueue.update(id, { retries: item.retries + 1 });
  }
}

// Get entity IDs that have pending sync operations
export async function getPendingEntityIds(): Promise<Set<string>> {
  const pending = await db.syncQueue.toArray();
  return new Set(pending.map(item => item.entityId));
}
