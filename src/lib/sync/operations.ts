/**
 * Sync Operation Helpers
 *
 * Provides utilities for:
 * - Transforming operations to Supabase mutations
 * - Creating operation items
 * - Operation coalescing logic
 */

import type { SyncOperationItem, SyncEntityType, OperationType } from './types';

/**
 * Transform a SyncOperationItem into a Supabase mutation payload.
 * This is called by the sync engine when pushing to Supabase.
 *
 * @param operation The operation to transform
 * @param currentValue The current value of the field (needed for increment operations)
 * @returns The payload to send to Supabase
 */
export function operationToMutation(
  operation: SyncOperationItem,
  currentValue?: unknown
): { mutationType: 'insert' | 'update' | 'delete'; payload: Record<string, unknown> } {
  switch (operation.operationType) {
    case 'create':
      return {
        mutationType: 'insert',
        payload: {
          id: operation.entityId,
          ...(operation.value as Record<string, unknown>),
        },
      };

    case 'delete':
      return {
        mutationType: 'update',
        payload: {
          deleted: true,
          updated_at: operation.timestamp,
        },
      };

    case 'increment': {
      // For increment, we need to compute the new value
      // currentValue should be provided by the caller from the local entity
      const base = typeof currentValue === 'number' ? currentValue : 0;
      const delta = typeof operation.value === 'number' ? operation.value : 0;
      const newValue = base + delta;

      if (!operation.field) {
        throw new Error('Increment operation requires a field');
      }

      return {
        mutationType: 'update',
        payload: {
          [operation.field]: newValue,
          updated_at: operation.timestamp,
        },
      };
    }

    case 'set': {
      // For set, we either have a single field or a full payload
      if (operation.field) {
        // Single field set
        return {
          mutationType: 'update',
          payload: {
            [operation.field]: operation.value,
            updated_at: operation.timestamp,
          },
        };
      } else {
        // Full payload set
        return {
          mutationType: 'update',
          payload: {
            ...(operation.value as Record<string, unknown>),
            updated_at: operation.timestamp,
          },
        };
      }
    }

    default:
      throw new Error(`Unknown operation type: ${(operation as SyncOperationItem).operationType}`);
  }
}

/**
 * Infer the appropriate operation type based on the value and field name.
 *
 * @param value The value being set
 * @param fieldName The name of the field
 * @param isIncrement Whether this is a known increment operation
 * @returns The inferred operation type
 */
export function inferOperationType(
  value: unknown,
  fieldName: string,
  isIncrement?: boolean
): OperationType {
  if (isIncrement) {
    return 'increment';
  }

  // For now, all non-increment operations are 'set'
  // Future phases may add more sophisticated inference
  return 'set';
}

/**
 * Create an increment operation item.
 */
export function createIncrementOperation(
  table: SyncEntityType,
  entityId: string,
  field: string,
  delta: number,
  timestamp: string
): SyncOperationItem {
  return {
    table,
    entityId,
    operationType: 'increment',
    field,
    value: delta,
    timestamp,
    retries: 0,
  };
}

/**
 * Create a set operation item for a single field.
 */
export function createSetOperation(
  table: SyncEntityType,
  entityId: string,
  field: string,
  value: unknown,
  timestamp: string
): SyncOperationItem {
  return {
    table,
    entityId,
    operationType: 'set',
    field,
    value,
    timestamp,
    retries: 0,
  };
}

/**
 * Create a set operation item for multiple fields.
 */
export function createMultiFieldSetOperation(
  table: SyncEntityType,
  entityId: string,
  fields: Record<string, unknown>,
  timestamp: string
): SyncOperationItem {
  return {
    table,
    entityId,
    operationType: 'set',
    value: fields,
    timestamp,
    retries: 0,
  };
}

/**
 * Create a create operation item.
 */
export function createCreateOperation(
  table: SyncEntityType,
  entityId: string,
  payload: Record<string, unknown>,
  timestamp: string
): SyncOperationItem {
  return {
    table,
    entityId,
    operationType: 'create',
    value: payload,
    timestamp,
    retries: 0,
  };
}

/**
 * Create a delete operation item.
 */
export function createDeleteOperation(
  table: SyncEntityType,
  entityId: string,
  timestamp: string
): SyncOperationItem {
  return {
    table,
    entityId,
    operationType: 'delete',
    timestamp,
    retries: 0,
  };
}

/**
 * Check if two operations can be coalesced together.
 * For Phase 1, this maintains existing coalescing behavior.
 * Phase 2 will add true intent-preserving coalescing.
 *
 * Current rules:
 * - Same table + entityId + operationType can be coalesced
 * - Increment operations: NOT coalesced in Phase 1 (Phase 2 will sum deltas)
 * - Set operations: keep the latest value
 * - Create/delete: cannot coalesce
 */
export function canCoalesce(a: SyncOperationItem, b: SyncOperationItem): boolean {
  if (a.table !== b.table || a.entityId !== b.entityId) {
    return false;
  }

  // Same operation type on same field can be coalesced
  if (a.operationType === b.operationType) {
    // For field-level operations, must be same field
    if (a.field && b.field && a.field !== b.field) {
      return false;
    }

    // Create and delete cannot coalesce (would lose intent)
    if (a.operationType === 'create' || a.operationType === 'delete') {
      return false;
    }

    // Increment operations are NOT coalesced in Phase 1
    // Phase 2 will add increment summing
    if (a.operationType === 'increment') {
      return false;
    }

    return true;
  }

  return false;
}

/**
 * Coalesce two operations into one.
 * For Phase 1, this keeps the latest value.
 * Phase 2 will add increment summing.
 *
 * @param older The older operation
 * @param newer The newer operation
 * @returns The coalesced operation
 */
export function coalesceOperations(
  older: SyncOperationItem,
  newer: SyncOperationItem
): SyncOperationItem {
  // For Phase 1: keep the newer operation's value
  // but preserve the older operation's id for queue management
  return {
    ...newer,
    id: older.id,
    // Keep oldest timestamp for backoff calculation
    timestamp: older.timestamp,
  };
}
