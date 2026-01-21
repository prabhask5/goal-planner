# Stellar

A space-themed productivity Progressive Web App featuring offline-first architecture, real-time synchronization, and comprehensive goal/task/focus management.

**Live:** [stellarplanner.vercel.app](https://stellarplanner.vercel.app)

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Complete Feature Inventory](#complete-feature-inventory)
   - [Task Management System](#1-task-management-system)
   - [Goal Management System](#2-goal-management-system)
   - [Daily Routine System](#3-daily-routine-system)
   - [Focus/Pomodoro System](#4-focuspomodoro-system)
   - [Block List System](#5-block-list-system)
   - [Authentication System](#6-authentication-system)
   - [Synchronization System](#7-synchronization-system)
   - [PWA Features](#8-pwa-features)
3. [UI Surfaces and Pages](#ui-surfaces-and-pages)
4. [Global UI Components](#global-ui-components)
5. [Offline Behavior](#offline-behavior)
6. [Local Development](#local-development)
7. [Companion Extension](#companion-extension)
8. [Related Documentation](#related-documentation)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | SvelteKit 2 with Svelte 5 |
| **Language** | TypeScript (strict mode) |
| **Local Database** | Dexie.js (IndexedDB wrapper) |
| **Remote Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth + custom offline credential caching |
| **Real-time** | Supabase Realtime (WebSocket subscriptions) |
| **Date Handling** | date-fns |
| **Build Tool** | Vite 6 with esbuild |
| **Deployment** | Vercel |

---

## Complete Feature Inventory

### 1. Task Management System

#### 1.1 Daily Tasks
- Create tasks via text input form at bottom of list
- Toggle completion status via checkbox
- Delete individual tasks via trash icon
- Drag-to-reorder using HTML5 drag API
- "Clear completed" button removes all checked items
- Tasks persist until manually deleted (no auto-reset)
- Fractional ordering allows reordering without updating all items

#### 1.2 Long-Term Tasks
- Tasks require a due date (date picker)
- Optional category assignment from user-created categories
- Calendar widget shows tasks grouped by due date
- Toggle completion status
- Delete individual tasks
- Category color displayed as badge on each task
- Filter view by clicking category in sidebar

#### 1.3 Task Categories
- User-created categories with custom names
- Hex color picker for category color
- Reorderable category list
- Delete category (tasks retain but lose category reference)
- Default color: `#6c5ce7` (purple)

#### 1.4 Commitments
- Three fixed sections: **Career**, **Social**, **Personal**
- Add items to any section
- Reorder items within each section via drag-drop
- Delete individual commitments
- Designed for recurring responsibilities (roles, relationships, projects)

### 2. Goal Management System

#### 2.1 Goal Lists
- Named collections that contain goals
- Create with name input
- Rename existing lists
- Delete list (cascading soft-delete of all contained goals)
- Progress bar showing completion percentage
- Stats display: "X of Y completed"

#### 2.2 Goals (Within Lists)
- **Completion type**: Binary yes/no checkbox
- **Incremental type**: Numeric current/target values
  - Set target value on creation
  - Increment/decrement buttons (+/-)
  - Auto-completes when current ≥ target
- Drag-to-reorder within list
- Edit goal name, type, target value
- Delete individual goals
- Progress bar per goal (incremental only)

### 3. Daily Routine System

#### 3.1 Routine Goals
- Name and type (Completion or Incremental)
- Required start date
- Optional end date (null = indefinite)
- Active days selection:
  - Individual day toggles (Sun-Sat)
  - Quick-select: "Every Day", "Weekdays", "Weekends"
  - When all days selected, stored as `null` (every day)
- Target value (for incremental type)
- Drag-to-reorder routines

#### 3.2 Daily Progress
- Separate progress record per routine per calendar day
- Upsert semantics: creates if not exists, updates if exists
- Completion type: toggle completed boolean
- Incremental type:
  - Set current value directly
  - Increment/decrement via +/- buttons
  - Auto-complete when reaching target

#### 3.3 Calendar Navigation
- Month view with day cells
- Color gradient: Red (0%) → Yellow (50%) → Green (100%)
- Navigate months via prev/next arrows
- Today highlighted with distinct styling
- Click any day to view that day's routines
- Only routines active on selected day are shown:
  - Date range check (start_date ≤ date ≤ end_date)
  - Active days check (day of week in active_days array)

### 4. Focus/Pomodoro System

#### 4.1 Timer Settings (Per User)
- Focus duration: 1-240 minutes (default 25)
- Break duration: 1-20 minutes (default 5)
- Long break duration: 1-60 minutes (default 15)
- Cycles before long break: 1-10 (default 4)
- Auto-start breaks: boolean (default false)
- Auto-start focus: boolean (default false)

#### 4.2 Focus Sessions
- **Running state**: Timer counting down
- **Paused state**: Timer frozen, remaining time preserved
- **Stopped state**: Session ended, elapsed time recorded

#### 4.3 Session Phases
- **Focus**: Main work period, blocking active
- **Break**: Short rest between focus periods, blocking disabled
- **Long Break**: Extended rest after completing cycle count
- **Idle**: No active session

#### 4.4 Session Lifecycle
1. **Start**: Creates new session with focus phase
2. **Pause**: Stores remaining milliseconds, stops timer
3. **Resume**: Restarts timer from remaining time
4. **Stop**: Ends session, records elapsed focus minutes
5. **Skip**: Advances to next phase (focus→break, break→focus)
6. **Auto-advance**: When timer hits zero, transitions to next phase

#### 4.5 Time Tracking
- `elapsed_duration`: Total focus minutes completed
- `phase_remaining_ms`: Milliseconds remaining in current phase
- `phase_started_at`: Timestamp when current phase began
- Today's focus time: Sum of `elapsed_duration` for today's sessions

### 5. Block List System

#### 5.1 Block Lists
- Named lists containing domains to block
- `is_enabled`: Toggle to activate/deactivate list
- `active_days`: Array of day numbers (0=Sun, 6=Sat) or null (all days)
- Drag-to-reorder lists
- Delete list (cascades to blocked websites)

#### 5.2 Blocked Websites
- Domain strings (e.g., `youtube.com`, `reddit.com`)
- Add via text input
- Remove individual entries
- Associated with parent block list

#### 5.3 Blocking Rules
- Blocking active only when:
  1. Focus session is running
  2. Current phase is "focus" (not break)
  3. Browser is online
  4. User is authenticated
- Domain matching includes subdomains:
  - Rule `google.com` blocks `mail.google.com`
- Day filtering: Only lists with current day in `active_days` apply
- Multiple lists can be active simultaneously

### 6. Authentication System

#### 6.1 Online Authentication (Supabase Auth)
- **Sign Up**: Email, password, first name, last name
- **Sign In**: Email, password
- Email confirmation required for new accounts
- Session stored in localStorage via Supabase client
- Automatic token refresh

#### 6.2 Email Confirmation Flow
- **Confirmation Email**: Space-themed HTML email with:
  - Stellar logo (circle with checkmark) next to brand name
  - Starfield background with colored stars (purple, pink, green)
  - Nebula cloud effects
  - Gradient CTA button matching app design
- **Confirmation Page**: Verifies email token via Supabase, then:
  - Attempts to focus existing Stellar tab using BroadcastChannel API
  - Signals the original tab to reload (to pick up authenticated state)
  - Auto-closes if possible, otherwise shows "You can close this tab" message
  - Falls back to redirect if no existing tab found

#### 6.3 Offline Authentication
- **Credential Caching**: On successful online login:
  - Email stored
  - Password hashed with PBKDF2-SHA256 (100k iterations)
  - 16-byte random salt
  - First/last name cached
  - Timestamp recorded
- **Offline Unlock**: When offline with cached credentials:
  - User enters password only
  - Password verified against stored hash
  - Offline session created (1-hour expiry)
- **Session Extension**: Activity extends offline session
- **Limitations**: Sign-up requires internet

#### 6.4 Profile Management
- View current user info (name, email)
- Update first/last name
- Change password (requires current password)
- Sign out (clears local data and credentials)

### 7. Synchronization System

#### 7.1 Architecture
- **Local-first**: All reads from IndexedDB, all writes to IndexedDB
- **Sync queue**: Operations queued for server push
- **Bidirectional**: Push local changes, pull remote changes
- **Cursor-based**: Incremental sync using `updated_at` timestamps

#### 7.2 Sync Queue
- Table: `syncQueue` in IndexedDB
- Fields: `table`, `operation`, `entityId`, `payload`, `timestamp`, `retries`
- Operations: `create`, `update`, `delete`
- Queue entry created in same transaction as local write

#### 7.3 Push Process
1. Get pending items from queue (respecting backoff)
2. For each item, send to Supabase (insert/update/soft-delete)
3. On success: remove from queue
4. On failure: increment retry count, update timestamp
5. Max 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s)

#### 7.4 Pull Process
1. Get last sync cursor from localStorage
2. Query all tables for records where `updated_at > cursor`
3. Filter out entities with pending local changes
4. Filter out recently modified entities (5-second grace period)
5. Apply changes to local IndexedDB
6. Update cursor to max `updated_at` from pulled data

#### 7.5 Conflict Resolution
- **Last write wins** as base strategy
- **Pending protection**: Entities in sync queue not overwritten
- **Recently modified protection**: 5-second TTL
- **Duplicate handling**: Ignores "already exists" errors on create
- **Not found handling**: Ignores "not found" errors on delete/update

#### 7.6 Sync Triggers
| Trigger | Debounce | Error Display |
|---------|----------|---------------|
| After local write | 2 seconds | Yes |
| Periodic | 5 minutes | No (quiet) |
| Tab visibility | 1 second | No |
| Network reconnect | Immediate | Yes |
| Manual (pull-to-refresh) | None | Yes |

#### 7.7 Soft Deletes
- All deletes set `deleted: true` instead of hard delete
- Pull ignores deleted records
- Tombstone cleanup: records with `deleted=true` older than 30 days removed

### 8. PWA Features

#### 8.1 Service Worker (`static/sw.js`)
- Auto-generated version on each build (base36 timestamp)
- Precaches app shell on install:
  - `/` (root HTML)
  - `/manifest.json`
  - `/favicon.png`
  - `/icon-192.png`, `/icon-512.png`

#### 8.2 Caching Strategies
| Request Type | Strategy | Details |
|-------------|----------|---------|
| Navigation (HTML) | Network-first | 3s timeout, falls back to cached `/` |
| Immutable assets | Cache-first | `/_app/immutable/*` (hashed filenames) |
| Static assets | Stale-while-revalidate | JS, CSS, images, fonts |
| External requests | Passthrough | Supabase API, CDNs |

#### 8.3 Update Flow
1. New service worker installs in background
2. UpdatePrompt component detects `registration.waiting`
3. User sees "New version available" prompt
4. "Refresh" sends `SKIP_WAITING` message to SW
5. SW calls `skipWaiting()`, takes control
6. Page reloads with new version

#### 8.4 Offline Fallback
- If cached root unavailable, serves inline HTML:
  - "You're Offline" message
  - "Try Again" button (reloads page)
  - Space-themed styling

#### 8.5 PWA Manifest
- `display: standalone`
- `orientation: portrait-primary`
- Theme color: `#1a1a2e`
- Background color: `#0f0f1a`
- Icons: 192x192 and 512x512 (maskable)

---

## UI Surfaces and Pages

### Login Page (`/login`)

**States:**
1. **Online, login mode**: Email + password inputs, "Log In" button
2. **Online, signup mode**: First name, last name, email, password inputs, "Sign Up" button
3. **Offline with cached credentials**: Shows user avatar + name, password input only, "Continue Offline" button
4. **Offline without cached credentials**: Shows "Internet Required" message

**Interactions:**
- Toggle between login/signup modes (online only)
- Submit form triggers auth flow
- Redirect URL preserved in query params

**Visual:**
- Full-screen starfield with nebula effects
- Orbital rings with animated particles
- Shooting star animations
- Glassmorphic card containing form

### Email Confirmation Page (`/confirm`)

**States:**
1. **Verifying**: Spinner shown while validating token with Supabase
2. **Success**: Checkmark icon, "Email Verified!" message
3. **Redirecting**: Clock icon, attempting to return to existing Stellar tab
4. **Can Close**: Checkmark icon, "You can close this tab" message (when auto-close fails)
5. **Error**: X icon, error message with "Go to Login" button

**Interactions:**
- Automatic token verification on page load
- BroadcastChannel communication with existing Stellar tabs
- Auto-close attempt after successful verification

**Visual:**
- Space-themed background with stars and nebula
- Glassmorphic card with status messages
- Phase-specific icons and colors

### Home Page (`/`)

**States:**
1. **Authenticated**: Greeting with time of day + random compliment
2. **Not authenticated**: Redirects to login

**Interactions:**
- Navigation to protected routes

**Visual:**
- Elaborate animated starfield
- Brand logo with gradient
- Time-based greeting (morning/afternoon/evening)

### Tasks Page (`/tasks`)

**Sections:**
1. **Commitments**: Three columns (Career, Social, Personal)
2. **Daily Tasks**: Checklist with add form
3. **Long-Term Tasks**: Calendar widget + task list with categories

**Interactions:**
- Add commitment: Click section header
- Add daily task: Input at bottom of list
- Add long-term task: Form with date picker + category dropdown
- Toggle task: Click checkbox
- Delete task: Click trash icon
- Reorder: Drag and drop
- Clear completed: Button removes checked daily tasks
- Category management: Modal for creating/editing categories

**Visual:**
- Section cards with headers
- Category color badges
- Completion checkmarks
- Drag handles on hover

### Goal Lists Page (`/lists`)

**States:**
1. **Has lists**: Grid of list cards with progress
2. **No lists**: Empty state with "Create your first list" prompt

**Interactions:**
- Create list: Name input form
- View list: Click card navigates to `/lists/[id]`
- Delete list: Trash icon with confirmation

**Visual:**
- Cards with progress bars
- Completion stats (X of Y)
- Color gradient on progress (red→yellow→green)

### Goal List Detail Page (`/lists/[id]`)

**States:**
1. **Has goals**: List of goal items
2. **No goals**: Empty state prompt

**Interactions:**
- Add goal: Form with name, type selector, optional target
- Toggle completion: Click checkbox (completion type)
- Increment/decrement: +/- buttons (incremental type)
- Edit goal: Click edit icon
- Delete goal: Click trash icon
- Reorder: Drag and drop

**Visual:**
- Goal cards with type indicators
- Progress bars for incremental goals
- Current/target display

### Routines Page (`/routines`)

**States:**
1. **Has routines**: List of routine cards
2. **No routines**: Empty state prompt

**Interactions:**
- Create routine: Form with name, type, dates, active days
- Duration presets: "1 Week", "2 Weeks", "1 Month", "3 Months", "No end"
- Day selection: Individual toggles or quick-select buttons
- Edit routine: Click card navigates to `/routines/[id]`
- Delete routine: Trash icon
- Reorder: Drag and drop

**Visual:**
- Cards showing routine details
- Active days displayed as badges (M, T, W, etc.)
- Date range display

### Routine Detail Page (`/routines/[id]`)

**Interactions:**
- Edit name: Text input
- Change type: Dropdown (Completion/Incremental)
- Change target: Number input (incremental only)
- Change dates: Date pickers
- Change active days: Day toggles
- Delete routine: Button

### Calendar Page (`/calendar`)

**States:**
1. **Has progress data**: Days colored by completion
2. **No progress data**: Gray days

**Interactions:**
- Navigate months: Prev/next arrows
- View day: Click day cell navigates to `/calendar/[date]`

**Visual:**
- Month/year header
- Day-of-week row (S M T W T F S)
- Day cells with color gradient
- Today highlighted
- Empty cells for padding

### Calendar Day Page (`/calendar/[date]`)

**States:**
1. **Has active routines**: List of routine progress items
2. **No active routines**: "No routines scheduled" message

**Interactions:**
- Toggle completion: Checkbox (completion type)
- Increment value: +/- buttons (incremental type)
- Set value: Direct input (incremental type)
- Navigate days: Prev/next arrows
- Return: Back to calendar

**Visual:**
- Date header
- Routine cards with progress controls
- Progress bars for incremental routines

### Focus Page (`/focus`)

**Sections:**
1. **Timer display**: Large MM:SS countdown
2. **Phase indicator**: Current phase label
3. **Controls**: Start/Pause/Resume/Stop/Skip buttons
4. **Schedule**: Visual timeline of all phases
5. **Settings**: Modal for timer configuration
6. **Block lists**: List of configured block lists
7. **Focus time**: Today's accumulated focus minutes

**Timer States:**
- **Idle**: Shows "Start" button, schedule visible
- **Running (Focus)**: Purple theme, "Pause" and "Stop" buttons
- **Running (Break)**: Green theme, "Skip" available
- **Paused**: Shows "Resume" and "Stop" buttons

**Interactions:**
- Start: Creates new session, begins focus phase
- Pause: Freezes timer, preserves state
- Resume: Continues from paused state
- Stop: Ends session, records time
- Skip: Advances to next phase
- Settings: Opens modal with duration inputs

**Visual:**
- Circular progress ring (animated)
- Phase-specific colors
- Pulsing effects during focus
- Schedule timeline with completed/current/upcoming phases

### Block List Detail Page (`/focus/block-lists/[id]`)

**Interactions:**
- Edit list name: Text input
- Toggle enabled: Switch
- Set active days: Day toggles
- Add website: Domain input
- Remove website: Click X icon
- Delete list: Button

**Visual:**
- Domain list with remove buttons
- Active days displayed
- Enabled/disabled indicator

### Profile Page (`/profile`)

**Sections:**
1. **User info**: Avatar, name, email display
2. **Edit profile**: First/last name inputs
3. **Change password**: Current + new password inputs
4. **Sign out**: Button

**Interactions:**
- Update profile: Submit name form
- Change password: Submit password form (verifies current)
- Sign out: Clears data, redirects to login

---

## Global UI Components

### SyncStatus Indicator
**States:**
- `idle`: Gray dot, hidden ring
- `syncing`: Purple spinner, rotating ring
- `synced`: Green checkmark, pulsing ring
- `error`: Red exclamation, red pulsing ring
- `offline`: Yellow wifi-off icon
- `pending`: Purple with count badge

**Interactions:**
- Click: Triggers manual sync (if online and not syncing)
- Hover: Shows tooltip with status details

### UpdatePrompt
**States:**
- Hidden: No update available
- Visible: New version detected

**Interactions:**
- "Later": Dismisses prompt
- "Refresh": Activates new service worker, reloads page

### PullToRefresh
**Behavior:**
- Touch/mouse drag down from top triggers refresh
- Shows pulling indicator
- Releases to trigger sync

### Modal
**Behavior:**
- Centered overlay with backdrop
- Click backdrop to close
- Close button in corner
- Keyboard: Escape to close

### DraggableList
**Behavior:**
- Drag handle appears on hover
- Drag preview shows item
- Drop zones highlight
- Fractional ordering on drop

### EmptyState
**Behavior:**
- Shown when list has no items
- Message and optional action button

---

## Offline Behavior

### Reading Data
- All data immediately available from IndexedDB
- No network request required
- Same UI as online

### Writing Data
- All creates/updates/deletes succeed locally
- Queue entry added for sync
- Pending count visible in sync indicator

### Authentication
- If cached credentials exist: password-only login
- If no cached credentials: "Internet Required" message
- Offline session valid for 1 hour
- Extended on user activity

### Sync Recovery
- On reconnect: immediate sync triggered
- Pending items pushed in order
- Remote changes pulled
- UI updates via store subscriptions

---

## Local Development

### Prerequisites
- Node.js 18+
- npm or pnpm
- Supabase project

### Setup
```bash
git clone <repository-url>
cd stellar
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

### Environment Variables
```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

### Database Setup
Execute `supabase-schema.sql` in your Supabase SQL Editor.

### Build
```bash
npm run build
npm run preview
```

---

## Companion Extension

**Stellar Focus** is a browser extension that blocks distracting websites during focus sessions.

- Blocks only during active focus phase
- Uses block lists defined in Stellar
- Respects day-of-week schedules
- Real-time sync via Supabase Realtime
- Beautiful space-themed blocking page

See [stellar-focus/README.md](./stellar-focus/README.md) for documentation.

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture, data flow, sync engine internals
- [TESTING.md](./TESTING.md) - Comprehensive test plan covering all scenarios
