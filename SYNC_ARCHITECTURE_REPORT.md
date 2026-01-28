# Stellar Sync Architecture Report

## Table of Contents
1. [Current Architecture](#current-architecture)
2. [Multi-Device Sync Problems](#multi-device-sync-problems)
3. [Proposed Architecture Changes](#proposed-architecture-changes)
4. [Implementation Phases](#implementation-phases)

---

# PART 1: CURRENT ARCHITECTURE

## 1. Overview

Stellar uses a **local-first architecture** with IndexedDB (via Dexie.js) as the primary data store and Supabase PostgreSQL as the cloud sync target. The UI always reads from local storage, providing instant response times regardless of network conditions.

### Core Principles
- **Local-first reads**: All UI data comes from IndexedDB, never directly from Supabase
- **Transactional outbox**: Every local write atomically creates a sync queue entry
- **Eventual consistency**: Changes sync when network is available
- **Last-write-wins**: Conflict resolution based on `updated_at` timestamps

---

## 2. How Online Changes Are Sent to Supabase

### The Push Path

```
UI Action → Repository Write → [Local DB + Sync Queue] (atomic) → scheduleSyncPush() → pushPendingOps()
```

#### Step 1: Atomic Local Write + Queue Entry

Every repository write executes in a Dexie transaction:

```typescript
// From /src/lib/db/repositories/goals.ts
await db.transaction('rw', [db.goals, db.syncQueue], async () => {
  await db.goals.add(newGoal);
  await queueSyncDirect('goals', 'create', newGoal.id, { ...payload });
});
scheduleSyncPush();
```

**Guarantee**: If the entity write succeeds, a sync queue entry ALWAYS exists.

#### Step 2: Debounced Sync Trigger

`scheduleSyncPush()` debounces for 2 seconds (`SYNC_DEBOUNCE_MS`), allowing rapid changes to coalesce before sending.

#### Step 3: Queue Coalescing (Pre-Push)

Before pushing, `coalescePendingOps()` merges multiple updates to the same entity:

```typescript
// Groups by table:entityId
// Multiple updates → merged payload → single request
// Example: 50 goal increments → 1 update with final value
```

#### Step 4: Push Execution

`pushPendingOps()` processes queue items with:
- **CREATE**: `INSERT` with conflict handling (duplicate key = already synced)
- **UPDATE**: `UPDATE WHERE id = entityId`
- **DELETE**: Sets `deleted=true` (soft delete)

#### Sync Queue Item Structure

```typescript
interface SyncQueueItem {
  id?: number;                    // auto-increment
  table: 'goals' | 'daily_tasks' | etc.
  operation: 'create' | 'update' | 'delete'
  entityId: string;               // UUID of entity
  payload: Record<string, unknown>; // FULL entity data (snapshot)
  timestamp: string;              // ISO for backoff calc
  retries: number;                // attempt count
}
```

#### Retry Logic

- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Max 5 retries before permanent failure
- Special handling for duplicate keys and not-found errors

---

## 3. Where Changes Are Initially Read for the UI

### The Read Path (Always Local-First)

```
UI Component → Svelte Store → Sync Engine (getXxx) → IndexedDB
```

All reads come from **IndexedDB**, never directly from Supabase:

```typescript
// From /src/lib/sync/engine.ts
export async function getGoalLists(): Promise<GoalList[]> {
  let lists = await db.goalLists.where('deleted').notEqual(true).toArray();

  // Hydrate from remote only if local is empty
  if (lists.length === 0 && !hasHydrated && navigator.onLine) {
    await hydrateFromRemote();
    lists = await db.goalLists.where('deleted').notEqual(true).toArray();
  }

  return lists;
}
```

### Store Auto-Refresh Pattern

```typescript
// From /src/lib/stores/data.ts
const unsubscribe = sync.onSyncComplete(async () => {
  const refreshed = await sync.getGoalLists();
  set(refreshed);  // Reactively update store
});
```

After sync completes, stores automatically refresh from local IndexedDB.

---

## 4. How Offline Sync Works

### Network Monitoring

```typescript
// From /src/lib/stores/network.ts
window.addEventListener('offline', () => markOffline());
window.addEventListener('online', () => handleReconnect());
document.addEventListener('visibilitychange', () => checkNetworkState());
```

### Going Offline

1. All writes continue through the same path (local → queue)
2. `scheduleSyncPush()` is called but won't execute while offline
3. Queue items remain in IndexedDB with `retries: 0`
4. Offline session created for authentication continuity

### Reconnection Flow

```typescript
// From /src/routes/+layout.ts
isOnline.onReconnect(async () => {
  await callReconnectHandler();  // Auth re-validation
  performSync();                 // Trigger full sync
});
```

**Security**: Before syncing, credentials are re-validated with Supabase to prevent unauthorized sync if password changed on another device.

---

## 5. The Coalescing System

### Current Implementation

The coalescing system merges multiple operations on the same entity:

```typescript
// From /src/lib/sync/queue.ts
export async function coalescePendingOps(): Promise<void> {
  const allItems = await db.syncQueue.toArray();

  // Group by table:entityId
  const grouped = new Map<string, SyncQueueItem[]>();
  for (const item of allItems) {
    const key = `${item.table}:${item.entityId}`;
    // ... group items
  }

  // Merge same-type operations
  for (const [key, items] of grouped) {
    const updateItems = items.filter(i => i.operation === 'update');
    if (updateItems.length > 1) {
      let mergedPayload = {};
      for (const item of updateItems) {
        mergedPayload = { ...mergedPayload, ...item.payload };
      }
      // Keep oldest, update payload, delete rest
    }
  }
}
```

### Example

```
User clicks goal increment 50 times rapidly:

Before coalescing:
[
  { table: 'goals', entityId: 'abc', operation: 'update', payload: { current_value: 1 } },
  { table: 'goals', entityId: 'abc', operation: 'update', payload: { current_value: 2 } },
  ...
  { table: 'goals', entityId: 'abc', operation: 'update', payload: { current_value: 50 } }
]

After coalescing:
[
  { table: 'goals', entityId: 'abc', operation: 'update', payload: { current_value: 50 } }
]
```

### Problem

The current system stores **final snapshots**, not intents. When Device A has `current_value: 50` and Device B has `current_value: 30`, the system cannot determine that the correct merged value should be `80` (if both started from 0).

---

## 6. Database Schemas

### Local Schema (IndexedDB via Dexie.js)

```typescript
class GoalPlannerDB extends Dexie {
  // Entity Tables
  goalLists: Table<GoalList, string>;
  goals: Table<Goal, string>;
  dailyRoutineGoals: Table<DailyRoutineGoal, string>;
  dailyGoalProgress: Table<DailyGoalProgress, string>;
  taskCategories: Table<TaskCategory, string>;
  commitments: Table<Commitment, string>;
  dailyTasks: Table<DailyTask, string>;
  longTermTasks: Table<LongTermTask, string>;
  focusSettings: Table<FocusSettings, string>;
  focusSessions: Table<FocusSession, string>;
  blockLists: Table<BlockList, string>;
  blockedWebsites: Table<BlockedWebsite, string>;

  // System Tables
  syncQueue: Table<SyncQueueItem, number>;           // Outbox
  offlineCredentials: Table<OfflineCredentials, string>;
  offlineSession: Table<OfflineSession, string>;
}
```

### Remote Schema (Supabase PostgreSQL)

```sql
-- Every table has these common fields:
-- id (uuid), user_id (uuid), deleted (boolean), created_at, updated_at

goal_lists (id, user_id, name, deleted, created_at, updated_at)
goals (id, goal_list_id, name, type, target_value, current_value, completed, order, deleted, ...)
daily_routine_goals (id, user_id, name, type, target_value, start_date, end_date, active_days, order, deleted, ...)
daily_goal_progress (id, daily_routine_goal_id, date, current_value, completed, deleted, updated_at)
task_categories (id, user_id, name, color, order, deleted, ...)
commitments (id, user_id, name, section, order, deleted, ...)
daily_tasks (id, user_id, name, order, completed, deleted, ...)
long_term_tasks (id, user_id, name, due_date, category_id, completed, deleted, ...)
focus_settings (id, user_id, focus_duration, break_duration, ..., deleted, ...)
focus_sessions (id, user_id, started_at, ended_at, phase, status, ..., deleted, ...)
block_lists (id, user_id, name, active_days, is_enabled, order, deleted, ...)
blocked_websites (id, block_list_id, domain, deleted, ...)
```

---

## 7. Real-Time Subscription Handling

### Current Status: NOT IMPLEMENTED

The architecture uses **polling-based sync**:

1. **Periodic sync**: Every 15 minutes
2. **Event-triggered sync**: On local write (2s debounce), reconnect, tab visibility

### Why No Realtime?

- Supabase client is initialized with Realtime capabilities
- But no `.on('postgres_changes')` subscriptions are active
- System uses cursor-based polling for simplicity
- **This is a gap for multi-device sync**

---

## 8. Current Conflict Resolution

### Last-Write-Wins with Protections

```
Remote change received
         │
         ▼
┌────────────────────────┐
│ Entity in sync queue?  │──Yes──▶ REJECT (local wins)
└───────────┬────────────┘
            │ No
            ▼
┌────────────────────────┐
│ Modified in last 2s?   │──Yes──▶ REJECT (local wins)
└───────────┬────────────┘
            │ No
            ▼
┌────────────────────────┐
│ Remote updated_at >    │──No───▶ REJECT (local wins)
│ Local updated_at?      │
└───────────┬────────────┘
            │ Yes
            ▼
       ACCEPT REMOTE
```

### Protection Mechanisms

1. **Pending Queue Protection**: If entity has unsynced local changes, remote is rejected
2. **Recently Modified Window** (2 seconds): Prevents race conditions
3. **Timestamp Comparison**: Older data never overwrites newer

### Problem

This works for single-device but fails for multi-device:
- Device A offline edits `goal.name = "Exercise"`
- Device B online edits `goal.current_value = 5`
- Device A reconnects → overwrites Device B's changes entirely

---

## 9. Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `/src/lib/sync/engine.ts` | Main sync orchestration | ~2000 |
| `/src/lib/sync/queue.ts` | Outbox queue management | ~200 |
| `/src/lib/stores/data.ts` | Reactive stores | ~300 |
| `/src/lib/db/repositories/*.ts` | Write operations | ~1500 total |
| `/src/lib/stores/sync.ts` | Sync status UI | ~100 |
| `/src/routes/+layout.ts` | Initialization | ~300 |

---

# PART 2: MULTI-DEVICE SYNC PROBLEMS

## Current Limitations

### 1. Snapshot-Based Operations Lose Intent

**Current**: Queue stores final state snapshots
```typescript
{ operation: 'update', payload: { current_value: 50 } }
```

**Problem**: Cannot merge two devices that both incremented a counter.

### 2. No Field-Level Conflict Resolution

**Current**: Entire entity is overwritten
**Problem**: Device A edits `name`, Device B edits `value` → one device loses changes

### 3. No Delete-Aware Sync

**Current**: Soft deletes exist but no resurrection prevention
**Problem**: Device A deletes item, Device B (offline) edits item → item resurrects

### 4. No Real-Time Updates

**Current**: 15-minute polling + manual triggers
**Problem**: Changes from other devices not reflected until next poll

### 5. Race Conditions on Reconnect

**Current**: 2-second protection window is arbitrary
**Problem**: Doesn't scale to multi-device with varying latencies

---

# PART 3: PROPOSED ARCHITECTURE CHANGES

## Design Goals

1. **Intent-Preserving Operations**: Store the operation intent, not just the final state
2. **Field-Level Merging**: Auto-merge non-conflicting field changes
3. **Deterministic Conflict Resolution**: Same inputs → same output on all devices
4. **Delete-Aware Sync**: Prevent resurrection bugs via soft-delete
5. **Real-Time UI Updates**: Graceful handling without jarring the user
6. **Offline-First Maintained**: UI depends only on local database

---

## New Operation Types

### Intent-Preserving Operations

Replace snapshot-based operations with intent-based operations:

```typescript
// OLD: Snapshot-based
{ operation: 'update', payload: { current_value: 50 } }

// NEW: Intent-based
{ operation: 'increment', field: 'current_value', delta: 1 }
{ operation: 'set', field: 'name', value: 'Exercise' }
{ operation: 'toggle', field: 'completed', value: true }
{ operation: 'append', field: 'tags', value: 'important' }
{ operation: 'reorder', field: 'order', value: 2.5 }
```

### Operation Categories

| Category | Operations | Merge Strategy |
|----------|------------|----------------|
| **Numeric** | `increment`, `decrement`, `set_number` | Sum deltas, or last-write for set |
| **Text** | `set_text` | Last-write-wins |
| **Boolean** | `set_boolean`, `toggle` | Last-write-wins |
| **Timestamp** | `set_timestamp` | Last-write-wins |
| **Array** | `append`, `remove`, `reorder` | Union for add/remove, last-write for order |
| **Entity** | `create`, `delete`, `restore` | Special handling |

---

## New Sync Queue Structure

```typescript
interface SyncOperation {
  id: string;                      // UUID for deduplication
  entityType: string;              // 'goals', 'daily_tasks', etc.
  entityId: string;                // UUID of entity
  operationType: OperationType;    // 'increment', 'set', 'delete', etc.
  field?: string;                  // Field being modified (null for entity ops)
  value?: unknown;                 // New value or delta
  baseVersion: number;             // Version this operation was based on
  timestamp: string;               // ISO timestamp for ordering
  deviceId: string;                // Device that created this operation
  userId: string;                  // User ID for RLS
  status: 'pending' | 'sent' | 'confirmed' | 'rejected';
  retries: number;
}
```

---

## New Coalescing System

### Coalescing Rules by Operation Type

```typescript
// Same entity, same field, same operation type
const coalesceRules: Record<OperationType, CoalesceStrategy> = {
  // Numeric: Sum deltas
  'increment': (ops) => ({ ...ops[0], value: ops.reduce((sum, op) => sum + op.value, 0) }),
  'decrement': (ops) => ({ ...ops[0], value: ops.reduce((sum, op) => sum + op.value, 0) }),

  // Set operations: Keep last
  'set_number': (ops) => ops[ops.length - 1],
  'set_text': (ops) => ops[ops.length - 1],
  'set_boolean': (ops) => ops[ops.length - 1],
  'set_timestamp': (ops) => ops[ops.length - 1],

  // Array operations: Cannot coalesce (order matters)
  'append': null,
  'remove': null,

  // Entity operations: Special handling
  'create': null,  // Never coalesce
  'delete': null,  // Never coalesce
  'restore': null, // Never coalesce
};
```

### Coalescing Algorithm

```typescript
function coalesceOperations(ops: SyncOperation[]): SyncOperation[] {
  // Group by entityId + field
  const groups = groupBy(ops, op => `${op.entityId}:${op.field}`);

  const result: SyncOperation[] = [];

  for (const [key, groupOps] of groups) {
    // Sub-group by operation type
    const byType = groupBy(groupOps, op => op.operationType);

    for (const [opType, typeOps] of byType) {
      const rule = coalesceRules[opType];
      if (rule) {
        result.push(rule(typeOps));
      } else {
        // Cannot coalesce, keep all
        result.push(...typeOps);
      }
    }
  }

  return result;
}
```

---

## Conflict Resolution Strategy

### Three-Tier Auto-Merge

```
Incoming operation
         │
         ▼
┌─────────────────────────┐
│ TIER 1: Non-overlapping │
│ Different entities?     │──Yes──▶ AUTO-MERGE (no conflict)
└───────────┬─────────────┘
            │ No (same entity)
            ▼
┌─────────────────────────┐
│ TIER 2: Different fields│
│ Different fields?       │──Yes──▶ AUTO-MERGE FIELDS
└───────────┬─────────────┘
            │ No (same field)
            ▼
┌─────────────────────────┐
│ TIER 3: Same field      │
│ Apply resolution rules  │──────▶ RESOLVE AUTOMATICALLY
└─────────────────────────┘
```

### Tier 3 Resolution Rules

```typescript
interface ConflictResolution {
  winnerId: string;           // Operation ID that won
  loserId: string;            // Operation ID that lost
  loserValue: unknown;        // Preserved for undo/history
  resolution: 'last_write' | 'numeric_merge' | 'delete_wins';
  timestamp: string;
}

function resolveFieldConflict(
  localOp: SyncOperation,
  remoteOp: SyncOperation
): { winner: SyncOperation; loser: SyncOperation; resolution: string } {

  // Rule 1: Numeric operations can merge
  if (isNumericMergeable(localOp, remoteOp)) {
    return {
      winner: mergeNumericOps(localOp, remoteOp),
      loser: null,  // No loser - both merged
      resolution: 'numeric_merge'
    };
  }

  // Rule 2: Delete wins over edit (unless restore)
  if (localOp.operationType === 'delete' || remoteOp.operationType === 'delete') {
    const deleteOp = localOp.operationType === 'delete' ? localOp : remoteOp;
    const editOp = localOp.operationType === 'delete' ? remoteOp : localOp;
    return {
      winner: deleteOp,
      loser: editOp,
      resolution: 'delete_wins'
    };
  }

  // Rule 3: Last-write-wins at field level
  const localTime = new Date(localOp.timestamp).getTime();
  const remoteTime = new Date(remoteOp.timestamp).getTime();

  if (localTime > remoteTime) {
    return { winner: localOp, loser: remoteOp, resolution: 'last_write' };
  } else if (remoteTime > localTime) {
    return { winner: remoteOp, loser: localOp, resolution: 'last_write' };
  } else {
    // Exact same timestamp: use deviceId as tiebreaker (deterministic)
    return localOp.deviceId < remoteOp.deviceId
      ? { winner: localOp, loser: remoteOp, resolution: 'last_write' }
      : { winner: remoteOp, loser: localOp, resolution: 'last_write' };
  }
}
```

---

## Delete Handling (Resurrection Prevention)

### Soft-Delete Approach

Instead of a separate tombstone table, Stellar uses soft-delete with conflict resolution:

1. **Each entity has `deleted: boolean`**: When deleted, set to `true` with updated `updated_at`
2. **Conflict resolution `delete_wins`**: If remote has `deleted=true`, it takes precedence
3. **Updates don't touch `deleted`**: `set` and `increment` operations only modify their specific fields
4. **30-day cleanup**: Soft-deleted records retained for 30 days before hard-delete

### How Resurrection is Prevented

```typescript
// In conflicts.ts - delete always wins over edits
if (remote.deleted && !hasPendingDelete) {
  return {
    mergedEntity: { ...remote },  // Keep deleted=true
    strategy: 'delete_wins',
  };
}

// If local has pending delete, local wins
if (hasPendingDelete && !remote.deleted) {
  mergedEntity.deleted = true;
  // Local delete intent preserved
}
```

### Why This Works

| Scenario | Outcome |
|----------|---------|
| Device A deletes, Device B has pending update | `delete_wins` applies, entity stays deleted |
| Device A deletes, Device B offline with stale copy | B pulls `deleted=true`, entity deleted |
| Both devices delete | Both agree, entity deleted |
| Update pushed after delete | Update only touches name/etc, `deleted` stays true |

---

## Real-Time Subscription Architecture

### Supabase Real-Time Setup

```typescript
// Subscribe to changes for all synced tables
const tables = ['goals', 'goal_lists', 'daily_tasks', /* ... */];

for (const table of tables) {
  supabase
    .channel(`${table}_changes`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: table,
        filter: `user_id=eq.${userId}`
      },
      (payload) => handleRealtimeChange(table, payload)
    )
    .subscribe();
}
```

### Graceful UI Update Strategy

```typescript
interface PendingRemoteChange {
  entityId: string;
  entityType: string;
  changes: Record<string, unknown>;
  receivedAt: number;
}

const pendingRemoteChanges = new Map<string, PendingRemoteChange>();

function handleRealtimeChange(table: string, payload: RealtimePayload) {
  const entityId = payload.new?.id || payload.old?.id;

  // 1. Check if user is currently editing this entity
  if (isEntityBeingEdited(entityId)) {
    // Queue the change, don't apply immediately
    pendingRemoteChanges.set(entityId, {
      entityId,
      entityType: table,
      changes: payload.new,
      receivedAt: Date.now()
    });

    // Show subtle indicator that remote changes are pending
    showPendingChangeIndicator(entityId);
    return;
  }

  // 2. Check if entity was recently modified locally (within 2 seconds)
  if (wasRecentlyModified(entityId, 2000)) {
    // Queue for delayed application
    setTimeout(() => applyRemoteChange(table, payload), 2000);
    return;
  }

  // 3. Apply immediately with smooth transition
  applyRemoteChangeWithAnimation(table, payload);
}

function applyRemoteChangeWithAnimation(table: string, payload: RealtimePayload) {
  // Update local IndexedDB
  await db[table].put(payload.new);

  // Emit update event with animation hint
  emit('entity_updated', {
    entityId: payload.new.id,
    table,
    animate: true,
    changes: diffObjects(payload.old, payload.new)
  });
}
```

### UI Component Handling

```svelte
<script>
  import { onMount } from 'svelte';
  import { entityUpdates } from '$lib/stores/realtime';

  let animatingFields = new Set();

  onMount(() => {
    const unsub = entityUpdates.subscribe(update => {
      if (update.entityId === entity.id && update.animate) {
        // Add animation class to changed fields
        for (const field of Object.keys(update.changes)) {
          animatingFields.add(field);
          setTimeout(() => animatingFields.delete(field), 300);
        }
      }
    });
    return unsub;
  });
</script>

<div class="goal-card">
  <span class:updated={animatingFields.has('name')}>{goal.name}</span>
  <span class:updated={animatingFields.has('current_value')}>{goal.current_value}</span>
</div>

<style>
  .updated {
    animation: highlight 0.3s ease-out;
  }

  @keyframes highlight {
    0% { background-color: rgba(59, 130, 246, 0.3); }
    100% { background-color: transparent; }
  }
</style>
```

---

## Inbox/Outbox Model

### Outbox (Local → Remote)

```typescript
// Enhanced sync queue as outbox
interface OutboxEntry {
  id: string;
  operation: SyncOperation;
  status: 'pending' | 'sending' | 'sent' | 'confirmed' | 'failed';
  attempts: number;
  lastAttempt?: string;
  error?: string;
}
```

### Inbox (Remote → Local)

```typescript
// New table for incoming operations
interface InboxEntry {
  id: string;
  operation: SyncOperation;
  receivedAt: string;
  processedAt?: string;
  status: 'pending' | 'processing' | 'applied' | 'rejected';
  conflictResolution?: ConflictResolution;
}
```

### Processing Flow

```
OUTBOX FLOW (Local changes):
Local Write → Create Operation → Outbox (pending)
                                    ↓
                              Coalesce
                                    ↓
                              Push to Supabase
                                    ↓
                              Mark confirmed
                                    ↓
                              Remove from outbox

INBOX FLOW (Remote changes):
Realtime Event → Inbox (pending)
                      ↓
                 Check conflicts with outbox
                      ↓
                 Apply conflict resolution
                      ↓
                 Apply to local DB
                      ↓
                 Mark applied
                      ↓
                 Emit UI update event
```

---

## Version Vector for Causality

```typescript
interface VersionVector {
  [deviceId: string]: number;
}

interface Entity {
  id: string;
  // ... other fields
  _version: number;
  _versionVector: VersionVector;
  _lastModifiedBy: string;
}
```

This allows detecting concurrent modifications:
- If `local._versionVector[remoteDeviceId] >= remote._version`, we've already seen this change
- If vectors are incomparable, we have concurrent modifications → need resolution

---

# PART 4: IMPLEMENTATION PHASES

## Phase 1: Foundation - Intent-Based Operations ✅ IMPLEMENTED

**Goal**: Replace snapshot-based sync queue with intent-preserving operations

**Status**: Complete. All repositories now use intent-based operations.

### Changes Implemented

1. **New SyncOperation types** (`/src/lib/sync/types.ts`)
   - Defined `OperationType`: 'increment' | 'set' | 'create' | 'delete'
   - Defined `SyncEntityType` for all syncable tables
   - Defined `SyncOperationItem` interface with intent-preserving structure
   - Added `isOperationItem()` type guard

2. **Operation helpers** (`/src/lib/sync/operations.ts`)
   - `operationToMutation()`: Transforms operations to Supabase mutations
   - `createIncrementOperation()`, `createSetOperation()`, etc.
   - `canCoalesce()` and `coalesceOperations()` for merging operations

3. **Updated queue module** (`/src/lib/sync/queue.ts`)
   - `queueSyncOperation()`: Main function for queueing intent-based operations
   - Helper functions: `queueCreateOperation()`, `queueDeleteOperation()`, `queueIncrementOperation()`, etc.
   - Removed legacy `queueSyncDirect()` function

4. **Updated sync engine** (`/src/lib/sync/engine.ts`)
   - `processSyncItem()` now handles `SyncOperationItem` format
   - Processes increment, set, create, and delete operations
   - Maintains egress optimization (only sends changed fields)

5. **Updated all repositories** (11 files)
   - `goals.ts`: Uses `queueSyncOperation` with increment intent for `incrementGoal()`
   - `dailyProgress.ts`: Uses increment intent for `incrementDailyProgress()`
   - All other repositories: Use `queueCreateOperation`, `queueDeleteOperation`, `queueMultiFieldSetOperation`

### Files Modified
- `/src/lib/sync/types.ts` - New (operation types)
- `/src/lib/sync/operations.ts` - New (operation helpers)
- `/src/lib/sync/queue.ts` - Updated (new queue functions)
- `/src/lib/sync/engine.ts` - Updated (new operation processing)
- `/src/lib/types.ts` - Updated (re-exports from sync/types)
- `/src/lib/db/schema.ts` - Updated (syncQueue uses SyncOperationItem)
- `/src/lib/db/repositories/goals.ts`
- `/src/lib/db/repositories/dailyProgress.ts`
- `/src/lib/db/repositories/goalLists.ts`
- `/src/lib/db/repositories/dailyRoutines.ts`
- `/src/lib/db/repositories/dailyTasks.ts`
- `/src/lib/db/repositories/longTermTasks.ts`
- `/src/lib/db/repositories/commitments.ts`
- `/src/lib/db/repositories/taskCategories.ts`
- `/src/lib/db/repositories/focusSettings.ts`
- `/src/lib/db/repositories/focusSessions.ts`
- `/src/lib/db/repositories/blockLists.ts`

### Notes
- `_version` field added in Phase 3 for conflict resolution
- `device_id` field added in Phase 4 for deterministic tiebreaking
- Legacy format removed (no backwards compatibility needed - single user)

---

## Phase 2: New Coalescing System ✅ IMPLEMENTED

**Goal**: Implement aggressive operation-aware coalescing to minimize network requests and data transfer

**Status**: Complete. Full cross-operation and same-field coalescing implemented.

### Changes Implemented

1. **Aggressive coalescing logic** (`/src/lib/sync/queue.ts`)
   - `coalescePendingOps()` now handles all operation type interactions
   - Cross-operation coalescing (create/update/delete combinations)
   - Same-field coalescing (increment/set interactions)
   - Three-phase processing for optimal reduction

2. **Updated operation helpers** (`/src/lib/sync/operations.ts`)
   - `canCoalesce()`: Now returns `true` for increment operations with same field
   - `coalesceOperations()`: Sums deltas for increment operations

### Coalescing Strategies

#### Cross-Operation Coalescing (Phase 1)

| Pattern | Result | Rationale |
|---------|--------|-----------|
| `CREATE` → `DELETE` | Cancel both | Entity never needs to exist on server |
| `CREATE` → `UPDATE(s)` → `DELETE` | Cancel all | Net effect is nothing |
| `UPDATE(s)` → `DELETE` | Keep only `DELETE` | No point updating before delete |
| `CREATE` → `UPDATE(s)` | Merge into `CREATE` | Single insert with final state |
| `CREATE` → `SET(s)` | Merge into `CREATE` | Single insert with final state |
| `CREATE` → `INCREMENT(s)` | Merge into `CREATE` | Add increments to initial values |

#### Same-Field Coalescing

| Pattern | Result | Rationale |
|---------|--------|-----------|
| `INCREMENT(s)` → `SET` | Keep only `SET` | Set overwrites increment values |
| `SET` → `INCREMENT(s)` | Single `SET` with final value | Combine set + increments |
| Multiple `INCREMENT`s | Sum deltas | e.g., 50 +1s → single +50 |
| Multiple `SET`s | Merge values | Later values override earlier |

#### No-Op Removal (Phase 4)

| Pattern | Result | Rationale |
|---------|--------|-----------|
| Increment with delta = 0 | Remove entirely | No effect (e.g., +5 then -5) |
| Set with empty payload | Remove entirely | No data to update |
| Set with only `updated_at` | Remove entirely | Server auto-updates timestamps |

### Examples

**Example 1: Rapid increments**
```
User clicks goal increment 50 times:

Before: 50 increment operations
After:  1 increment operation with value: 50

Result: 50x reduction
```

**Example 2: Create, edit, delete before sync**
```
User creates goal, edits it 5 times, then deletes it:

Before: 1 create + 5 sets + 1 delete = 7 operations
After:  0 operations (all cancelled out)

Result: 100% reduction - no server requests needed
```

**Example 3: Create and edit before sync**
```
User creates goal, then updates name and increments value 10 times:

Before: 1 create + 1 set(name) + 10 increments = 12 operations
After:  1 create with merged payload (name + current_value: 10)

Result: 12x reduction
```

### Performance Optimizations

The coalescing function is optimized for IndexedDB performance:

| Optimization | Before | After |
|--------------|--------|-------|
| DB fetches | 4 `toArray()` calls | 1 `toArray()` call |
| Delete operations | N individual `delete()` | 1 `bulkDelete()` |
| Update operations | N individual `update()` | Batched in transaction |
| Processing model | Sequential with DB I/O | In-memory with batch commit |

**Implementation details:**
- Single fetch at start, all processing in memory using Sets/Maps
- Track deletions in `Set<number>` (item IDs)
- Track updates in `Map<number, Partial<SyncOperationItem>>`
- Apply all changes in single batch at the end
- `isAlive()` helper checks if item is still active (not marked for deletion)
- `getEffectiveValue()` helper returns pending update value if exists

### Files Modified
- `/src/lib/sync/queue.ts` - Major rewrite with single-pass coalescing + batch operations
- `/src/lib/sync/operations.ts` - canCoalesce() and coalesceOperations() updates

### Notes
- Oldest item's timestamp is preserved for backoff calculation
- Push logic in engine.ts already called coalescePendingOps() before pushing
- Coalescing is transparent and maintains data integrity
- Edge cases handled: field-specific operations, multi-field sets, mixed operations

---

## Phase 3: Supabase Schema Updates ✅ IMPLEMENTED

**Goal**: Update remote schema to support operations and versioning

**Status**: Complete. Database schema updated with version columns and sync_operations table.

### Changes Implemented

1. **Added `_version` column to all 12 entity tables**
   - `goal_lists`, `goals`, `daily_routine_goals`, `daily_goal_progress`
   - `task_categories`, `commitments`, `daily_tasks`, `long_term_tasks`
   - `focus_settings`, `focus_sessions`, `block_lists`, `blocked_websites`
   - Default value: `1` (for optimistic concurrency control)

2. **Created `sync_operations` table** (operation log for conflict auditing)
   ```sql
   CREATE TABLE sync_operations (
     id UUID PRIMARY KEY,
     entity_type TEXT NOT NULL,
     entity_id UUID NOT NULL,
     operation_type TEXT NOT NULL CHECK (operation_type IN ('increment', 'set', 'create', 'delete')),
     field TEXT,
     value JSONB,
     base_version INTEGER,
     device_id TEXT NOT NULL,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
   - Indexes: `user_id`, `(entity_type, entity_id)`, `created_at`
   - RLS policies: Users can only view/create/delete their own operations

3. **Updated TypeScript types**
   - Added `_version?: number` to all 12 entity interfaces in `/src/lib/types.ts`

5. **Updated sync engine queries**
   - Added `_version` to all COLUMNS definitions in `/src/lib/sync/engine.ts`

6. **Updated local IndexedDB schema**
   - Added version 8 upgrade in `/src/lib/db/schema.ts`
   - Migration sets `_version = 1` for all existing records

### Files Modified
- `/supabase-schema.sql` - Added versioning section with all new columns, tables, and RLS
- `/supabase-migration-phase3.sql` - **NEW** - Idempotent migration script for existing databases
- `/src/lib/types.ts` - Added `_version` to all 12 entity interfaces
- `/src/lib/sync/engine.ts` - Updated COLUMNS to include `_version`
- `/src/lib/db/schema.ts` - Added version 8 with upgrade function

### Migration Instructions

For **new databases**: Run the full `supabase-schema.sql` script.

For **existing databases**: Run `supabase-migration-phase3.sql` in the Supabase SQL Editor.

The migration is idempotent (safe to run multiple times).

### Verification

After running the migration, verify with:
```sql
-- Check _version column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'goals' AND column_name = '_version';

-- Check sync_operations table exists
SELECT * FROM pg_tables WHERE tablename = 'sync_operations';
```

### Notes
- `_version` starts at 1 and will be incremented by Phase 4's conflict resolution
- `sync_operations` table enables operation auditing and replay (used by Phase 4)
- Resurrection prevention handled by soft-delete (`deleted` field) + conflict resolution's `delete_wins` strategy

---

## Phase 4: Conflict Resolution Engine ✅ IMPLEMENTED

**Goal**: Implement three-tier conflict resolution with field-level merging

**Status**: Complete. Smart conflict resolution with field-level merging fully operational.

### Changes Implemented

1. **Device ID module** (`/src/lib/sync/deviceId.ts`)
   ```typescript
   // Generates stable UUID per device, persisted in localStorage
   export function getDeviceId(): string {
     let deviceId = localStorage.getItem(DEVICE_ID_KEY);
     if (!deviceId) {
       deviceId = crypto.randomUUID();
       localStorage.setItem(DEVICE_ID_KEY, deviceId);
     }
     return deviceId;
   }
   ```
   - Generates stable UUID per device on first access
   - Persisted in localStorage (survives page refreshes)
   - **Stored in Supabase** on every write (`device_id` column on all entity tables)
   - Used as deterministic tiebreaker when timestamps are identical
   - Lower device_id wins ties (arbitrary but consistent across all devices)

2. **Conflict resolver module** (`/src/lib/sync/conflicts.ts`)
   ```typescript
   interface FieldConflictResolution {
     field: string;
     localValue: unknown;
     remoteValue: unknown;
     resolvedValue: unknown;
     winner: 'local' | 'remote' | 'merged';
     strategy: 'last_write' | 'numeric_merge' | 'delete_wins' | 'local_pending';
   }
   ```
   - **Three-tier detection**:
     - Tier 1: Non-overlapping entities → auto-merge (no conflict)
     - Tier 2: Different fields → auto-merge fields (no conflict)
     - Tier 3: Same field → apply resolution strategy
   - **Resolution strategies**:
     - `local_pending`: Field has pending local operation → local wins (preserves intent)
     - `delete_wins`: Delete operation takes precedence (prevents resurrection)
     - `last_write`: Newer timestamp wins; deviceId tiebreaker if equal
     - `numeric_merge`: Reserved for future full-delta merge
   - **Excluded fields**: `id`, `user_id`, `created_at`, `_version` (auto-managed)

3. **Integrated with pull logic** (`/src/lib/sync/engine.ts`)
   ```typescript
   async function applyRemoteWithConflictResolution<T>(
     entityType: string,
     remoteRecords: T[],
     table: DexieTable
   ): Promise<void> {
     for (const remote of remoteRecords) {
       if (isRecentlyModified(remote.id)) continue;
       const local = await table.get(remote.id);
       if (!local) { await table.put(remote); continue; }
       if (pendingEntityIds.has(remote.id)) {
         const pendingOps = await getPendingOpsForEntity(remote.id);
         const resolution = await resolveConflicts(entityType, remote.id, local, remote, pendingOps);
         await table.put(resolution.mergedEntity);
         if (resolution.hasConflicts) await storeConflictHistory(resolution);
       } else {
         await table.put(remote);
       }
     }
   }
   ```
   - Replaced "skip if pending ops" with field-level conflict resolution
   - Processes all 12 entity tables through same resolution logic
   - Version increment on merge for optimistic concurrency tracking

4. **Conflict history table** (`conflictHistory` in IndexedDB v9)
   ```typescript
   interface ConflictHistoryEntry {
     id?: number;           // Auto-increment
     entityId: string;      // Entity that had conflict
     entityType: string;    // Table name
     field: string;         // Field with conflict
     localValue: unknown;   // What local had
     remoteValue: unknown;  // What remote had
     resolvedValue: unknown;// Final resolved value
     winner: 'local' | 'remote' | 'merged';
     strategy: string;      // Resolution strategy used
     timestamp: string;     // When resolved
   }
   ```
   - Auto-cleanup of entries older than 30 days
   - `cleanupConflictHistory()` called after successful sync

5. **Protection mechanisms**
   - **Recently modified protection**: 2-second TTL window after local writes
   - **Field-level pending protection**: Fields with pending ops always win
   - **Version tracking**: `_version` incremented on merge

### Files Modified/Created
- `/src/lib/sync/deviceId.ts` - New file (~55 lines)
- `/src/lib/sync/conflicts.ts` - New file (~400 lines)
- `/src/lib/sync/engine.ts` - Integrated `applyRemoteWithConflictResolution()`
- `/src/lib/db/schema.ts` - Added version 9 with conflictHistory table
- `/src/lib/types.ts` - Added ConflictHistoryEntry interface

### Key Design Decisions

1. **Field-level merging**: Instead of full entity replacement, merge non-conflicting fields
2. **Pending ops protection**: Fields with pending local operations always win (preserves user intent)
3. **Delete wins**: Delete operations take precedence to prevent resurrection
4. **Version tracking**: `_version` incremented on merge for future optimistic concurrency
5. **Deferred**: Conflict review UI (optional, can be added in future phase)

---

## Phase 5: Real-Time Subscriptions ✅ IMPLEMENTED

**Goal**: Add Supabase real-time subscriptions for instant multi-device sync

**Status**: Complete. Supabase Realtime subscriptions provide instant sync across devices.

### Why Real-Time (Not a Formal Inbox)

For Stellar's use case (single user, multiple personal devices), real-time subscriptions are sufficient without a formal inbox system:

| Concern | How It's Handled |
|---------|------------------|
| **Conflict resolution** | Phase 4's field-level merge handles concurrent edits |
| **Resurrection prevention** | Soft-delete (`deleted` field) + `delete_wins` strategy in conflict resolution |
| **Deduplication** | Idempotent updates (upserts), updates don't touch `deleted` field |
| **Ordering** | Not critical for single-user; timestamp-based resolution works |

A formal inbox pattern (strict operation ordering, processing queues) is designed for collaborative multi-user apps like Google Docs. For personal productivity with occasional multi-device use, the existing conflict resolution provides all necessary guarantees.

### Why No Separate Tombstone Table

A separate tombstone table was considered but deemed unnecessary because:

1. **Soft-delete already tracks deletions**: Every entity has a `deleted: boolean` field
2. **Conflict resolution handles it**: The `delete_wins` strategy ensures deletes take precedence
3. **Updates don't overwrite deleted**: `set` and `increment` operations only touch their specific fields, never the `deleted` field
4. **30-day cleanup retention**: Soft-deleted records are retained for 30 days before hard-delete, matching any realistic offline window

The only scenario where a separate tombstone would help is if a device is offline for 30+ days with pending changes - an edge case not worth the added complexity.

### Changes Implemented

1. **Real-time subscription manager** (`/src/lib/sync/realtime.ts`)
   - Subscribes to all 12 synced tables using Supabase Realtime PostgreSQL Changes
   - Single channel per user with `user_id` filter for efficiency
   - Connection state management (disconnected, connecting, connected, error)
   - Automatic reconnection with exponential backoff (max 5 attempts)
   - Graceful unsubscribe on logout/page unload

2. **Incoming change handler**
   - On INSERT/UPDATE: Applies through existing conflict resolution engine
   - On DELETE: Removes entity from local DB
   - Skips recently-modified entities (2-second protection window)
   - Uses conflict resolution when entity has pending local operations
   - Notifies stores to refresh after each remote change

3. **Sync engine integration** (`/src/lib/sync/engine.ts`)
   - Starts realtime subscriptions when sync engine starts (if online)
   - Stops subscriptions when sync engine stops
   - Connection state tracked in sync status store
   - Periodic polling skipped when realtime is healthy (reduces egress)
   - Tab visibility sync skipped when realtime is connected

4. **Sync store integration** (`/src/lib/stores/sync.ts`)
   - Added `realtimeState` to track connection status
   - States: 'disconnected' | 'connecting' | 'connected' | 'error'
   - Available for UI components to show connection indicator

5. **Fallback to polling**
   - If WebSocket connection fails after 5 attempts, falls back to polling
   - 15-minute periodic sync still runs as fallback when realtime is unhealthy
   - Realtime is an enhancement, not a requirement

### Files Modified/Created
- `/src/lib/sync/realtime.ts` - New file (~300 lines)
- `/src/lib/sync/engine.ts` - Integrated realtime start/stop, optimized polling
- `/src/lib/stores/sync.ts` - Added realtimeState tracking
- `/src/routes/+layout.svelte` - Updated to await async stopSyncEngine

### Benefits Over Previous Polling-Only

| Before | After |
|--------|-------|
| 15-min sync interval | Instant (~100ms) |
| Sync on tab focus (if away >5min) | Always current |
| Must wait after switching devices | Seamless device switching |
| Constant polling egress | Near-zero egress when realtime healthy |
| Tab return always syncs | Tab return skips sync if realtime connected |

### Remote Change Animation System

To provide visual feedback when remote changes arrive, a comprehensive animation system was implemented:

#### Components

1. **Remote Changes Store** (`/src/lib/stores/remoteChanges.ts`)
   - Tracks recent remote changes with action type detection
   - Manages active editing state to defer changes during form edits
   - Handles pending deletes with animation delay
   - Provides derived stores for UI components

2. **Remote Change Action** (`/src/lib/actions/remoteChange.ts`)
   - Svelte action (`use:remoteChangeAnimation`) for attaching animations
   - Automatically detects action type and applies appropriate animation
   - Handles create, delete, toggle, increment, decrement, reorder, rename, update
   - Tracks editing state with `use:trackEditing`

3. **CSS Animations** (`/src/app.css`)
   - `.item-created`: Slide-in with blur and glow burst
   - `.item-deleting`: Slide-out with fade and red flash
   - `.item-toggled`: Green highlight with scale bounce
   - `.counter-increment/.counter-decrement`: Value bounce animations
   - `.item-reordering`: Subtle scale/opacity settle
   - `.text-changed`: Shimmer gradient sweep
   - `.item-changed`: Default highlight for generic updates

#### Action Type Detection

Since Supabase Realtime only sends INSERT/UPDATE/DELETE events, the system infers the specific action by analyzing which fields changed:

| Event Type | Changed Fields | Detected Action |
|------------|----------------|-----------------|
| INSERT | - | `create` |
| DELETE | - | `delete` |
| UPDATE | `completed` or `is_enabled` | `toggle` |
| UPDATE | `current_value` (positive delta) | `increment` |
| UPDATE | `current_value` (negative delta) | `decrement` |
| UPDATE | `order` only | `reorder` |
| UPDATE | `name` (with ≤2 fields) | `rename` |
| UPDATE | other fields | `update` |

#### Delete Animation Flow

Delete animations require special handling because Svelte removes elements from the DOM immediately when data changes. The solution:

1. Remote DELETE event received
2. `recordRemoteChange()` called with DELETE event type
3. `markPendingDelete()` adds entity to pending deletes map and returns Promise
4. UI components detect pending delete via `createPendingDeleteIndicator` store
5. `item-deleting` CSS class applied for 500ms animation
6. Promise resolves after animation duration
7. Actual database delete occurs, DOM element removed

---

## Phase 6: Testing & Hardening

**Goal**: Comprehensive testing of multi-device scenarios

### Changes

1. **Unit tests**
   - Operation coalescing logic
   - Conflict resolution strategies
   - Delete propagation scenarios

2. **Integration tests**
   - Multi-device simulation (two IndexedDB instances)
   - Offline/online transitions
   - Concurrent editing scenarios
   - Real-time subscription handling

3. **Edge case handling**
   - Clock skew between devices
   - Rapid successive updates
   - Partial sync failures and recovery
   - Network interruption during sync

4. **Performance testing**
   - Large operation queues (1000+ pending ops)
   - Rapid real-time updates
   - Memory usage under load
   - Coalescing efficiency

### Files to Create
- `/tests/sync/coalescing.test.ts`
- `/tests/sync/conflicts.test.ts`
- `/tests/sync/realtime.test.ts`
- `/tests/sync/integration.test.ts`

### Estimated Scope
- ~4 new test files
- ~800 lines of tests

---

## Summary Table

| Phase | Focus | Status | New Files | Modified Files | Lines (est) |
|-------|-------|--------|-----------|----------------|-------------|
| 1 | Intent-Based Operations | ✅ Complete | 2 | 15 | 500 |
| 2 | New Coalescing | ✅ Complete | 0 | 2 | 150 |
| 3 | Supabase Schema | ✅ Complete | 1 SQL | 4 | 200 |
| 4 | Conflict Resolution | ✅ Complete | 2 | 3 | 400 |
| 5 | Real-Time | ✅ Complete | 1 | 3 | 300 |
| 6 | Testing | Pending | 4 | 0 | 800 |
| **Total** | | | **10** | **27** | **2350** |

---

## Migration Strategy

### Backwards Compatibility

1. **Phase 1-2**: Old snapshot operations converted to `set` operations on read
2. **Phase 3**: Database migration adds columns with defaults
3. **Phases 4-6**: New features are additive, don't break existing

### Rollout Plan

1. ✅ Deploy Phase 1-3 together (foundation) - COMPLETE
2. ✅ Deploy Phase 4 (conflict handling) - COMPLETE
3. ✅ Deploy Phase 5 (real-time subscriptions) - COMPLETE
4. Run Phase 6 (testing) throughout

### Feature Flags

Since this is a single-user app without gradual rollout needs, feature flags are not used. Each phase is implemented fully and replaces the previous behavior.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Full local backup before migration, server-side backup |
| Performance degradation | Benchmark each phase, feature flags for rollback |
| Real-time connection issues | Fallback to polling if WebSocket fails |
| Conflict resolution bugs | Preserve losing values, allow manual review |
| Clock skew between devices | Use server timestamps for ordering when possible |

---

## Success Metrics

1. **Zero data loss**: All offline changes sync correctly
2. **Merge success rate**: >95% of conflicts auto-resolved
3. **UI responsiveness**: <100ms for local operations
4. **Sync latency**: <2s for real-time updates
5. **Conflict visibility**: Users can see and review resolutions
