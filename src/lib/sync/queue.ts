import { db } from '$lib/db/client';
import type { SyncQueueItem, SyncOperation } from '$lib/types';

// Max retries before giving up on a sync item
const MAX_SYNC_RETRIES = 5;

// Max queue size to prevent memory issues on low-end devices
const MAX_QUEUE_SIZE = 1000;

// Coalesce multiple updates to the same entity into a single update
// This dramatically reduces the number of server requests when user rapidly
// increments a goal (e.g., 50 rapid clicks = 1 request instead of 50)
export async function coalescePendingOps(): Promise<number> {
  const allItems = await db.syncQueue.toArray();
  if (allItems.length <= 1) return 0;

  // Group by table + entityId
  const grouped = new Map<string, SyncQueueItem[]>();
  for (const item of allItems) {
    const key = `${item.table}:${item.entityId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  let coalesced = 0;

  // For each group with multiple items of the same operation type, merge them
  for (const [, items] of grouped) {
    if (items.length <= 1) continue;

    // Separate by operation type - we can only merge same-type operations
    const updateItems = items.filter(i => i.operation === 'update');

    // Coalesce multiple updates to the same entity
    if (updateItems.length > 1) {
      // Sort by timestamp (oldest first)
      updateItems.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Merge all payloads into the latest item (later values override earlier)
      let mergedPayload: Record<string, unknown> = {};
      for (const item of updateItems) {
        mergedPayload = { ...mergedPayload, ...item.payload };
      }

      // Keep the latest item, update its payload with merged data
      const latestItem = updateItems[updateItems.length - 1];
      const itemsToDelete = updateItems.slice(0, -1);

      // Update the latest item with merged payload
      if (latestItem.id) {
        await db.syncQueue.update(latestItem.id, {
          payload: mergedPayload,
          // Reset retries since this is effectively a new merged operation
          retries: 0,
          timestamp: new Date().toISOString()
        });
      }

      // Delete older items
      for (const item of itemsToDelete) {
        if (item.id) {
          await db.syncQueue.delete(item.id);
          coalesced++;
        }
      }
    }
  }

  return coalesced;
}

// Exponential backoff: check if item should be retried based on retry count
// Returns true if enough time has passed since last attempt
function shouldRetryItem(item: SyncQueueItem): boolean {
  if (item.retries >= MAX_SYNC_RETRIES) return false;

  // Exponential backoff: 2^retries seconds (1s, 2s, 4s, 8s, 16s)
  const backoffMs = Math.pow(2, item.retries) * 1000;
  const lastAttempt = new Date(item.timestamp).getTime();
  const now = Date.now();

  return (now - lastAttempt) >= backoffMs;
}

export async function getPendingSync(): Promise<SyncQueueItem[]> {
  const allItems = await db.syncQueue.orderBy('timestamp').toArray();
  // Filter to only items that should be retried (haven't exceeded max retries and backoff has passed)
  return allItems.filter(item => shouldRetryItem(item));
}

// Remove items that have exceeded max retries and return details for notification
export async function cleanupFailedItems(): Promise<{ count: number; tables: string[] }> {
  const allItems = await db.syncQueue.toArray();
  const failedItems = allItems.filter(item => item.retries >= MAX_SYNC_RETRIES);

  const affectedTables = new Set<string>();

  for (const item of failedItems) {
    affectedTables.add(item.table);
    if (item.id) {
      console.warn(`Sync item permanently failed after ${MAX_SYNC_RETRIES} retries:`, {
        table: item.table,
        operation: item.operation,
        entityId: item.entityId
      });
      await db.syncQueue.delete(item.id);
    }
  }

  return {
    count: failedItems.length,
    tables: Array.from(affectedTables)
  };
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

// Queue a sync operation for background push to server
// This is designed to be called within Dexie transactions to ensure atomicity
// between local DB writes and sync queue entries - preventing race conditions
// where a sync pull could overwrite local changes before they're queued
export async function queueSyncDirect(
  table: SyncQueueItem['table'],
  operation: SyncOperation,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Note: We intentionally skip MAX_QUEUE_SIZE check here because:
  // 1. This is called within Dexie transactions for atomicity
  // 2. The local data is already saved, we must record the sync intent
  // 3. Failing here would break transaction atomicity
  // The queue will eventually drain, and MAX_QUEUE_SIZE is a soft limit

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
