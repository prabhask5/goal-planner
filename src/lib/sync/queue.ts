import { db } from '$lib/db/client';
import type { SyncQueueItem, SyncOperation } from '$lib/types';

// Max retries before giving up on a sync item
export const MAX_SYNC_RETRIES = 5;

// Exponential backoff: check if item should be retried based on retry count
// Returns true if enough time has passed since last attempt
export function shouldRetryItem(item: SyncQueueItem): boolean {
  if (item.retries >= MAX_SYNC_RETRIES) return false;

  // Exponential backoff: 2^retries seconds (1s, 2s, 4s, 8s, 16s)
  const backoffMs = Math.pow(2, item.retries) * 1000;
  const lastAttempt = new Date(item.timestamp).getTime();
  const now = Date.now();

  return (now - lastAttempt) >= backoffMs;
}

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
  const allItems = await db.syncQueue.orderBy('timestamp').toArray();
  // Filter to only items that should be retried (haven't exceeded max retries and backoff has passed)
  return allItems.filter(item => shouldRetryItem(item));
}

// Get all pending items including those waiting for backoff
export async function getAllPendingSync(): Promise<SyncQueueItem[]> {
  return db.syncQueue.orderBy('timestamp').toArray();
}

// Remove items that have exceeded max retries
export async function cleanupFailedItems(): Promise<number> {
  const allItems = await db.syncQueue.toArray();
  const failedItems = allItems.filter(item => item.retries >= MAX_SYNC_RETRIES);

  for (const item of failedItems) {
    if (item.id) {
      await db.syncQueue.delete(item.id);
    }
  }

  return failedItems.length;
}

export async function removeSyncItem(id: number): Promise<void> {
  await db.syncQueue.delete(id);
}

export async function incrementRetry(id: number): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (item) {
    // Update retry count and timestamp for exponential backoff calculation
    await db.syncQueue.update(id, {
      retries: item.retries + 1,
      timestamp: new Date().toISOString()
    });
  }
}

// Get entity IDs that have pending sync operations
export async function getPendingEntityIds(): Promise<Set<string>> {
  const pending = await db.syncQueue.toArray();
  return new Set(pending.map(item => item.entityId));
}
