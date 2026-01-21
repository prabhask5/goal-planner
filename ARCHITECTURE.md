# Stellar Architecture

Technical reference for Stellar's system architecture covering data flow, synchronization, authentication, and persistence layers.

---

## Table of Contents

1. [System Diagram](#system-diagram)
2. [Architectural Overview](#architectural-overview)
3. [Local Database (IndexedDB + Dexie)](#local-database-indexeddb--dexie)
4. [Sync Engine](#sync-engine)
5. [Sync Queue (Outbox Pattern)](#sync-queue-outbox-pattern)
6. [Conflict Resolution](#conflict-resolution)
7. [Authentication System](#authentication-system)
8. [Offline Authentication](#offline-authentication)
9. [Inter-Tab Communication](#inter-tab-communication)
10. [Supabase Integration](#supabase-integration)
11. [Realtime Subscriptions](#realtime-subscriptions)
12. [PWA Service Worker](#pwa-service-worker)
13. [Focus Timer State Machine](#focus-timer-state-machine)
14. [Failure Modes and Recovery](#failure-modes-and-recovery)

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT                                            │
│                                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐     ┌───────────────────────────┐    │
│  │   Application    │────▶│     Stores       │────▶│       Repositories        │    │
│  │     Logic        │◀────│   (Reactive)     │◀────│     (Data Access)         │    │
│  └──────────────────┘     └──────────────────┘     └─────────────┬─────────────┘    │
│                                    │                              │                  │
│                                    │                              │                  │
│                                    ▼                              ▼                  │
│                           ┌──────────────────┐     ┌───────────────────────────┐    │
│                           │   Sync Engine    │────▶│   IndexedDB (Dexie.js)    │    │
│                           │                  │◀────│                           │    │
│                           └────────┬─────────┘     │  ┌───────────────────┐    │    │
│                                    │               │  │    Entity Tables  │    │    │
│                                    │               │  ├───────────────────┤    │    │
│                                    │               │  │    Sync Queue     │    │    │
│                                    │               │  ├───────────────────┤    │    │
│                                    │               │  │ Offline Creds     │    │    │
│                                    │               │  └───────────────────┘    │    │
│                                    │               └───────────────────────────┘    │
│                                    │                                                 │
├────────────────────────────────────┼─────────────────────────────────────────────────┤
│                                    │                                                 │
│  ┌──────────────────┐              │                                                 │
│  │  Service Worker  │              │                                                 │
│  │   (PWA Cache)    │              │                                                 │
│  └──────────────────┘              │                                                 │
│                                    │                                                 │
├────────────────────────────────────┼─────────────────────────────────────────────────┤
│                               NETWORK                                                │
│                                    │                                                 │
│                                    ▼                                                 │
│                           ┌──────────────────┐                                       │
│                           │    Supabase      │                                       │
│                           │  ┌────────────┐  │                                       │
│                           │  │ PostgreSQL │  │                                       │
│                           │  ├────────────┤  │                                       │
│                           │  │    Auth    │  │                                       │
│                           │  ├────────────┤  │                                       │
│                           │  │  Realtime  │  │                                       │
│                           │  └────────────┘  │                                       │
│                           └──────────────────┘                                       │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Architectural Overview

### Core Principles

1. **Local-First**: All reads come from IndexedDB. Network latency never blocks user interactions.
2. **Optimistic Writes**: Writes update local state immediately and queue for background sync.
3. **Outbox Pattern**: Every write creates a sync queue entry within the same atomic transaction.
4. **Last-Write-Wins**: Conflict resolution based on `updated_at` timestamps with protection for in-flight changes.
5. **Tombstone Deletes**: Soft deletes enable reliable multi-device synchronization.

### Data Flow Patterns

**Read Path:**
```
Store.load() → Repository.getX() → Dexie Query → IndexedDB → Return to Caller
```
No network involved. Instant response.

**Write Path:**
```
Repository.create/update/delete() → Dexie Transaction [
  1. Write entity to table
  2. Insert sync queue entry
] → scheduleSyncPush() → Return immediately
```
User sees instant feedback. Sync happens in background.

**Sync Path:**
```
Trigger (timer/visibility/reconnect) → acquireLock() → [
  1. Push: Process sync queue → Supabase upsert/delete
  2. Pull: Query Supabase → Filter conflicts → Apply to IndexedDB
] → releaseLock() → Notify stores → Refresh
```

---

## Local Database (IndexedDB + Dexie)

### Schema Definition

**File:** `src/lib/db/schema.ts`

**Database:** `GoalPlannerDB` (Dexie instance)

**Schema Version:** 7 (with upgrade migrations)

### Tables

| Table | Primary Key | Indexes | Description |
|-------|-------------|---------|-------------|
| `goalLists` | `id` | `user_id`, `created_at`, `updated_at` | Goal list containers |
| `goals` | `id` | `goal_list_id`, `order`, `created_at`, `updated_at` | Individual goals |
| `dailyRoutineGoals` | `id` | `user_id`, `order`, `start_date`, `end_date`, `created_at`, `updated_at` | Routine definitions |
| `dailyGoalProgress` | `id` | `daily_routine_goal_id`, `date`, `[daily_routine_goal_id+date]`, `updated_at` | Daily progress records |
| `taskCategories` | `id` | `user_id`, `order`, `created_at`, `updated_at` | Task categorization |
| `commitments` | `id` | `user_id`, `section`, `order`, `created_at`, `updated_at` | Career/Social/Personal items |
| `dailyTasks` | `id` | `user_id`, `order`, `created_at`, `updated_at` | Daily checklist items |
| `longTermTasks` | `id` | `user_id`, `due_date`, `category_id`, `created_at`, `updated_at` | Tasks with due dates |
| `focusSettings` | `id` | `user_id`, `updated_at` | Timer configuration |
| `focusSessions` | `id` | `user_id`, `started_at`, `ended_at`, `status`, `updated_at` | Focus session state |
| `blockLists` | `id` | `user_id`, `order`, `updated_at` | Website blocking lists |
| `blockedWebsites` | `id` | `block_list_id`, `updated_at` | Domains to block |
| `syncQueue` | `++id` | `table`, `entityId`, `timestamp` | Outbox for pending syncs |
| `offlineCredentials` | `id` | - | Singleton: cached login credentials |
| `offlineSession` | `id` | - | Singleton: offline session token |

### Database Client

**File:** `src/lib/db/client.ts`

```typescript
export const db = new GoalPlannerDB();
export const generateId = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();
```

### Repository Pattern

Each entity type has a dedicated repository in `src/lib/db/repositories/`.

**Standard Repository Operations:**
1. Get all (with filters)
2. Get single by ID
3. Create (with sync queue entry)
4. Update (with sync queue entry)
5. Delete (soft delete with sync queue entry)
6. Reorder (batch order updates)

**Atomic Transaction Pattern:**
```typescript
await db.transaction('rw', [db.goals, db.syncQueue], async () => {
  // 1. Write entity
  await db.goals.put(goal);

  // 2. Queue sync operation
  await db.syncQueue.add({
    table: 'goals',
    operation: 'update',
    entityId: goal.id,
    payload: goal,
    timestamp: now(),
    retries: 0
  });
});

// 3. Schedule background sync (outside transaction)
scheduleSyncPush();
```

---

## Sync Engine

**File:** `src/lib/sync/engine.ts`

### Constants

```typescript
const SYNC_DEBOUNCE_MS = 2000;           // Wait after writes before pushing
const SYNC_INTERVAL_MS = 300000;          // 5-minute periodic sync
const VISIBILITY_SYNC_DEBOUNCE_MS = 1000; // 1s after tab becomes visible
const RECENTLY_MODIFIED_TTL_MS = 5000;    // Entity protection window
const MAX_PULL_RETRIES = 3;               // Retry pull on failure
```

### State Variables

```typescript
let syncLock = false;                     // Mutex for sync operations
let syncTimeout: number | null = null;    // Debounce timer
let syncInterval: number | null = null;   // Periodic sync timer
let currentUserId: string | null = null;  // Active user
let recentlyModified = new Map<string, number>(); // Entity ID → timestamp
```

### Core Functions

#### `initSync(userId: string)`
Initializes sync system for authenticated user.
1. Set current user ID
2. Start periodic sync interval
3. Register visibility change listener
4. Register online/offline handlers
5. Perform initial pull if local DB empty
6. Setup realtime subscriptions

#### `stopSync()`
Cleanup when user logs out or component unmounts.
1. Clear all timeouts and intervals
2. Remove event listeners
3. Clear realtime subscriptions
4. Reset state variables

#### `scheduleSyncPush()`
Debounced push trigger called after local writes.
```typescript
function scheduleSyncPush() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => runSyncCycle(false), SYNC_DEBOUNCE_MS);
}
```

#### `runSyncCycle(showErrors = true)`
Main sync orchestration.
```typescript
async function runSyncCycle(showErrors: boolean) {
  if (!await acquireSyncLock()) return; // Skip if already syncing

  try {
    syncStatusStore.setStatus('syncing');

    // Push first to ensure local changes persist
    await pushLocalChanges();

    // Pull with retries
    let pullSuccess = false;
    for (let i = 0; i < MAX_PULL_RETRIES && !pullSuccess; i++) {
      try {
        await pullRemoteChanges();
        pullSuccess = true;
      } catch (e) {
        if (i === MAX_PULL_RETRIES - 1) throw e;
        await sleep(1000 * (i + 1)); // Backoff
      }
    }

    syncStatusStore.setStatus('idle');
    syncStatusStore.setLastSyncTime(now());
    notifySyncComplete();

  } catch (error) {
    if (showErrors) {
      syncStatusStore.setError(categorizeError(error));
    }
  } finally {
    releaseSyncLock();
  }
}
```

#### `pushLocalChanges()`
Ships outbox queue to Supabase.
```typescript
async function pushLocalChanges() {
  const pending = await getPendingSync();

  for (const item of pending) {
    try {
      switch (item.operation) {
        case 'create':
        case 'update':
          await supabase.from(item.table).upsert(item.payload);
          break;
        case 'delete':
          await supabase.from(item.table)
            .update({ deleted: true, updated_at: now() })
            .eq('id', item.entityId);
          break;
      }
      await removeSyncItem(item.id);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // Already synced from another device
        await removeSyncItem(item.id);
      } else if (isNotFoundError(error)) {
        // Already deleted from another device
        await removeSyncItem(item.id);
      } else {
        await incrementRetry(item.id);
      }
    }
  }
}
```

#### `pullRemoteChanges()`
Fetches and merges remote changes.
```typescript
async function pullRemoteChanges() {
  const cursor = localStorage.getItem(`lastSyncCursor_${currentUserId}`) || '1970-01-01T00:00:00Z';
  const pendingEntityIds = await getPendingEntityIds();

  // Parallel queries for all tables
  const [
    goalLists, goals, routines, progress,
    categories, commitments, dailyTasks, longTermTasks,
    focusSettings, focusSessions, blockLists, blockedWebsites
  ] = await Promise.all([
    supabase.from('goal_lists').select('*').gt('updated_at', cursor).eq('user_id', currentUserId),
    supabase.from('goals').select('*').gt('updated_at', cursor),
    // ... other tables
  ]);

  await db.transaction('rw', [...allTables], async () => {
    for (const remote of goalLists.data || []) {
      if (shouldAcceptRemote(remote, pendingEntityIds)) {
        if (remote.deleted) {
          await db.goalLists.delete(remote.id);
        } else {
          await db.goalLists.put(remote);
        }
      }
    }
    // ... other tables
  });

  // Update cursor to max updated_at
  const maxTimestamp = findMaxUpdatedAt(allResults);
  if (maxTimestamp) {
    localStorage.setItem(`lastSyncCursor_${currentUserId}`, maxTimestamp);
  }
}
```

#### `shouldAcceptRemote(remote, pendingEntityIds)`
Determines if remote change should be applied locally.
```typescript
function shouldAcceptRemote(remote: Entity, pendingEntityIds: Set<string>): boolean {
  // Skip if entity has pending local changes
  if (pendingEntityIds.has(remote.id)) return false;

  // Skip if recently modified locally (within 5 seconds)
  const modifiedAt = recentlyModified.get(remote.id);
  if (modifiedAt && Date.now() - modifiedAt < RECENTLY_MODIFIED_TTL_MS) return false;

  // Check local version
  const local = await db[table].get(remote.id);
  if (!local) return true; // New entity

  // Accept if remote is newer
  return new Date(remote.updated_at) > new Date(local.updated_at);
}
```

#### `markEntityModified(entityId: string)`
Marks entity as recently modified to prevent pull overwrite.
```typescript
function markEntityModified(entityId: string) {
  recentlyModified.set(entityId, Date.now());
  // Cleanup old entries
  setTimeout(() => recentlyModified.delete(entityId), RECENTLY_MODIFIED_TTL_MS + 1000);
}
```

#### `onSyncComplete(callback): () => void`
Registers callback for sync completion events. Returns unsubscribe function.

---

## Sync Queue (Outbox Pattern)

**File:** `src/lib/sync/queue.ts`

### Queue Item Structure

```typescript
interface SyncQueueItem {
  id?: number;           // Auto-increment primary key
  table: string;         // Target table name
  operation: 'create' | 'update' | 'delete';
  entityId: string;      // Entity UUID
  payload: Record<string, unknown>;  // Full entity data
  timestamp: string;     // ISO timestamp for backoff calculation
  retries: number;       // Retry count
}
```

### Constants

```typescript
const MAX_SYNC_RETRIES = 5;   // Give up after 5 attempts
const MAX_QUEUE_SIZE = 1000;  // Safety limit
```

### Functions

#### `queueSyncDirect(table, operation, entityId, payload)`
Adds item directly to queue. Called within Dexie transactions.
```typescript
async function queueSyncDirect(
  table: string,
  operation: SyncOperation,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await db.syncQueue.add({
    table,
    operation,
    entityId,
    payload,
    timestamp: now(),
    retries: 0
  });
}
```

#### `getPendingSync()`
Returns items ready to sync (backoff elapsed, under retry limit).
```typescript
async function getPendingSync(): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.toArray();
  return all.filter(item => {
    if (item.retries >= MAX_SYNC_RETRIES) return false;
    const backoffMs = Math.pow(2, item.retries) * 1000; // 1s, 2s, 4s, 8s, 16s
    const elapsed = Date.now() - new Date(item.timestamp).getTime();
    return elapsed >= backoffMs;
  });
}
```

#### `removeSyncItem(id: number)`
Removes successfully synced item.

#### `incrementRetry(id: number)`
Increments retry count and updates timestamp for backoff.
```typescript
async function incrementRetry(id: number): Promise<void> {
  await db.syncQueue.update(id, {
    retries: item.retries + 1,
    timestamp: now()
  });
}
```

#### `getPendingEntityIds()`
Returns set of entity IDs with pending sync operations.
```typescript
async function getPendingEntityIds(): Promise<Set<string>> {
  const items = await db.syncQueue.toArray();
  return new Set(items.map(i => i.entityId));
}
```

#### `cleanupFailedItems()`
Removes items exceeding retry limit. Returns count and affected tables.

### Exponential Backoff

| Retry | Wait Time |
|-------|-----------|
| 0 | Immediate |
| 1 | 2 seconds |
| 2 | 4 seconds |
| 3 | 8 seconds |
| 4 | 16 seconds |
| 5+ | Removed (failed) |

---

## Conflict Resolution

### Decision Flow

```
Remote Change Received
         │
         ▼
┌────────────────────────┐
│ Entity in sync queue?  │──Yes──▶ REJECT (local wins)
└───────────┬────────────┘
            │ No
            ▼
┌────────────────────────┐
│ Modified in last 5s?   │──Yes──▶ REJECT (local wins)
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

1. **Pending Queue Protection**: Entities with unsynced local changes are never overwritten by pulls.

2. **Recently Modified Protection**: 5-second TTL window after local writes prevents race conditions.

3. **Timestamp Comparison**: Even without pending/recent flags, older remote data doesn't overwrite newer local data.

### Error Handling

| Error Type | Action |
|------------|--------|
| Duplicate key (23505) | Remove from queue (already synced from other device) |
| Not found | Remove from queue (already deleted from other device) |
| Network error | Increment retry, apply backoff |
| Auth error | Stop sync, trigger re-auth |
| Rate limit | Increment retry, longer backoff |

---

## Authentication System

### Online Authentication (Supabase Auth)

**File:** `src/lib/supabase/auth.ts`

#### Sign Up
```typescript
async function signUp(email: string, password: string, firstName: string, lastName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName }
    }
  });

  if (data.user && data.session) {
    await cacheOfflineCredentials(email, password, data.user, data.session);
  }

  return { data, error };
}
```

#### Sign In
```typescript
async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (data.user && data.session) {
    await cacheOfflineCredentials(email, password, data.user, data.session);
  }

  return { data, error };
}
```

#### Sign Out
```typescript
async function signOut() {
  await supabase.auth.signOut();
  await clearOfflineCredentials();
  await clearOfflineSession();
  // Clear local data
  await db.delete();
}
```

### Session Management

- Supabase client auto-refreshes tokens before expiry
- Session stored in localStorage by Supabase client
- `onAuthStateChange` listener handles session events

---

## Offline Authentication

### Credential Caching

**File:** `src/lib/auth/offlineCredentials.ts`

#### Data Structure
```typescript
interface OfflineCredentials {
  id: 'current_user';  // Singleton key
  userId: string;
  email: string;
  passwordHash: string;  // PBKDF2-SHA256
  salt: string;          // 16-byte random
  firstName: string;
  lastName: string;
  cachedAt: string;      // ISO timestamp
}
```

#### Caching Process
```typescript
async function cacheOfflineCredentials(
  email: string,
  password: string,
  user: User,
  session: Session
): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  await db.offlineCredentials.put({
    id: 'current_user',
    userId: user.id,
    email,
    passwordHash: hash,
    salt,
    firstName: user.user_metadata.first_name,
    lastName: user.user_metadata.last_name,
    cachedAt: now()
  });
}
```

### Cryptography

**File:** `src/lib/auth/crypto.ts`

#### Constants
```typescript
const ITERATIONS = 100000;  // PBKDF2 iterations
const KEY_LENGTH = 256;     // Bits
const SALT_LENGTH = 16;     // Bytes
```

#### Password Hashing
```typescript
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: base64ToArrayBuffer(salt),
    iterations: ITERATIONS,
    hash: 'SHA-256'
  }, keyMaterial, KEY_LENGTH);

  return arrayBufferToBase64(derivedBits);
}
```

#### Password Verification
```typescript
async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  // Timing-safe comparison
  return timingSafeEqual(computedHash, storedHash);
}
```

### Offline Session Management

**File:** `src/lib/auth/offlineSession.ts`

#### Data Structure
```typescript
interface OfflineSession {
  id: 'current_session';  // Singleton key
  userId: string;
  offlineToken: string;   // UUID
  createdAt: string;
  expiresAt: string;      // createdAt + 1 hour
}
```

#### Session Creation
```typescript
async function createOfflineSession(userId: string): Promise<OfflineSession> {
  const session = {
    id: 'current_session',
    userId,
    offlineToken: crypto.randomUUID(),
    createdAt: now(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
  };

  await db.offlineSession.put(session);
  return session;
}
```

#### Session Validation
```typescript
async function getValidOfflineSession(): Promise<OfflineSession | null> {
  const session = await db.offlineSession.get('current_session');
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;
  return session;
}
```

#### Session Extension
```typescript
async function extendOfflineSession(): Promise<void> {
  const session = await db.offlineSession.get('current_session');
  if (session) {
    session.expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.offlineSession.put(session);
  }
}
```

### Offline Login Flow

```
User Offline + Has Cached Credentials
         │
         ▼
┌────────────────────────┐
│ User enters password   │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Retrieve cached creds  │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Hash password with     │
│ stored salt            │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Compare hashes         │──No──▶ Reject
└───────────┬────────────┘
            │ Match
            ▼
┌────────────────────────┐
│ Create offline session │
│ (1 hour expiry)        │
└───────────┬────────────┘
            │
            ▼
       Grant Access
```

---

## Inter-Tab Communication

The app uses the BroadcastChannel API to enable communication between browser tabs, primarily for the email confirmation flow.

### Channel Configuration

**Channel Name:** `stellar-auth-channel`

**Files:**
- `src/routes/+layout.svelte` - Main listener in root layout
- `src/routes/confirm/+page.svelte` - Confirmation page sender

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `FOCUS_REQUEST` | Confirm → App | Asks if any Stellar tab is open |
| `TAB_PRESENT` | App → Confirm | Responds that a tab is open |

### Message Payloads

```typescript
// FOCUS_REQUEST (sent from confirm page)
{
  type: 'FOCUS_REQUEST',
  from: 'confirm',
  authConfirmed: boolean  // true if email was just verified
}

// TAB_PRESENT (sent from app)
{
  type: 'TAB_PRESENT'
}
```

### Email Confirmation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EMAIL CONFIRMATION FLOW                              │
│                                                                              │
│  User signs up        User clicks email       Confirm page opens            │
│  in Stellar tab  ───▶  confirmation link  ───▶  (new tab)                   │
│       │                                              │                       │
│       │                                              │                       │
│       ▼                                              ▼                       │
│  ┌─────────────┐                           ┌─────────────────┐              │
│  │ Main Layout │                           │  Confirm Page   │              │
│  │             │                           │                 │              │
│  │ Listening   │◀──── BroadcastChannel ────│ Verify OTP      │              │
│  │ on channel  │                           │ token           │              │
│  └──────┬──────┘                           └────────┬────────┘              │
│         │                                           │                       │
│         │                                           │ Success               │
│         │                                           ▼                       │
│         │                                  ┌─────────────────┐              │
│         │                                  │ Send            │              │
│         │◀─────────────────────────────────│ FOCUS_REQUEST   │              │
│         │     { authConfirmed: true }      │ with authFlag   │              │
│         │                                  └────────┬────────┘              │
│         │                                           │                       │
│         ▼                                           │                       │
│  ┌─────────────┐                                    │                       │
│  │ Respond     │                                    │                       │
│  │ TAB_PRESENT │────────────────────────────────────│                       │
│  └──────┬──────┘                                    │                       │
│         │                                           ▼                       │
│         │                                  ┌─────────────────┐              │
│         ▼                                  │ Receive         │              │
│  ┌─────────────┐                           │ TAB_PRESENT     │              │
│  │ window.     │                           └────────┬────────┘              │
│  │ focus()     │                                    │                       │
│  └──────┬──────┘                                    │                       │
│         │                                           ▼                       │
│         ▼                                  ┌─────────────────┐              │
│  ┌─────────────┐                           │ Try window.     │              │
│  │ Reload page │                           │ close()         │              │
│  │ (if auth    │                           └────────┬────────┘              │
│  │  confirmed) │                                    │                       │
│  └─────────────┘                                    │                       │
│                                                     ▼                       │
│                                            ┌─────────────────┐              │
│                                            │ If close fails, │              │
│                                            │ show "You can   │              │
│                                            │ close this tab" │              │
│                                            └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Main Layout Listener

```typescript
// src/routes/+layout.svelte
const AUTH_CHANNEL_NAME = 'stellar-auth-channel';
let authChannel: BroadcastChannel | null = null;

onMount(() => {
  if ('BroadcastChannel' in window) {
    authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);

    authChannel.onmessage = (event) => {
      if (event.data.type === 'FOCUS_REQUEST') {
        // Respond that this tab is present
        authChannel?.postMessage({ type: 'TAB_PRESENT' });
        // Focus this window/tab
        window.focus();
        // If auth was just confirmed, reload to get the updated auth state
        if (event.data.authConfirmed) {
          window.location.reload();
        }
      }
    };
  }
});

onDestroy(() => {
  authChannel?.close();
});
```

### Confirmation Page Sender

```typescript
// src/routes/confirm/+page.svelte
async function focusOrRedirect() {
  status = 'redirecting';

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    let receivedResponse = false;

    channel.onmessage = (event) => {
      if (event.data.type === 'TAB_PRESENT') {
        receivedResponse = true;
        channel.close();
        // Try to close this tab
        try {
          window.close();
        } catch {
          // Ignore close errors
        }
        // If still here, show fallback message
        setTimeout(() => {
          status = 'can_close';
        }, 100);
      }
    };

    // Ask if any app tab is open
    channel.postMessage({ type: 'FOCUS_REQUEST', from: 'confirm', authConfirmed: true });

    // Wait for response (500ms timeout)
    await new Promise((resolve) => setTimeout(resolve, 500));

    channel.close();

    // If no response, redirect this tab to home
    if (!receivedResponse) {
      goto('/', { replaceState: true });
    }
  } else {
    // BroadcastChannel not supported, just redirect
    goto('/', { replaceState: true });
  }
}
```

### Browser Support

| Browser | BroadcastChannel Support |
|---------|-------------------------|
| Chrome | ✅ Yes (54+) |
| Firefox | ✅ Yes (38+) |
| Safari | ✅ Yes (15.4+) |
| Edge | ✅ Yes (79+) |
| IE | ❌ No (falls back to redirect) |

### Fallback Behavior

When BroadcastChannel is not available:
1. Email confirmation link opens new tab
2. Confirm page verifies token
3. Confirm page redirects to `/` in same tab
4. User manually switches back to original tab (if any)

---

## Supabase Integration

### Client Configuration

**File:** `src/lib/supabase/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const supabase = createClient<Database>(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);
```

### Database Schema

All tables include:
- `id`: UUID primary key
- `user_id`: UUID foreign key to auth.users
- `created_at`: Timestamp
- `updated_at`: Timestamp (auto-updated via trigger)
- `deleted`: Boolean for soft delete

### Row Level Security

```sql
-- Example policy: Users can only access their own data
CREATE POLICY "Users can CRUD own goal_lists"
ON goal_lists
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### Triggers

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goal_lists_updated_at
  BEFORE UPDATE ON goal_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

---

## Realtime Subscriptions

### Setup

```typescript
function setupRealtimeSubscriptions(userId: string) {
  const channel = supabase
    .channel(`user-${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'focus_sessions',
      filter: `user_id=eq.${userId}`
    }, handleFocusSessionChange)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'block_lists',
      filter: `user_id=eq.${userId}`
    }, handleBlockListChange)
    .subscribe();

  return channel;
}
```

### Event Handling

```typescript
function handleFocusSessionChange(payload: RealtimePayload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  switch (eventType) {
    case 'INSERT':
    case 'UPDATE':
      // Update local cache
      db.focusSessions.put(newRecord);
      // Notify stores
      focusStore.refresh();
      break;
    case 'DELETE':
      db.focusSessions.delete(oldRecord.id);
      focusStore.refresh();
      break;
  }
}
```

### Extension Communication

Focus session changes are propagated to the browser extension via realtime. The extension subscribes to the same channel and receives instant updates.

---

## PWA Service Worker

**File:** `static/sw.js`

### Version Management

```javascript
const APP_VERSION = 'BUILD_TIMESTAMP'; // Injected at build time
const CACHE_NAME = `stellar-${APP_VERSION}`;
```

### Install Event

```javascript
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.json',
        '/favicon.png',
        '/icon-192.png',
        '/icon-512.png'
      ]);
    })
  );
});
```

### Activate Event

```javascript
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('stellar-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});
```

### Fetch Event

```javascript
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase API calls
  if (url.origin.includes('supabase')) return;

  // Navigation requests (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Immutable assets (hashed filenames)
  if (url.pathname.startsWith('/_app/immutable/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Other static assets
  event.respondWith(staleWhileRevalidate(request));
});
```

### Caching Strategies

#### Network-First (Navigation)
```javascript
async function networkFirstWithFallback(request) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await caches.match('/');
    return cached || offlineFallback();
  }
}
```

#### Cache-First (Immutable)
```javascript
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
```

#### Stale-While-Revalidate
```javascript
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) {
      const cache = caches.open(CACHE_NAME);
      cache.then(c => c.put(request, response.clone()));
    }
    return response;
  });

  return cached || networkPromise;
}
```

### Offline Fallback

```javascript
function offlineFallback() {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Offline - Stellar</title>
      <style>/* space-themed styles */</style>
    </head>
    <body>
      <h1>You're Offline</h1>
      <p>Please check your connection and try again.</p>
      <button onclick="location.reload()">Try Again</button>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } });
}
```

### Update Flow

```javascript
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

