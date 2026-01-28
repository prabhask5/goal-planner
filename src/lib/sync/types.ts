/**
 * Intent-Based Sync Operation Types
 *
 * Phase 1 of multi-device sync improvements.
 * These types enable preserving operation intent (e.g., "increment by 1")
 * rather than just final state (e.g., "current_value: 50").
 *
 * This allows proper conflict resolution in future phases:
 * - Device A increments 50 times → intent preserved as +50
 * - Device B increments 30 times → intent preserved as +30
 * - Merge result: +80 (not overwrite with one device's value)
 */

/**
 * Operation types that preserve intent:
 * - 'increment': Add delta to numeric field (e.g., current_value += 1)
 * - 'set': Set field to value (works for any type)
 * - 'create': Create new entity
 * - 'delete': Soft delete entity
 */
export type OperationType = 'increment' | 'set' | 'create' | 'delete';

/**
 * All syncable entity types
 */
export type SyncEntityType =
  | 'goal_lists'
  | 'goals'
  | 'daily_routine_goals'
  | 'daily_goal_progress'
  | 'task_categories'
  | 'commitments'
  | 'daily_tasks'
  | 'long_term_tasks'
  | 'focus_settings'
  | 'focus_sessions'
  | 'block_lists'
  | 'blocked_websites';

/**
 * Intent-based sync operation item.
 *
 * Key design:
 * - Uses `operationType` to specify the operation intent
 * - Has optional `field` for field-level operations
 * - `value` is the delta (for increment) or new value (for set/create)
 *
 * For create operations, value contains the full entity payload.
 * For increment operations, value contains the delta to add.
 * For set operations, value contains the new field value(s).
 * For delete operations, value is not used.
 */
export interface SyncOperationItem {
  id?: number; // Auto-increment ID
  table: SyncEntityType; // Target table
  entityId: string; // Entity being operated on
  operationType: OperationType; // 'increment', 'set', 'create', 'delete'
  field?: string; // Field being modified (for increment/single-field set)
  value?: unknown; // Delta (increment), new value (set), or full payload (create)
  timestamp: string; // ISO timestamp for backoff calculation
  retries: number; // Number of failed sync attempts
}

/**
 * Type guard to check if an item is a SyncOperationItem
 */
export function isOperationItem(
  item: unknown
): item is SyncOperationItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'operationType' in item &&
    ['increment', 'set', 'create', 'delete'].includes(
      (item as SyncOperationItem).operationType
    )
  );
}
