# Stellar Architecture

Technical reference for Stellar's system architecture covering data flow, synchronization, authentication, and persistence layers.

---

## Table of Contents

1. [System Diagram](#system-diagram)
2. [Architectural Principles](#architectural-principles)
3. [Data Flow Patterns](#data-flow-patterns)
4. [Local Database Schema](#local-database-schema)
5. [Sync Engine](#sync-engine)
6. [Outbox Pattern](#outbox-pattern)
7. [Conflict Resolution](#conflict-resolution)
8. [Offline Authentication](#offline-authentication)
9. [Inter-Tab Communication](#inter-tab-communication)
10. [PWA Caching Strategies](#pwa-caching-strategies)
11. [Focus Timer State Machine](#focus-timer-state-machine)
12. [Egress Optimization](#egress-optimization)
13. [Failure Modes and Recovery](#failure-modes-and-recovery)
14. [Tombstone Cleanup](#tombstone-cleanup)
15. [Debug Tools](#debug-tools)

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

## Architectural Principles

| Principle | Description |
|-----------|-------------|
| **Local-First** | All reads come from IndexedDB. Network latency never blocks user interactions. |
| **Optimistic Writes** | Writes update local state immediately and queue for background sync. User sees instant feedback. |
| **Outbox Pattern** | Every write creates a sync queue entry within the same atomic transaction, guaranteeing delivery. |
| **Last-Write-Wins** | Conflict resolution based on `updated_at` timestamps with protection for in-flight changes. |
| **Tombstone Deletes** | Soft deletes enable reliable multi-device synchronization. |
| **Fail-Safe Offline** | When connectivity is uncertain, the app continues functioning with local data. |

---

## Data Flow Patterns

### Read Path
```
UI Request → Store → Repository → Dexie Query → IndexedDB → Return
```
No network involved. Instant response from local database.

### Write Path
```
UI Action → Repository → Dexie Transaction [
  1. Write entity to table
  2. Insert sync queue entry (atomic)
] → Schedule background sync → Return immediately
```
User sees instant feedback. Sync happens asynchronously.

### Sync Path
```
Trigger (timer/visibility/reconnect) → Acquire mutex lock → [
  1. Push: Process sync queue → Supabase upsert/delete
  2. Pull: Query Supabase (cursor-based) → Filter conflicts → Apply to IndexedDB
] → Release lock → Notify stores → UI refreshes reactively
```

---

## Local Database Schema

**Database:** IndexedDB via Dexie.js
**Schema Version:** 8 (with upgrade migrations)

### Entity Tables

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `goalLists` | Goal list containers | `user_id`, `updated_at` |
| `goals` | Individual goals within lists | `goal_list_id`, `order` |
| `dailyRoutineGoals` | Recurring routine definitions | `user_id`, `start_date`, `end_date` |
| `dailyGoalProgress` | Per-day progress records | `[routine_id+date]` compound index |
| `taskCategories` | User-defined task categories | `user_id`, `order` |
| `commitments` | Career/Social/Personal items | `user_id`, `section` |
| `dailyTasks` | Daily checklist items | `user_id`, `order` |
| `longTermTasks` | Tasks with due dates | `user_id`, `due_date`, `category_id` |
| `focusSettings` | Per-user timer configuration | `user_id` |
| `focusSessions` | Focus session state | `user_id`, `status` |
| `blockLists` | Website blocking lists | `user_id`, `order` |
| `blockedWebsites` | Domains to block | `block_list_id` |

All entity tables include `_version` column (INTEGER, default 1) for optimistic concurrency control.

### System Tables

| Table | Purpose |
|-------|---------|
| `syncQueue` | Outbox for pending sync operations |
| `offlineCredentials` | Cached login credentials (hashed) |
| `offlineSession` | Offline session token |

### Supabase-Only Tables

These tables exist only on the server for multi-device sync infrastructure:

| Table | Purpose |
|-------|---------|
| `sync_operations` | Operation log for conflict auditing and replay |
| `tombstones` | Tracks deleted entities for resurrection prevention |

### Atomic Transaction Pattern

Every write operation executes within a single Dexie transaction that:
1. Writes the entity to its table
2. Inserts a corresponding sync queue entry

This guarantees that no local change can exist without a queued sync operation.

---

## Sync Engine

### Sync Triggers

| Trigger | Debounce | Purpose |
|---------|----------|---------|
| After local write | 2 seconds | Batch rapid changes |
| Periodic interval | 15 minutes | Catch missed updates (optimized for egress) |
| Tab becomes visible | 1 second (only if away >5 min) | Sync after background |
| Network reconnect | Immediate | Recover from offline |
| Manual pull-to-refresh | None | User-initiated sync |

### Sync Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        SYNC CYCLE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Acquire Mutex Lock                                           │
│     • Prevents concurrent sync attempts                          │
│     • Subsequent triggers return immediately                     │
│                                                                  │
│  2. Push Phase (Local → Remote)                                  │
│     • Process sync queue items                                   │
│     • Upsert/soft-delete on Supabase                            │
│     • Remove successful items from queue                         │
│     • Increment retry count on failure                           │
│                                                                  │
│  3. Pull Phase (Remote → Local)                                  │
│     • Query all tables where updated_at > cursor                 │
│     • Filter out entities with pending local changes             │
│     • Filter out recently modified entities (5s window)          │
│     • Apply remaining changes to IndexedDB                       │
│     • Update cursor to max timestamp                             │
│                                                                  │
│  4. Release Lock & Notify                                        │
│     • Stores refresh reactively                                  │
│     • UI updates automatically                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cursor-Based Incremental Sync

Each user has a sync cursor stored in localStorage (`lastSyncCursor_{userId}`). Pull queries only fetch records where `updated_at > cursor`, minimizing data transfer after initial sync.

---

## Outbox Pattern

The sync queue implements the transactional outbox pattern, ensuring reliable delivery of local changes to the server.

### Intent-Based Operations

The sync queue uses intent-preserving operations rather than state snapshots. This design enables proper multi-device conflict resolution by preserving the user's intent (e.g., "increment by 1") rather than just the final state (e.g., "current_value: 50").

### Queue Item Structure

```typescript
interface SyncOperationItem {
  id?: number;                    // Auto-increment ID
  table: SyncEntityType;          // Target table (e.g., 'goals', 'daily_tasks')
  entityId: string;               // UUID of the entity
  operationType: OperationType;   // 'increment' | 'set' | 'create' | 'delete'
  field?: string;                 // Field being modified (for increment/set)
  value?: unknown;                // Delta (increment), new value (set), or payload (create)
  timestamp: string;              // ISO timestamp (for backoff calculation)
  retries: number;                // Attempt count
}
```

### Operation Types

| Type | Purpose | Example |
|------|---------|---------|
| `increment` | Add delta to numeric field | Goal counter +1, progress +5 |
| `set` | Set field to specific value | Rename goal, change target |
| `create` | Create new entity | New goal, new routine |
| `delete` | Soft delete entity | Delete goal (sets deleted=true) |

### Queue Coalescing

Before pushing, the sync engine aggressively coalesces pending operations to minimize network requests and data transfer:

#### Cross-Operation Coalescing

| Pattern | Result | Rationale |
|---------|--------|-----------|
| `CREATE` → `DELETE` | Cancel both | Entity never needs to exist on server |
| `CREATE` → `UPDATE(s)` → `DELETE` | Cancel all | Net effect is nothing |
| `UPDATE(s)` → `DELETE` | Keep only `DELETE` | No point updating before delete |
| `CREATE` → `UPDATE(s)` | Merge into `CREATE` | Single insert with final state |
| `CREATE` → `SET(s)` | Merge into `CREATE` | Single insert with final state |

#### Same-Field Coalescing

| Pattern | Result | Rationale |
|---------|--------|-----------|
| `INCREMENT(s)` → `SET` | Keep only `SET` | Set overwrites increment values |
| `SET` → `INCREMENT(s)` | Single `SET` with final value | Combine set + increments |
| Multiple `INCREMENT`s | Sum deltas | e.g., 50 +1s → single +50 |
| Multiple `SET`s | Merge values | Later values override earlier |

#### No-Op Removal

| Pattern | Result | Rationale |
|---------|--------|-----------|
| Increment with delta = 0 | Remove | No effect (e.g., +5 then -5) |
| Set with empty payload | Remove | No data to update |
| Set with only `updated_at` | Remove | Server auto-updates timestamps |

#### Performance Optimizations

| Optimization | Before | After |
|--------------|--------|-------|
| DB fetches | 4 `toArray()` calls (one per phase) | 1 `toArray()` call (single-pass) |
| Deletes | Individual `delete()` calls | Single `bulkDelete()` call |
| Updates | Individual `update()` calls | Batched in single transaction |
| Processing | Sequential with DB round-trips | In-memory with batch commit |

This optimization is transparent, maintains data integrity, and can dramatically reduce sync operations (e.g., create + 50 increments + delete = 0 server requests).

### Exponential Backoff

| Retry | Wait Time |
|-------|-----------|
| 0 | Immediate |
| 1 | 2 seconds |
| 2 | 4 seconds |
| 3 | 8 seconds |
| 4 | 16 seconds |
| 5+ | Item removed (permanently failed) |

### Error Handling

| Error Type | Action |
|------------|--------|
| Duplicate key (23505) | Remove from queue — already synced from another device |
| Not found | Remove from queue — already deleted from another device |
| Network error | Increment retry, apply backoff |
| Auth error | Stop sync, trigger re-authentication |
| Rate limit | Increment retry, longer backoff |

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

1. **Pending Queue Protection**: Entities with unsynced local changes are never overwritten by pulls. The sync queue acts as a "lock" on those entities.

2. **Recently Modified Protection**: A 5-second TTL window after local writes prevents race conditions where a pull arrives between a local write and its sync.

3. **Timestamp Comparison**: Even without the above protections, older remote data never overwrites newer local data.

---

## Offline Authentication

### Credential Caching

On successful online login, credentials are cached locally for offline access:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL CACHING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  On Successful Login (signIn):                                   │
│                                                                  │
│  Stored in IndexedDB (offlineCredentials table):                 │
│  {                                                               │
│    id: 'current_user',     // singleton                          │
│    email,                  // user's email                       │
│    password,               // stored for offline re-auth         │
│    userId,                 // Supabase user ID                   │
│    firstName,              // from user_metadata                 │
│    lastName,               // from user_metadata                 │
│    cachedAt                // ISO timestamp                      │
│  }                                                               │
│                                                                  │
│  Note: Password is stored to enable re-authentication with       │
│  Supabase when transitioning from offline to online mode.        │
│  This ensures pending offline changes can only sync if the       │
│  password is still valid (hasn't been changed on another device).│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Offline Session Management

Offline sessions are lightweight markers that track offline authentication state:

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE SESSIONS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Session Creation Triggers:                                      │
│  1. Going offline while authenticated (automatic)                │
│  2. Offline login with cached credentials (manual)               │
│                                                                  │
│  Stored in IndexedDB (offlineSession table):                     │
│  {                                                               │
│    id: 'current_session',  // singleton                          │
│    userId,                 // must match credentials.userId      │
│    offlineToken,           // random UUID (for tracking)         │
│    createdAt               // ISO timestamp                      │
│  }                                                               │
│                                                                  │
│  Session Properties:                                             │
│  • Sessions do NOT auto-expire                                   │
│  • Only cleared on:                                              │
│    1. Successful re-auth when coming back online                 │
│    2. User signs out                                             │
│    3. Credential userId mismatch (different user logged in)      │
│                                                                  │
│  Security: All offline changes require re-auth before syncing    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Offline Login Flow

```
User Offline + Has Cached Credentials
         │
         ▼
┌────────────────────────┐
│ Display cached user    │
│ (firstName, email)     │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ User enters password   │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ verifyOfflineCredentials():       │
│ • Check email matches  │
│ • Check password matches│
│ • Check userId matches │
└───────────┬────────────┘
            │
      Match?│
            │
     ┌──────┴──────┐
     │             │
    Yes           No
     │             │
     ▼             ▼
┌────────────┐   ┌────────────┐
│ Create     │   │ Show error │
│ offline    │   │ "Invalid   │
│ session    │   │ password"  │
└─────┬──────┘   └────────────┘
      │
      ▼
┌────────────────────────┐
│ Start sync engine      │
│ Navigate to app        │
└────────────────────────┘
```

### Reconnection Auth Validation

When transitioning from offline to online mode, credentials are validated with Supabase BEFORE allowing sync:

```
┌─────────────────────────────────────────────────────────────────┐
│                RECONNECTION AUTH FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Network Reconnects (online event)                               │
│         │                                                        │
│         ▼                                                        │
│  ┌────────────────────────┐                                      │
│  │ Was user in offline    │──No──▶ markAuthValidated()           │
│  │ mode? (authState.mode) │        Allow sync immediately        │
│  └───────────┬────────────┘                                      │
│              │ Yes                                               │
│              ▼                                                   │
│  ┌────────────────────────┐                                      │
│  │ Get cached credentials │                                      │
│  │ (email + password)     │                                      │
│  └───────────┬────────────┘                                      │
│              │                                                   │
│              ▼                                                   │
│  ┌────────────────────────┐                                      │
│  │ RE-AUTHENTICATE with   │  ◀── This is the key security step  │
│  │ Supabase using cached  │      Password may have changed       │
│  │ email + password       │      while user was offline          │
│  │ (signIn with 15s timeout)│                                    │
│  └───────────┬────────────┘                                      │
│              │                                                   │
│     ┌────────┴────────┐                                          │
│     │                 │                                          │
│  Success           Failure                                       │
│     │                 │                                          │
│     ▼                 ▼                                          │
│  ┌─────────────┐   ┌──────────────────────┐                     │
│  │ Clear       │   │ clearPendingSyncQueue│  SECURITY:          │
│  │ offline     │   │ clearOfflineSession  │  Prevents           │
│  │ session     │   │ clearOfflineCredentials│ unauthorized      │
│  │             │   │ signOut()            │  data from          │
│  │ markAuth-   │   │ Redirect to login    │  syncing            │
│  │ Validated() │   │ Show error toast     │                     │
│  │             │   └──────────────────────┘                     │
│  │ runFullSync │                                                │
│  └─────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Security Properties

- Credentials cached locally for offline login capability
- Password stored to enable Supabase re-authentication on reconnect
- UserId verification prevents credential confusion across users
- Sync queue cleared on auth failure (prevents unauthorized data sync)
- Re-authentication with Supabase detects password changes made elsewhere

### Automatic Offline Session Creation

When going offline while authenticated, an offline session is automatically created:

```
┌─────────────────────────────────────────────────────────────────┐
│            AUTOMATIC OFFLINE SESSION (on disconnect)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  isOnline.onDisconnect() callback in +layout.ts:                 │
│                                                                  │
│  1. Get current Supabase session                                 │
│     └── If no session, skip (user not logged in)                 │
│                                                                  │
│  2. Get cached credentials                                       │
│     └── If none, skip (can't verify user)                        │
│                                                                  │
│  3. SECURITY CHECK:                                              │
│     • credentials.userId === session.user.id                     │
│     • credentials.email === session.user.email                   │
│     └── If mismatch, skip (different user)                       │
│                                                                  │
│  4. Check if offline session already exists                      │
│     └── If exists, skip (already have session)                   │
│                                                                  │
│  5. createOfflineSession(userId)                                 │
│     └── Creates new offline session for seamless offline access  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

This prevents a compromised offline session from syncing malicious data to the server.

### Complete Auth Flow Matrix

The following table shows all possible authentication scenarios and their outcomes:

| # | Network | Supabase Session | Session Expired | Offline Session | Offline Credentials Match | Result | Sync Engine |
|---|---------|-----------------|-----------------|-----------------|---------------------------|--------|-------------|
| 1 | Online | Valid | No | - | - | `supabase` mode | Started |
| 2 | Online | Valid | Yes | - | - | `none` → login | Not started |
| 3 | Online | None | - | Exists | - | `none` → login | Not started |
| 4 | Online | None | - | None | - | `none` → login | Not started |
| 5 | Offline | Valid (cached) | No | - | - | `supabase` mode | Started |
| 6 | Offline | Valid (cached) | Yes | Valid | Yes | `offline` mode | Started |
| 7 | Offline | None | - | Valid | Yes | `offline` mode | Started |
| 8 | Offline | None | - | Valid | No | `none` (mismatch) | Not started |
| 9 | Offline | None | - | None | - | `none` → login | Not started |

**Key Points:**
- When online, only Supabase auth is accepted (no fallback to offline session)
- When offline, first try cached Supabase session, then offline session
- Sync engine is started for ALL authenticated states (including offline mode)
- UserId mismatch between offline session and credentials clears the session

### Auth Initialization Flow (Root Layout)

```
┌─────────────────────────────────────────────────────────────────┐
│                    +layout.ts LOAD FUNCTION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  if (!browser) return { session: null, authMode: 'none' }        │
│                                                                  │
│  isOffline = !navigator.onLine                                   │
│         │                                                        │
│    ┌────┴────┐                                                   │
│    │         │                                                   │
│  ONLINE    OFFLINE                                               │
│    │         │                                                   │
│    ▼         │                                                   │
│  getSession()│                                                   │
│    │         │                                                   │
│    ▼         │                                                   │
│  Valid &     │                                                   │
│  not expired?│                                                   │
│    │         │                                                   │
│  ┌─┴─┐       │                                                   │
│ Yes  No      │                                                   │
│  │    │      │                                                   │
│  │    ▼      │                                                   │
│  │  return   │                                                   │
│  │  'none'   │                                                   │
│  │           │                                                   │
│  ▼           ▼                                                   │
│ startSync  getSession() (from localStorage)                      │
│ return     │                                                     │
│ 'supabase' │                                                     │
│            ▼                                                     │
│          Valid & not expired?                                    │
│            │                                                     │
│          ┌─┴─┐                                                   │
│         Yes  No                                                  │
│          │    │                                                  │
│          ▼    ▼                                                  │
│       startSync  getValidOfflineSession()                        │
│       return     │                                               │
│       'supabase' ▼                                               │
│                Exists?                                           │
│                  │                                               │
│                ┌─┴─┐                                             │
│               Yes  No                                            │
│                │    │                                            │
│                ▼    ▼                                            │
│            Match    return 'none'                                │
│            creds?                                                │
│              │                                                   │
│            ┌─┴─┐                                                 │
│           Yes  No                                                │
│            │    │                                                │
│            ▼    ▼                                                │
│        startSync  clearOfflineSession()                          │
│        return     return 'none'                                  │
│        'offline'                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Protected Routes Layout

The `(protected)/+layout.ts` adds redirect-to-login behavior for unauthenticated users:

```
┌─────────────────────────────────────────────────────────────────┐
│            (PROTECTED)/+layout.ts LOAD FUNCTION                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Same auth checks as root layout, but:                           │
│                                                                  │
│  • Does NOT start sync engine (root layout handles that)         │
│  • Throws redirect(302, '/login?redirect=...') on auth failure   │
│  • Preserves return URL for post-login navigation                │
│                                                                  │
│  Note: This is a nested layout - runs AFTER root layout          │
│  Root layout starts sync engine, this just guards access         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Login Page Flows

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOGIN PAGE SCENARIOS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SCENARIO 1: Online + No Cached Credentials                      │
│  • Show email/password form                                      │
│  • signIn() → caches credentials → goto(redirect)                │
│  • Root layout runs, starts sync engine                          │
│                                                                  │
│  SCENARIO 2: Online + Has Cached Credentials                     │
│  • Show email/password form (same as above)                      │
│  • Different user can log in, replaces cached credentials        │
│                                                                  │
│  SCENARIO 3: Offline + Has Cached Credentials                    │
│  • Show "Continue as {firstName}" with password only             │
│  • verifyOfflineCredentials() → createOfflineSession()           │
│  • window.location.href = redirect (hard nav)                    │
│  • Root layout runs, starts sync engine in offline mode          │
│                                                                  │
│  SCENARIO 4: Offline + No Cached Credentials                     │
│  • Show "Internet Required" message                              │
│  • Cannot proceed until online                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Sign Out Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       SIGN OUT FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  handleSignOut() in +layout.svelte:                              │
│                                                                  │
│  1. Show full-screen overlay (isSigningOut = true)               │
│  2. stopSyncEngine() - removes event listeners                   │
│  3. clearPendingSyncQueue() - discards pending changes           │
│  4. clearLocalCache() - clears all IndexedDB data                │
│  5. localStorage.removeItem('lastSyncTimestamp')                 │
│  6. syncStatusStore.reset()                                      │
│  7. clearOfflineSession()                                        │
│                                                                  │
│  8. If ONLINE:                                                   │
│     • clearOfflineCredentials()                                  │
│     • signOut({ preserveOfflineCredentials: false })             │
│     Else (OFFLINE):                                              │
│     • KEEP offline credentials (for re-login)                    │
│     • signOut({ preserveOfflineCredentials: true })              │
│                                                                  │
│  9. Clear Supabase localStorage manually (backup)                │
│ 10. authState.reset()                                            │
│ 11. window.location.href = '/login' (hard nav)                   │
│                                                                  │
│  Note: When signing out OFFLINE, credentials are preserved       │
│  so user can sign back in without internet.                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Inter-Tab Communication

The BroadcastChannel API enables secure communication between browser tabs, primarily for the email confirmation flow.

### Email Confirmation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EMAIL CONFIRMATION FLOW                              │
│                                                                              │
│  User signs up        User clicks email       Confirm page opens            │
│  in Stellar tab  ───▶  confirmation link  ───▶  (new tab)                   │
│       │                                              │                       │
│       ▼                                              ▼                       │
│  ┌─────────────┐                           ┌─────────────────┐              │
│  │ Login Page  │                           │  Confirm Page   │              │
│  │ Listening   │◀──── BroadcastChannel ────│  Verifies OTP   │              │
│  │ on channel  │                           │  token          │              │
│  └──────┬──────┘                           └────────┬────────┘              │
│         │                                           │                       │
│         │                                           │ Success               │
│         │                                           ▼                       │
│         │                                  ┌─────────────────┐              │
│         │◀─────────────────────────────────│ FOCUS_REQUEST   │              │
│         │     { authConfirmed: true }      │ broadcast       │              │
│         │                                  └────────┬────────┘              │
│         ▼                                           │                       │
│  ┌─────────────┐                                    │                       │
│  │ Respond     │────────────────────────────────────│                       │
│  │ TAB_PRESENT │                                    │                       │
│  │ + focus()   │                                    │                       │
│  └──────┬──────┘                                    │                       │
│         │                                           ▼                       │
│         │                                  ┌─────────────────┐              │
│         ▼                                  │ Try window.     │              │
│  ┌─────────────┐                           │ close()         │              │
│  │ INDEPENDENT │                           └────────┬────────┘              │
│  │ auth verify │                                    │                       │
│  │ getSession()│                                    ▼                       │
│  └──────┬──────┘                           ┌─────────────────┐              │
│         │                                  │ Fallback: show  │              │
│         │ If authenticated                 │ "close this tab"│              │
│         ▼                                  └─────────────────┘              │
│  ┌─────────────┐                                                            │
│  │ Navigate to │                                                            │
│  │ home        │                                                            │
│  └─────────────┘                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Security: Independent Verification

The login page does **not** trust the `authConfirmed` flag from the BroadcastChannel message. It independently verifies authentication state by calling `getSession()`. This prevents attacks where a malicious script could broadcast fake auth confirmations.

### Fallback Behavior

When BroadcastChannel is unavailable (older browsers):
1. Confirm page verifies token
2. Redirects to home in same tab
3. User manually returns to original tab

---

## PWA Caching Strategies

The service worker implements multiple caching strategies based on resource type, with background precaching for full offline support.

### Strategy Matrix

| Resource Type | Strategy | Rationale |
|--------------|----------|-----------|
| Navigation (HTML) | Network-first with 3s timeout | Fresh content preferred, offline fallback |
| Immutable assets (`/_app/immutable/*`) | Cache-first | Hashed filenames guarantee freshness |
| Static assets (JS, CSS, images) | Stale-while-revalidate | Fast loads, background updates |
| Supabase API calls | Passthrough (no cache) | Dynamic data, handled by sync engine |

### Full Offline Navigation

SvelteKit uses code-splitting, loading JavaScript chunks on-demand for each route. Without special handling, navigating to an unvisited page while offline would fail. The solution uses background precaching:

```
┌─────────────────────────────────────────────────────────────────┐
│                  BACKGROUND PRECACHING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Build Time (vite.config.ts):                                    │
│  • Generate /static/asset-manifest.json                         │
│  • Lists all 78+ JS/CSS chunks under /_app/immutable/           │
│  • Includes ALL route nodes (static + dynamic [id] routes)      │
│  • Written to both static/ and build output for consistency     │
│                                                                  │
│  Service Worker Install:                                         │
│  • Cache only minimal shell (/, manifest, icons)                │
│  • Fast install = good Lighthouse score                         │
│                                                                  │
│  After Page Load (+layout.svelte):                               │
│  • Wait for service worker to be ready                          │
│  • Wait 2 seconds for page to stabilize                         │
│  • Cache current page's scripts/styles immediately              │
│  • Send PRECACHE_ALL message to trigger full precache           │
│  • Listen for PRECACHE_COMPLETE notification                    │
│                                                                  │
│  Background Precache (sw.js):                                    │
│  • Fetch asset-manifest.json with cache-busting                 │
│  • Retry up to 3 times if manifest unavailable                  │
│  • Check which chunks are not yet cached                        │
│  • Cache in batches of 5 with 100ms delays                      │
│  • Notify clients when complete                                 │
│  • Doesn't block user interaction                               │
│                                                                  │
│  Result:                                                         │
│  • All pages work offline after background caching completes    │
│  • Dynamic routes (/lists/[id], /routines/[id]) work offline   │
│  • Items created offline are accessible via their detail pages  │
│  • Initial load performance unaffected                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Asset Manifest Structure

```json
{
  "version": "mkord3a4",
  "assets": [
    "/_app/immutable/assets/0.zpRqGnlj.css",
    "/_app/immutable/chunks/B1TmeaDs.js",
    "/_app/immutable/entry/app.JetVtHNI.js",
    "/_app/immutable/nodes/0.DYIarTUp.js",
    "/_app/immutable/nodes/7.DbtjPWAl.js",
    ...
  ]
}
```

Node files (`nodes/X.js`) are the compiled route components. All routes, including dynamic `[id]` routes, are included.

### Cache Status Debugging

The service worker provides cache status inspection:

```javascript
// In browser console (when service worker is active)
navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });

// Listen for response
navigator.serviceWorker.addEventListener('message', e => {
  if (e.data.cached !== undefined) {
    console.log('Cache status:', e.data);
    // { cached: 78, total: 78, ready: true, version: "mkord3a4" }
  }
});
```

### Cache Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      CACHE LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Install Event:                                                  │
│  • Precache app shell (/, manifest, icons)                      │
│  • New version installs in background                           │
│                                                                  │
│  Activate Event:                                                 │
│  • Delete old version caches (stellar-{oldVersion})             │
│  • Claim all clients immediately                                │
│                                                                  │
│  Fetch Event:                                                    │
│  • Route to appropriate caching strategy                        │
│  • Offline fallback returns cached root or error page           │
│                                                                  │
│  Update Detection:                                               │
│  • Client detects `registration.waiting`                        │
│  • Prompts user to refresh                                      │
│  • Sends SKIP_WAITING message                                   │
│  • Service worker takes control, page reloads                   │
│                                                                  │
│  Background Precache (post-load):                                │
│  • App sends PRECACHE_ALL after 2s delay                        │
│  • SW fetches manifest (retries 3x if unavailable)              │
│  • Caches all chunks in batches of 5                            │
│  • Sends PRECACHE_COMPLETE when done                            │
│  • Enables full offline navigation including dynamic routes     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Offline Navigation Error Handling

If a user navigates before background caching completes:

1. **Chunk Loading Failure**: Dynamic import fails with network error
2. **Global Handler**: `unhandledrejection` listener in `+layout.svelte` catches it
3. **User Feedback**: Toast notification explains the page isn't available offline
4. **Fallback**: `+error.svelte` provides a styled error page with retry options

---

## Focus Timer State Machine

### State Diagram

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

### Phase Transitions

| Current Phase | Timer Expires | Next Phase |
|--------------|---------------|------------|
| Focus | After focus duration | Break (or Long Break if cycle complete) |
| Break | After break duration | Focus (next cycle) |
| Long Break | After long break duration | Focus (next cycle) or Idle (if all cycles done) |

### Time Tracking

- **`phase_started_at`**: Timestamp when current phase began
- **`phase_remaining_ms`**: Remaining time, set on pause
- **`elapsed_duration`**: Total focus minutes accumulated across all phases

Time remaining is calculated dynamically: `phase_duration - (now - phase_started_at)`

---

## Egress Optimization

The system implements several optimizations to minimize Supabase egress (data transfer from server to client).

### Incremental Sync with Cursors

Instead of fetching all data on each sync, the engine uses cursor-based incremental sync:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURSOR-BASED SYNC                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stored Cursor: lastSyncCursor_{userId} in localStorage          │
│                                                                  │
│  Pull Query: SELECT * FROM table WHERE updated_at > cursor       │
│                                                                  │
│  Result: Only changed records since last sync                    │
│                                                                  │
│  Update: cursor = MAX(pulled_records.updated_at)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Explicit Column Selection

All queries specify exact columns instead of `SELECT *`:

```typescript
const COLUMNS = {
  goal_lists: 'id,user_id,name,created_at,updated_at,deleted',
  goals: 'id,goal_list_id,name,type,target_value,current_value,...',
  // ... other tables
};

// Query uses explicit columns
.select(COLUMNS.goal_lists)
```

### Smart Polling Intervals

| Component | Interval | Condition |
|-----------|----------|-----------|
| Main app periodic sync | 15 minutes | Tab visible AND online |
| Tab visibility sync | On visible | Only if away >5 minutes |
| Extension service worker | 30 seconds | Only when realtime unhealthy |
| Extension popup | 30 seconds | Only when realtime unhealthy |

### Realtime-First Architecture

The browser extension uses Supabase Realtime as the primary data channel:

```
┌─────────────────────────────────────────────────────────────────┐
│                    REALTIME-FIRST PATTERN                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Subscribe to Realtime channel                                │
│  2. On SUBSCRIBED status: disable polling                        │
│  3. Receive instant updates via WebSocket                        │
│  4. If realtime fails: enable polling fallback (30s)            │
│  5. On reconnect: re-subscribe, disable polling                  │
│                                                                  │
│  Result: Near-zero egress when realtime is healthy              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Queue Coalescing

Multiple rapid updates to the same entity are merged before pushing:

```
User clicks increment 10 times rapidly:
  Queue: 10 separate update operations

Before push, coalesce runs:
  Merged: 1 update operation with final value

Result: 10x reduction in push requests
```

### Egress Monitoring

Debug sync behavior in browser console:

```javascript
// View sync statistics
window.__stellarSyncStats?.()

// Output:
// === STELLAR SYNC STATS ===
// Total cycles: 15
// Last minute: 0 cycles
// Recent cycles: [...]
```

---

## Failure Modes and Recovery

### Network Failures

| Scenario | Detection | Behavior | Recovery |
|----------|-----------|----------|----------|
| Network drops during sync | Fetch throws | Keep queue items, increment retry | Next trigger retries with backoff |
| Supabase unreachable | Request timeout | Sync fails gracefully | Periodic sync retries |
| WebSocket disconnects | Channel inactive | Realtime updates missed | Polling catches changes |

### Concurrent Access

| Scenario | Prevention | Behavior |
|----------|------------|----------|
| Multiple sync attempts | Mutex lock (`syncLock`) | Subsequent attempts return immediately |
| Tab suspension | Visibility change listener | Sync on tab becoming visible |
| Device sleep/wake | Online event + visibility | Full sync cycle on wake |

### Data Integrity

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| IndexedDB quota exceeded | `QuotaExceededError` | Tombstone cleanup (30+ day old deleted records) |
| Corrupted local data | Schema/parse errors | Clear database, full re-sync from server |
| Sync queue overflow | Size > 1000 items | FIFO processing, failed items cleaned after 5 retries |

### Authentication Failures

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Token expired | 401 response | Supabase auto-refreshes; if fails, re-auth prompt |
| Offline session expired | Expiry check | Prompt for password re-entry |
| Invalid credentials | Auth error | Display error, allow retry |

### Recovery Philosophy

```
┌────────────────────────────────────────────────────────────────┐
│                    FAILURE RECOVERY                             │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  For Sync Failures:                                             │
│  • Keep existing local state                                    │
│  • Retry with exponential backoff                               │
│  • User continues working uninterrupted                         │
│                                                                 │
│  For Auth Failures:                                             │
│  • Prompt user action only when necessary                       │
│  • Preserve local data during re-auth                           │
│                                                                 │
│  For Data Failures:                                             │
│  • Attempt automatic cleanup first                              │
│  • Full reset as last resort (preserves server data)           │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Tombstone Cleanup

Soft-deleted records (tombstones) accumulate over time. The cleanup system removes old tombstones from both local IndexedDB and Supabase server.

### Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `TOMBSTONE_MAX_AGE_DAYS` | 30 days | Records deleted longer than this are cleaned up |
| `CLEANUP_INTERVAL_MS` | 24 hours | Server cleanup runs at most once per day |

### Cleanup Triggers

| Trigger | Local Cleanup | Server Cleanup |
|---------|---------------|----------------|
| Sync engine initialization | Yes | Yes |
| Periodic sync (15 min) | Yes | Yes (if 24h elapsed) |
| Manual debug call | Yes | Yes (with force option) |

### Cleanup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOMBSTONE CLEANUP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Calculate cutoff: NOW - 30 days                                 │
│                                                                  │
│  LOCAL CLEANUP (IndexedDB):                                      │
│  For each table:                                                 │
│    DELETE WHERE deleted = true AND updated_at < cutoff           │
│    Log count if > 0                                              │
│                                                                  │
│  SERVER CLEANUP (Supabase):                                      │
│  Skip if last run < 24 hours ago (unless forced)                 │
│  Skip if offline                                                 │
│  For each table:                                                 │
│    DELETE WHERE deleted = true AND updated_at < cutoff           │
│    Check for errors (RLS, permissions)                           │
│    Log count if > 0                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Debug Interface

```javascript
// Check tombstone status across local and server
window.__stellarTombstones()

// Output shows:
// - Cutoff date (30 days ago)
// - Last server cleanup timestamp
// - Per-table tombstone counts
// - How many are eligible for cleanup
// - Oldest tombstone date per table

// Run cleanup
window.__stellarTombstones({ cleanup: true })

// Force server cleanup (bypass 24h limit)
window.__stellarTombstones({ cleanup: true, force: true })
```

### Tables Cleaned

All entity tables are included in tombstone cleanup:
- `goal_lists`, `goals`
- `daily_routine_goals`, `daily_goal_progress`
- `task_categories`, `commitments`
- `daily_tasks`, `long_term_tasks`
- `focus_settings`, `focus_sessions`
- `block_lists`, `blocked_websites`

---

## Debugging & Logging

Stellar uses a multi-layer debugging system: console logs for developers, a visual SyncStatus component for users, and window-exposed debug functions for advanced troubleshooting.

### Console Logging

All console logs use bracketed prefixes for easy filtering. Open browser DevTools and filter by prefix to isolate specific subsystems.

#### [SYNC] - Sync Engine Operations

The primary logging category, covering the entire sync lifecycle:

```
[SYNC] Cleared 5 pending sync operations
[SYNC] Coalesced 49 redundant operations (50 → 1)
[SYNC] Initial hydration: 150 records
[SYNC] Cycle #15: trigger=periodic, pushed=2, pulled=50 records (12.45 KB), 847ms
```

**What each log means:**
- **Cleared**: Queue was cleared (usually on logout or reset)
- **Coalesced**: Multiple rapid changes to the same entity were merged into one operation
- **Initial hydration**: First data load after page refresh
- **Cycle**: Complete sync cycle summary with trigger type (`user`, `periodic`, `visibility`, `reconnect`), items pushed/pulled, data size, and duration

#### [Tombstone] - Soft Delete Cleanup

Logs when tombstone records are cleaned up:

```
[Tombstone] Cleaned 12 old records from local goals
[Tombstone] Cleaned 8 old records from server daily_goal_progress
```

#### [Auth] - Authentication Events

Authentication-related warnings and errors:

```
[Auth] Offline - keeping session despite error
[Auth] Detected corrupted session, attempting to clear
```

#### [Network] - Network State Changes

Network connectivity and reconnection events:

```
[Network] Reconnect callback error: <error details>
```

---

### SyncStatus UI Component

Located in `src/lib/components/SyncStatus.svelte`, this component provides visual feedback about sync state to users.

#### Display States

| State | Icon | Color | Ring Animation | Message |
|-------|------|-------|----------------|---------|
| **OFFLINE** | WiFi with slash | Yellow | None | "Changes will sync when you're back online." |
| **SYNCING** | Spinner (rotating) | Purple | Pulsing purple border | "Syncing your data..." |
| **SYNCED** | Checkmark (animated draw) | Green | Pulsing green border | "All your data is up to date." |
| **PENDING** | Bidirectional arrows | Purple | Badge with count | "X change(s) waiting to sync." |
| **ERROR** | Exclamation circle (shake) | Red | Pulsing red border | Shows specific error message |

#### Morphing Icon System

All icons share the same SVG container with smooth transitions between states:
- Opacity: 0 → 1 (0.35s ease)
- Transform: scale(0.5) rotate(-90°) → scale(1) rotate(0°) (0.45s spring)

#### Tooltip

Hovering the sync indicator shows a floating tooltip with:
- Status header with colored dot indicator
- Description text explaining current state
- Last sync time in relative format ("5m ago", "Just now")
- "Tap to sync now" hint when manual sync is available
- Expandable error details panel when in error state

#### Error Details Panel

When errors exist, users can expand the tooltip to see:
- **Operation type**: Color-coded badge (green=CREATE, blue=UPDATE, red=DELETE)
- **Table name**: Which data type was affected
- **Error message**: Raw technical error in monospace
- **Entity ID**: First 8 characters of the affected record's UUID
- Up to 10 most recent errors, with staggered fade-in animation

---

### Sync Status Store

The sync store (`src/lib/stores/sync.ts`) manages all sync-related state:

```typescript
interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  pendingCount: number;         // Queued changes waiting to sync
  lastError: string | null;     // User-friendly error message
  lastErrorDetails: string | null; // Raw technical error
  syncErrors: SyncError[];      // Detailed error history (max 10)
  lastSyncTime: string | null;  // ISO timestamp of last success
  syncMessage: string | null;   // Custom override message
  isTabVisible: boolean;        // Tab visibility state
}

interface SyncError {
  table: string;      // e.g., 'goals', 'daily_tasks'
  operation: string;  // 'create' | 'update' | 'delete'
  entityId: string;   // UUID of affected entity
  message: string;    // Error message
  timestamp: string;  // When error occurred
}
```

#### Anti-Flicker Logic

To prevent the sync indicator from flashing briefly during fast syncs, the store enforces a **minimum 500ms display time** for the "syncing" state. If a sync completes in under 500ms, the state change is delayed until the minimum is reached.

---

### Error Classification & Display

Errors are classified to determine when to show them to users:

#### Transient Errors (Auto-Retry)

These typically resolve on their own and are **not shown until retry limit (3) is reached**:
- Network issues: "fetch", "network", "failed to fetch"
- Timeouts: "timeout", "timed out"
- Connection: "connection", "offline"
- Rate limiting: "rate", "limit", "too many", "429"
- Server errors: "500", "502", "503", "504", "unavailable"

#### Persistent Errors (Shown Immediately)

These require user action and are **shown immediately**:
- Authentication: "jwt", "token", "unauthorized", "401"
- Validation errors
- Business logic errors

#### Error Message Flow

```
Raw Error (Supabase API)
         ↓
Classification (transient vs persistent)
         ↓
Extraction (extractErrorMessage) → gets core message
         ↓
Parsing (parseErrorMessage) → user-friendly text
         ↓
Storage in sync store:
  • lastError (friendly)
  • lastErrorDetails (raw)
  • syncErrors[] (detailed history)
         ↓
UI Display:
  • Red icon with shake animation
  • Friendly message in tooltip
  • Expandable technical details
```

#### User-Friendly Error Messages

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| Network/fetch failures | "Network connection lost. Changes saved locally." |
| Timeout errors | "Server took too long to respond. Will retry." |
| Auth/JWT errors | "Session expired. Please sign in again." |
| Rate limiting (429) | "Too many requests. Will retry shortly." |
| Server errors (5xx) | "Server is temporarily unavailable." |

---

### Browser Console Debug Functions

All debug functions are exposed on `window` for advanced troubleshooting.

#### Sync Statistics

```javascript
window.__stellarSyncStats()
```

**Output:**
- Total sync cycles since page load
- Cycles in last minute
- Last 10 cycle details (trigger, pushed items, pulled records, egress bytes, duration)

#### Egress Monitoring

```javascript
window.__stellarEgress()
```

**Output:**
```
=== STELLAR EGRESS STATS ===
Session started: 2025-01-21T10:00:00.000Z
Total egress: 125.50 KB (450 records)

--- BY TABLE ---
  daily_goal_progress: 45.20 KB (200 records, 36.0%)
  goals: 32.10 KB (100 records, 25.6%)
  daily_routine_goals: 18.50 KB (50 records, 14.7%)
  ...

--- RECENT SYNC CYCLES ---
  2025-01-21T10:15:00.000Z: 2.30 KB (15 records)
  2025-01-21T10:30:00.000Z: 1.10 KB (8 records)
```

**Tracks:**
- Total bytes and records pulled from Supabase this session
- Per-table breakdown with percentages
- Recent sync cycle egress

#### Tombstone Status

```javascript
// Check status
window.__stellarTombstones()

// Run cleanup
window.__stellarTombstones({ cleanup: true })

// Force server cleanup (bypass 24h limit)
window.__stellarTombstones({ cleanup: true, force: true })
```

**Output:**
- Cutoff date (30 days ago)
- Last server cleanup timestamp
- Per-table tombstone counts (local and server)
- Eligible for cleanup counts
- Oldest tombstone date per table

#### PWA Cache Status

```javascript
// In browser console (when service worker is active)
navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });

navigator.serviceWorker.addEventListener('message', e => {
  if (e.data.cached !== undefined) {
    console.log('Cache status:', e.data);
  }
});
```

**Output:**
```javascript
{
  cached: 78,           // Number of assets cached
  total: 78,            // Total assets in manifest
  ready: true,          // All assets cached?
  version: "mkord3a4",  // Build version
  precacheComplete: true,
  uncached: []          // First 10 uncached assets (if any)
}
```

---

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERACTION                        │
│  (Click button, make changes, pull-to-refresh)              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Sync Engine   │
                    │  (engine.ts)    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │ Console Logging │          │ Sync Status     │
     │ [SYNC] [Auth]   │          │ Store           │
     │ [Tombstone]     │          │ (sync.ts)       │
     └─────────────────┘          └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ SyncStatus      │
                                  │ Component       │
                                  │ (UI Display)    │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ Visual Feedback │
                                  │ • Icon morphs   │
                                  │ • Animations    │
                                  │ • Tooltip       │
                                  │ • Error panel   │
                                  └─────────────────┘
```

---