---

## Focus Timer State Machine

### States

| State | Description |
|-------|-------------|
| `idle` | No active session |
| `running` + `focus` | Timer counting down in focus phase |
| `running` + `break` | Timer counting down in break phase |
| `paused` | Timer frozen, can resume |
| `stopped` | Session ended |

### State Transitions

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                              ┌────────┐                                  │
│                              │  IDLE  │◀───────────────────────────────┐ │
│                              └───┬────┘                                │ │
│                                  │ start()                             │ │
│                                  ▼                                     │ │
│  ┌───────────────────────────────────────────────────────────────────┐ │ │
│  │                    RUNNING                                         │ │ │
│  │  ┌──────────────┐         ┌──────────────┐                        │ │ │
│  │  │    FOCUS     │──timer──▶│    BREAK     │                        │ │ │
│  │  │              │◀──timer──│              │                        │ │ │
│  │  │              │──skip()─▶│              │                        │ │ │
│  │  │              │◀─skip()──│              │                        │ │ │
│  │  └──────┬───────┘         └──────────────┘                        │ │ │
│  │         │                        │                                 │ │ │
│  │    pause()                  pause()                               │ │ │
│  │         │                        │                                 │ │ │
│  │         ▼                        ▼                                 │ │ │
│  │  ┌────────────────────────────────────────┐                       │ │ │
│  │  │              PAUSED                     │                       │ │ │
│  │  │                                         │                       │ │ │
│  │  └──────────────────┬─────────────────────┘                       │ │ │
│  │                     │                                              │ │ │
│  │                resume()                                            │ │ │
│  │                     │                                              │ │ │
│  └─────────────────────┴──────────────────────────────────────────────┘ │
│                                                                          │
│                   stop() or session complete                             │
│                                  │                                       │
└──────────────────────────────────┴───────────────────────────────────────┘
```

### Phase Logic

```typescript
function getNextPhase(session: FocusSession, settings: FocusSettings): NextPhase {
  if (session.phase === 'focus') {
    // After focus phase
    if (session.current_cycle >= session.total_cycles) {
      return { phase: 'idle', cycle: session.current_cycle, durationMs: 0 };
    }

    const isLongBreak = session.current_cycle % settings.cycles_before_long_break === 0;
    const breakDuration = isLongBreak
      ? settings.long_break_duration
      : settings.break_duration;

    return { phase: 'break', cycle: session.current_cycle, durationMs: breakDuration * 60000 };
  }

  // After break phase
  return {
    phase: 'focus',
    cycle: session.current_cycle + 1,
    durationMs: session.focus_duration * 60000
  };
}
```

### Time Tracking

```typescript
interface FocusSession {
  // ... other fields
  phase_started_at: string;      // When current phase began
  phase_remaining_ms: number;    // Remaining time (set on pause)
  elapsed_duration: number;      // Total focus minutes (accumulated)
}

