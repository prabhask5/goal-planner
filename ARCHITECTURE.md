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
12. [Failure Modes and Recovery](#failure-modes-and-recovery)

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
**Schema Version:** 7 (with upgrade migrations)

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

### System Tables

| Table | Purpose |
|-------|---------|
| `syncQueue` | Outbox for pending sync operations |
| `offlineCredentials` | Cached login credentials (hashed) |
| `offlineSession` | Offline session token |

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
| Periodic interval | 5 minutes | Catch missed updates |
| Tab becomes visible | 1 second | Sync after background |
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

### Queue Item Structure

```
{
  id: auto-increment
  table: target table name
  operation: 'create' | 'update' | 'delete'
  entityId: UUID of the entity
  payload: full entity data
  timestamp: ISO timestamp (for backoff calculation)
  retries: attempt count
}
```

### Queue Coalescing

Before pushing, the sync engine coalesces pending operations to reduce network requests. Multiple updates to the same entity are merged into a single operation, keeping only the latest payload. This optimization is transparent and maintains data integrity.

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

On successful online login, credentials are securely cached for offline access:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL CACHING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  On Successful Login:                                            │
│                                                                  │
│  Password ──▶ PBKDF2-SHA256 ──▶ Hash                            │
│                    │                                             │
│                    ├── 100,000 iterations                        │
│                    ├── 256-bit key length                        │
│                    └── 16-byte random salt                       │
│                                                                  │
│  Stored in IndexedDB:                                            │
│  {                                                               │
│    email,                                                        │
│    passwordHash,  // derived key, not plaintext                  │
│    salt,          // unique per user                             │
│    userId,                                                       │
│    firstName,                                                    │
│    lastName,                                                     │
│    cachedAt                                                      │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
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
│ from IndexedDB         │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Hash input password    │
│ with stored salt       │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Timing-safe compare    │──No──▶ Reject
│ against stored hash    │
└───────────┬────────────┘
            │ Match
            ▼
┌────────────────────────┐
│ Create offline session │
│ (1 hour expiry)        │
│ Extended on activity   │
└───────────┬────────────┘
            │
            ▼
       Grant Access
```

### Security Properties

- Password never stored in plaintext
- PBKDF2 with 100k iterations resists brute-force attacks
- Unique salt per user prevents rainbow table attacks
- Timing-safe comparison prevents timing attacks
- 1-hour session expiry limits exposure window

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

The service worker implements multiple caching strategies based on resource type.

### Strategy Matrix

| Resource Type | Strategy | Rationale |
|--------------|----------|-----------|
| Navigation (HTML) | Network-first with 3s timeout | Fresh content preferred, offline fallback |
| Immutable assets (`/_app/immutable/*`) | Cache-first | Hashed filenames guarantee freshness |
| Static assets (JS, CSS, images) | Stale-while-revalidate | Fast loads, background updates |
| Supabase API calls | Passthrough (no cache) | Dynamic data, handled by sync engine |

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
└─────────────────────────────────────────────────────────────────┘
```

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
