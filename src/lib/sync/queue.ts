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

// Get entity IDs that have pending sync operations
export async function getPendingEntityIds(): Promise<Set<string>> {
  const pending = await db.syncQueue.toArray();
  return new Set(pending.map(item => item.entityId));
}

// Get pending items mapped by entity ID for timestamp comparison
export async function getPendingItemsByEntityId(): Promise<Map<string, SyncQueueItem>> {
  const pending = await db.syncQueue.toArray();
  const map = new Map<string, SyncQueueItem>();
  // Keep the most recent sync item for each entity
  for (const item of pending) {
    const existing = map.get(item.entityId);
    if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
      map.set(item.entityId, item);
    }
  }
  return map;
}

// Remove sync items for a specific entity
export async function removeSyncItemsForEntity(entityId: string): Promise<void> {
  const items = await db.syncQueue.where('entityId').equals(entityId).toArray();
  for (const item of items) {
    if (item.id) {
      await db.syncQueue.delete(item.id);
    }
  }
}