function calculateRemainingMs(session: FocusSession): number {
  if (session.status === 'paused') {
    return session.phase_remaining_ms;
  }

  const phaseStarted = new Date(session.phase_started_at).getTime();
  const phaseDuration = session.phase === 'focus'
    ? session.focus_duration * 60000
    : session.break_duration * 60000;

  const elapsed = Date.now() - phaseStarted;
  return Math.max(0, phaseDuration - elapsed);
}
```

---

## Failure Modes and Recovery

### Network Failure During Sync

**Scenario:** Network drops during push/pull operation.

**Detection:** Fetch throws network error.

**Recovery:**
1. Catch error in sync cycle
2. Set sync status to 'error' (if showErrors=true)
3. Keep items in queue with incremented retry count
4. Backoff timer prevents immediate retry
5. Next trigger (periodic/visibility/reconnect) retries

### Concurrent Sync Attempts

**Scenario:** Multiple triggers fire simultaneously.

**Prevention:** Mutex lock (`syncLock` boolean).

**Behavior:**
1. First caller acquires lock
2. Subsequent callers return immediately (no-op)
3. Lock released in `finally` block

### Tab Suspension/Background

**Scenario:** Browser suspends tab to save resources.

**Detection:** Visibility change event.

**Recovery:**
1. On tab becoming visible, trigger sync (debounced)
2. Pull remote changes to catch up
3. Push any pending local changes

### Device Sleep/Wake

**Scenario:** Device sleeps then wakes.

**Detection:** Combination of visibility change and online event.

**Recovery:**
1. Check online status
2. Verify session validity
3. Trigger full sync cycle

### IndexedDB Quota Exceeded

**Scenario:** Local storage full.

**Detection:** Dexie throws `QuotaExceededError`.

**Recovery:**
1. Log error
2. Attempt tombstone cleanup (delete soft-deleted records older than 30 days)
3. If still failing, user must clear data

### Supabase Token Expired

**Scenario:** Access token expires during offline period.

**Detection:** 401 error from Supabase.

**Recovery:**
1. Supabase client auto-refreshes if refresh token valid
2. If refresh fails, trigger re-authentication
3. User may need to login again

### Sync Queue Overflow

**Scenario:** Too many offline changes accumulate.

**Detection:** Queue size exceeds `MAX_QUEUE_SIZE`.

**Recovery:**
1. Oldest items processed first (FIFO)
2. Failed items cleaned up after `MAX_SYNC_RETRIES`
3. User notified if items permanently fail

### Corrupted Local Data

**Scenario:** IndexedDB data corrupted (rare).

**Detection:** Dexie throws schema or data errors.

**Recovery:**
1. Clear local database
2. Re-authenticate
3. Full pull from server
4. User loses unsynced changes

---

## File Reference

```
src/lib/
├── db/
│   ├── schema.ts              # Dexie database schema
│   ├── client.ts              # DB instance, helpers
│   └── repositories/
│       ├── goalLists.ts       # Goal list CRUD
│       ├── goals.ts           # Goal CRUD
│       ├── dailyRoutines.ts   # Routine CRUD
│       ├── dailyProgress.ts   # Progress CRUD
│       ├── taskCategories.ts  # Category CRUD
│       ├── commitments.ts     # Commitment CRUD
│       ├── dailyTasks.ts      # Daily task CRUD
│       ├── longTermTasks.ts   # Long-term task CRUD
│       ├── focusSettings.ts   # Focus settings CRUD
│       ├── focusSessions.ts   # Focus session CRUD
│       ├── blockLists.ts      # Block list CRUD
│       └── blockedWebsites.ts # Blocked website CRUD
├── sync/
│   ├── engine.ts              # Sync orchestration
│   └── queue.ts               # Outbox management
├── auth/
│   ├── crypto.ts              # PBKDF2 hashing
│   ├── offlineCredentials.ts  # Credential caching
│   ├── offlineSession.ts      # Offline sessions
│   └── reconnectHandler.ts    # Online/offline handling
├── supabase/
│   ├── client.ts              # Supabase client
│   ├── auth.ts                # Auth functions
│   └── types.ts               # Generated types
├── stores/
│   ├── data.ts                # Entity stores
│   ├── focus.ts               # Focus timer store
│   ├── sync.ts                # Sync status store
│   ├── authState.ts           # Auth state store
│   └── network.ts             # Online status store
├── utils/
│   ├── colors.ts              # Progress colors
│   ├── dates.ts               # Date utilities
│   └── focus.ts               # Timer utilities
└── types.ts                   # TypeScript interfaces

static/
├── sw.js                      # Service worker
└── manifest.json              # PWA manifest
```
