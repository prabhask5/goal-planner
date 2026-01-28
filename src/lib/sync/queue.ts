import { db } from '$lib/db/client';
import type { SyncOperationItem, SyncEntityType } from './types';

// Max retries before giving up on a sync item
const MAX_SYNC_RETRIES = 5;

// Coalesce multiple operations to the same entity into fewer operations
// This dramatically reduces the number of server requests when user rapidly
// increments a goal (e.g., 50 rapid clicks = 1 request instead of 50)
export async function coalescePendingOps(): Promise<number> {
  const allItems = await db.syncQueue.toArray() as unknown as SyncOperationItem[];
  if (allItems.length <= 1) return 0;

  // Group by table + entityId
  const grouped = new Map<string, SyncOperationItem[]>();
  for (const item of allItems) {
    const key = `${item.table}:${item.entityId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  let coalesced = 0;

  // For each group with multiple items, merge compatible operations
  for (const [, items] of grouped) {
    if (items.length <= 1) continue;

    // Separate by operation type - we can only merge same-type operations
    const setItems = items.filter(i => i.operationType === 'set');

    // Coalesce multiple set operations to the same entity
    if (setItems.length > 1) {
      // Sort by timestamp (oldest first)
      setItems.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Merge all values into the latest item (later values override earlier)
      let mergedValue: Record<string, unknown> = {};
      for (const item of setItems) {
        if (item.field) {
          // Single field set
          mergedValue[item.field] = item.value;
        } else if (typeof item.value === 'object' && item.value !== null) {
          // Multi-field set
          mergedValue = { ...mergedValue, ...(item.value as Record<string, unknown>) };
        }
      }

      // Keep the OLDEST item (so it passes the backoff check) but with merged value
      const oldestItem = setItems[0];
      const itemsToDelete = setItems.slice(1);

      // Update the oldest item with merged value (keeps original timestamp for backoff)
      if (oldestItem.id) {
        await db.syncQueue.update(oldestItem.id, {
          value: mergedValue,
          field: undefined, // Clear single field since we now have merged payload
        });
      }

      // Delete newer items (they've been merged into the oldest)
      for (const item of itemsToDelete) {
        if (item.id) {
          await db.syncQueue.delete(item.id);
          coalesced++;
        }
      }
    }

    // Note: increment operations are NOT coalesced in Phase 1
    // Phase 2 will add true intent-preserving coalescing that sums increments
  }

  return coalesced;
}

// Exponential backoff: check if item should be retried based on retry count
// Returns true if enough time has passed since last attempt
function shouldRetryItem(item: SyncOperationItem): boolean {
  if (item.retries >= MAX_SYNC_RETRIES) return false;

  // First attempt (retries=0) is always immediate
  if (item.retries === 0) return true;

  // Exponential backoff for retries: 2^(retries-1) seconds (1s, 2s, 4s, 8s)
  const backoffMs = Math.pow(2, item.retries - 1) * 1000;
  const lastAttempt = new Date(item.timestamp).getTime();
  const now = Date.now();

  return (now - lastAttempt) >= backoffMs;
}

export async function getPendingSync(): Promise<SyncOperationItem[]> {
  const allItems = await db.syncQueue.orderBy('timestamp').toArray() as unknown as SyncOperationItem[];
  // Filter to only items that should be retried (haven't exceeded max retries and backoff has passed)
  return allItems.filter(item => shouldRetryItem(item));
}

// Remove items that have exceeded max retries and return details for notification
export async function cleanupFailedItems(): Promise<{ count: number; tables: string[] }> {
  const allItems = await db.syncQueue.toArray() as unknown as SyncOperationItem[];
  const failedItems = allItems.filter(item => item.retries >= MAX_SYNC_RETRIES);

  const affectedTables = new Set<string>();

  for (const item of failedItems) {
    affectedTables.add(item.table);
    if (item.id) {
      console.warn(`Sync item permanently failed after ${MAX_SYNC_RETRIES} retries:`, {
        table: item.table,
        operationType: item.operationType,
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
  const pending = await db.syncQueue.toArray() as unknown as SyncOperationItem[];
  return new Set(pending.map(item => item.entityId));
}

/**
 * Queue a sync operation using the intent-based format.
 *
 * This preserves the operation's intent (e.g., "increment by 1" vs "set to 50"),
 * enabling proper multi-device conflict resolution in future phases.
 *
 * @param item The sync operation item (without id, timestamp, and retries)
 */
export async function queueSyncOperation(
  item: Omit<SyncOperationItem, 'id' | 'timestamp' | 'retries'>
): Promise<void> {
  // Note: We intentionally skip queue size check because:
  // 1. This is called within Dexie transactions for atomicity
  // 2. The local data is already saved, we must record the sync intent
  // 3. Failing here would break transaction atomicity
  // The queue will eventually drain

  const fullItem: SyncOperationItem = {
    ...item,
    timestamp: new Date().toISOString(),
    retries: 0,
  };

  await db.syncQueue.add(fullItem);
}

/**
 * Helper to queue an increment operation.
 * Convenience wrapper around queueSyncOperation for the common increment case.
 */
export async function queueIncrementOperation(
  table: SyncEntityType,
  entityId: string,
  field: string,
  delta: number
): Promise<void> {
  await queueSyncOperation({
    table,
    entityId,
    operationType: 'increment',
    field,
    value: delta,
  });
}

/**
 * Helper to queue a set operation for a single field.
 */
export async function queueSetOperation(
  table: SyncEntityType,
  entityId: string,
  field: string,
  value: unknown
): Promise<void> {
  await queueSyncOperation({
    table,
    entityId,
    operationType: 'set',
    field,
    value,
  });
}

/**
 * Helper to queue a set operation for multiple fields.
 */
export async function queueMultiFieldSetOperation(
  table: SyncEntityType,
  entityId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await queueSyncOperation({
    table,
    entityId,
    operationType: 'set',
    value: fields,
  });
}

/**
 * Helper to queue a create operation.
 */
export async function queueCreateOperation(
  table: SyncEntityType,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await queueSyncOperation({
    table,
    entityId,
    operationType: 'create',
    value: payload,
  });
}

/**
 * Helper to queue a delete operation.
 */
export async function queueDeleteOperation(
  table: SyncEntityType,
  entityId: string
): Promise<void> {
  await queueSyncOperation({
    table,
    entityId,
    operationType: 'delete',
  });
}
