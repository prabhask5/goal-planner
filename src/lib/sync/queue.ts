import { db } from '$lib/db/client';
import type { SyncQueueItem, SyncOperationType, SyncQueueTable } from '$lib/types';

// Max retries before giving up on a sync item
const MAX_SYNC_RETRIES = 5;

/**
 * Operation-aware coalescing for the sync queue.
 *
 * Coalescing rules:
 * - increment + increment → sum deltas
 * - decrement + decrement → sum deltas
 * - increment + decrement → net delta (may cancel out)
 * - toggle + toggle → cancel out (remove both)
 * - update + update → merge fields (later wins per field)
 * - create + update → merge into create
 * - create + delete → remove both (entity never existed server-side)
 * - update + delete → keep delete only
 */
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

  for (const [key, items] of grouped) {
    if (items.length <= 1) continue;

    // Sort by timestamp (oldest first)
    items.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Check for create + delete cancellation
    const hasCreate = items.some(o => o.operation === 'create');
    const hasDelete = items.some(o => o.operation === 'delete');

    if (hasCreate && hasDelete) {
      // Entity was created then deleted - never existed server-side
      // Remove all operations for this entity
      for (const item of items) {
        if (item.id) {
          await db.syncQueue.delete(item.id);
          coalesced++;
        }
      }
      // Don't subtract 1 for the "kept" item since we're removing everything
      coalesced--; // Adjust since we want count of "removed" items
      continue;
    }

    // Handle increment operations - sum deltas
    const incrementOps = items.filter(o =>
      o.operation === 'increment' || o.operation === 'decrement'
    );
    if (incrementOps.length > 1) {
      // Group by field
      const byField = new Map<string, SyncQueueItem[]>();
      for (const op of incrementOps) {
        const field = op.payload.field as string;
        if (!byField.has(field)) byField.set(field, []);
        byField.get(field)!.push(op);
      }

      for (const [field, ops] of byField) {
        if (ops.length <= 1) continue;

        // Sum all deltas
        let totalDelta = 0;
        for (const op of ops) {
          const delta = (op.payload.delta as number) || 0;
          if (op.operation === 'decrement') {
            totalDelta -= delta;
          } else {
            totalDelta += delta;
          }
        }

        if (totalDelta === 0) {
          // Deltas cancelled out - remove all
          for (const op of ops) {
            if (op.id) {
              await db.syncQueue.delete(op.id);
              coalesced++;
            }
          }
        } else {
          // Keep oldest, update with total delta
          const oldest = ops[0];
          const newOperation: SyncOperationType = totalDelta > 0 ? 'increment' : 'decrement';

          if (oldest.id) {
            await db.syncQueue.update(oldest.id, {
              operation: newOperation,
              payload: {
                ...oldest.payload,
                field,
                delta: Math.abs(totalDelta)
              }
            });
          }

          // Delete the rest
          for (let i = 1; i < ops.length; i++) {
            if (ops[i].id !== undefined) {
              await db.syncQueue.delete(ops[i].id!);
              coalesced++;
            }
          }
        }
      }
    }

    // Handle toggle operations - cancel out pairs
    const toggleOps = items.filter(o => o.operation === 'toggle');
    if (toggleOps.length > 1) {
      // Group by field
      const byField = new Map<string, SyncQueueItem[]>();
      for (const op of toggleOps) {
        const field = op.payload.field as string;
        if (!byField.has(field)) byField.set(field, []);
        byField.get(field)!.push(op);
      }

      for (const [, ops] of byField) {
        if (ops.length <= 1) continue;

        if (ops.length % 2 === 0) {
          // Even number of toggles = no-op, remove all
          for (const op of ops) {
            if (op.id) {
              await db.syncQueue.delete(op.id);
              coalesced++;
            }
          }
        } else {
          // Odd number of toggles = single toggle, keep oldest
          for (let i = 1; i < ops.length; i++) {
            if (ops[i].id !== undefined) {
              await db.syncQueue.delete(ops[i].id!);
              coalesced++;
            }
          }
        }
      }
    }

    // Handle update operations - merge payloads
    // Re-fetch items since some may have been deleted
    const remainingItems = (await db.syncQueue.toArray())
      .filter(i => `${i.table}:${i.entityId}` === key);

    const updateItems = remainingItems.filter(i => i.operation === 'update');

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

      // Keep the OLDEST item (so it passes the backoff check) but with merged payload
      const oldestItem = updateItems[0];
      const itemsToDelete = updateItems.slice(1);

      // Update the oldest item with merged payload
      if (oldestItem.id) {
        await db.syncQueue.update(oldestItem.id, {
          payload: mergedPayload,
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

    // Handle create + update = merge into create
    const refetchedItems = (await db.syncQueue.toArray())
      .filter(i => `${i.table}:${i.entityId}` === key);

    const createOp = refetchedItems.find(i => i.operation === 'create');
    const updateOpsAfterCreate = refetchedItems.filter(i => i.operation === 'update');

    if (createOp && updateOpsAfterCreate.length > 0) {
      // Merge updates into create
      let mergedPayload = { ...createOp.payload };
      for (const updateOp of updateOpsAfterCreate) {
        mergedPayload = { ...mergedPayload, ...updateOp.payload };
      }

      if (createOp.id) {
        await db.syncQueue.update(createOp.id, { payload: mergedPayload });
      }

      // Delete the update operations
      for (const updateOp of updateOpsAfterCreate) {
        if (updateOp.id) {
          await db.syncQueue.delete(updateOp.id);
          coalesced++;
        }
      }
    }

    // Handle update + delete = keep delete only
    const finalItems = (await db.syncQueue.toArray())
      .filter(i => `${i.table}:${i.entityId}` === key);

    const deleteOp = finalItems.find(i => i.operation === 'delete');
    const nonDeleteOps = finalItems.filter(i => i.operation !== 'delete');

    if (deleteOp && nonDeleteOps.length > 0) {
      // Remove non-delete operations (they're superseded by delete)
      for (const op of nonDeleteOps) {
        if (op.id) {
          await db.syncQueue.delete(op.id);
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

  // First attempt (retries=0) is always immediate
  if (item.retries === 0) return true;

  // Exponential backoff for retries: 2^(retries-1) seconds (1s, 2s, 4s, 8s)
  const backoffMs = Math.pow(2, item.retries - 1) * 1000;
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
  table: SyncQueueTable,
  operation: SyncOperationType,
  entityId: string,
  payload: Record<string, unknown>,
  baseVersion?: string
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
    baseVersion,
    timestamp: new Date().toISOString(),
    retries: 0
  };

  await db.syncQueue.add(item);
}

/**
 * Queue an increment operation.
 * This is a helper function for cleaner repository code.
 */
export async function queueIncrement(
  table: SyncQueueTable,
  entityId: string,
  field: string,
  delta: number,
  baseVersion?: string,
  sideEffects?: Record<string, unknown>
): Promise<void> {
  await queueSyncDirect(table, 'increment', entityId, {
    field,
    delta,
    sideEffects,
    updated_at: new Date().toISOString()
  }, baseVersion);
}

/**
 * Queue a toggle operation.
 * This is a helper function for cleaner repository code.
 */
export async function queueToggle(
  table: SyncQueueTable,
  entityId: string,
  field: string,
  baseVersion?: string
): Promise<void> {
  await queueSyncDirect(table, 'toggle', entityId, {
    field,
    updated_at: new Date().toISOString()
  }, baseVersion);
}
