# Stellar Focus

Browser extension that blocks distracting websites during focus sessions managed by the Stellar productivity app. Integrates via Supabase Realtime for instant state synchronization.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Complete Feature Inventory](#complete-feature-inventory)
   - [Website Blocking](#1-website-blocking)
   - [Block List Management](#2-block-list-management)
   - [Focus Session Integration](#3-focus-session-integration)
   - [Real-Time Synchronization](#4-real-time-synchronization)
   - [Polling Backup](#5-polling-backup)
   - [Local Caching](#6-local-caching)
   - [Authentication](#7-authentication)
3. [UI Surfaces](#ui-surfaces)
4. [Blocking Decision Flow](#blocking-decision-flow)
5. [Permissions](#permissions)
6. [Installation](#installation)
7. [Configuration](#configuration)
8. [Project Structure](#project-structure)
9. [Troubleshooting](#troubleshooting)
10. [Privacy](#privacy)
11. [Related Documentation](#related-documentation)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Language** | TypeScript |
| **Build** | esbuild |
| **Backend** | Supabase (PostgreSQL + Realtime) |
| **Local Storage** | IndexedDB |
| **Target Browsers** | Firefox 142+, Chrome 109+ |
| **Manifest** | Version 3 |

---

## Complete Feature Inventory

### 1. Website Blocking

#### 1.1 Domain Blocking
- Blocks navigation to domains in user-configured block lists
- Exact domain matching: `youtube.com` blocks `youtube.com`
- Subdomain matching: `youtube.com` also blocks `www.youtube.com`, `music.youtube.com`
- Protocol-agnostic: Blocks both HTTP and HTTPS
- Main frame only: Does not block embedded iframes

#### 1.2 Blocking Conditions
Blocking is active **only when ALL conditions are true**:
1. User is authenticated (has valid Supabase session)
2. Browser is online (verified via connectivity check)
3. Focus session exists and has status `running`
4. Current phase is `focus` (not `break`)
5. Domain is in an enabled block list
6. Block list is active for current day of week

#### 1.3 Fail-Safe Behavior
- When offline: All navigation allowed (never blocks)
- When unauthenticated: All navigation allowed
- When session paused/stopped: All navigation allowed
- When in break phase: All navigation allowed
- On any error: Defaults to allowing navigation

### 2. Block List Management

#### 2.1 Block Lists
- Named collections of domains to block
- `is_enabled` toggle: Activate/deactivate entire list
- `active_days` scheduling: Array of day numbers (0=Sunday through 6=Saturday)
- When `active_days` is null: List active every day
- Multiple lists can be active simultaneously

#### 2.2 Blocked Websites
- Individual domain entries within lists
- Stored as plain domain strings (e.g., `youtube.com`)
- No protocol, path, or query string stored
- Associated with parent block list via `block_list_id`

#### 2.3 Day-Based Scheduling
- Each block list has optional day-of-week scheduling
- Resolution at navigation time:
  1. Get current day of week (0-6)
  2. For each enabled block list:
     - If `active_days` is null → list is active
     - If current day in `active_days` array → list is active
     - Otherwise → list is inactive for today
  3. Aggregate all active lists' domains for blocking

### 3. Focus Session Integration

#### 3.1 Session States
| State | Blocking | Description |
|-------|----------|-------------|
| `running` + `focus` | YES | Active focus time |
| `running` + `break` | NO | Break period |
| `paused` | NO | Timer frozen |
| `stopped` / none | NO | No active session |

#### 3.2 Session Detection
- Initial load: Query Supabase for active session
- Polling: Every 30 seconds as backup
- Real-time: WebSocket subscription for instant updates
- Caching: Session state stored in IndexedDB

#### 3.3 Phase Transitions
- Focus → Break: Blocking disabled automatically
- Break → Focus: Blocking re-enabled automatically
- Any → Paused: Blocking disabled
- Any → Stopped: Blocking disabled

### 4. Real-Time Synchronization

#### 4.1 WebSocket Subscriptions
Three Supabase Realtime channels:

| Channel | Table | Events | Action |
|---------|-------|--------|--------|
| Focus Sessions | `focus_sessions` | INSERT, UPDATE, DELETE | Refresh session state |
| Block Lists | `block_lists` | INSERT, UPDATE, DELETE | Refresh block lists cache |
| Blocked Websites | `blocked_websites` | INSERT, UPDATE, DELETE | Refresh websites cache |

#### 4.2 Subscription Lifecycle
- Established on: Extension init, coming online, auth refresh
- Cleaned up on: Going offline, logout, extension unload
- Auth token set via `supabase.realtime.setAuth()`

### 5. Polling Backup

#### 5.1 Alarm-Based Polling
- Browser alarms API used for reliable background execution
- Interval: 30 seconds
- Alarm name: `focus-poll`
- Triggers `pollFocusSession()` on each alarm

#### 5.2 Poll Behavior
- Checks connectivity first
- Re-establishes subscriptions if just came online
- Queries `focus_sessions` table for active session
- Updates local cache
- Triggers block list refresh if session just started

### 6. Local Caching

#### 6.1 IndexedDB Storage
Database: `stellar-focus-extension`, Version 1

| Store | Key | Purpose |
|-------|-----|---------|
| `blockLists` | `id` | Cached block list configurations |
| `blockedWebsites` | `id` | Cached domain entries |
| `focusSessionCache` | `id` | Current session state |

#### 6.2 Cache Operations
- Populated on: Successful Supabase queries
- Cleared on: Logout, no results returned
- Used for: Blocking decisions, UI display

### 7. Authentication

#### 7.1 Supabase Auth
- Email/password authentication
- Session persisted in `browser.storage.local`
- Custom storage adapter for extension environment
- Automatic token refresh

#### 7.2 Auth States
| State | Popup UI | Blocking |
|-------|----------|----------|
| Authenticated + Online | Main section | Enabled |
| Authenticated + Offline | Offline placeholder | Disabled |
| Not authenticated | Login form | Disabled |

---

## UI Surfaces

### Popup Interface

#### States

**1. Offline State**
- Displayed when: `navigator.onLine === false`
- Shows: Offline placeholder with wifi-off icon
- Message: "You're offline"
- Actions: None (wait for connectivity)

**2. Login State**
- Displayed when: Online but no valid session
- Shows: Email and password input fields
- Actions: Login button, link to create account

**3. Main State**
- Displayed when: Online and authenticated
- Shows: User info, focus status, block lists, focus time

#### Main Section Components

**Header**
- User avatar (first initial)
- Greeting with first name
- Sync status indicator
- "Open Stellar" button

**Focus Status Card**
- Icon: Changes based on state (checkmark, clock, pause, moon)
- Label: "Ready to Focus" / "Focus Time" / "Break Time" / "Session Paused"
- Description: Contextual message for current state
- Animation: Icon morphs on state change

**Block Lists Section**
- Header: "Block Lists" with count of active lists
- List items: Name, status indicator (enabled/disabled), edit link
- Empty state: "No block lists yet" with create link
- Active indicator: Green dot for enabled, gray for disabled

**Focus Time Today**
- Shows accumulated focus minutes for today
- Format: "45m" or "2h 15m"
- Updates every 30 seconds during active session

**Footer**
- "Open Stellar" link
- Privacy policy link

#### Sync Status Indicator

| Status | Icon | Animation |
|--------|------|-----------|
| `idle` | Hidden | None |
| `syncing` | Spinner | Rotating |
| `synced` | Checkmark | Pulse, then fade |
| `error` | Exclamation | Red pulse |

### Blocked Page

#### Visual Elements

**Background Layers**
1. Void: Deep space gradient base
2. Starfield canvas: 500 twinkling stars
3. Galaxy canvas: Animated spiral galaxy (5,000+ stars)
4. Nebula: Soft color accent overlay
5. Vignette: Edge darkening

**Content**
- Shield icon: Pulsing protective emblem
- Main message: "Stay in the flow."
- Submessage: Random encouraging text (10 options)
- Blocked domain: Shows which site was blocked
- Return button: "Return to Stellar"

**Footer**
- "Stellar Focus" branding

#### Submessages (Randomly Selected)
1. "This moment is for your focus."
2. "You've got this."
3. "Your future self will thank you."
4. "Distractions can wait."
5. "Deep work requires deep focus."
6. "The best work happens here."
7. "Stay present. Stay powerful."
8. "This is where the magic happens."
9. "Trust the process."
10. "You're building something great."

#### Interactions
- **Return button**: Opens or focuses existing Stellar tab
- **Escape key**: Goes back in browser history
- **Enter key**: Opens Stellar app

#### Galaxy Animation
- 2 spiral arms with 2,500 stars each
- 800 core stars in dense center
- 300 scattered field stars
- Continuous slow rotation
- Individual star twinkling
- Color gradient from core (warm) to edges (cool)

---

## Blocking Decision Flow

```
Navigation Event Fired
         │
         ▼
┌────────────────────────┐
│ Is main frame?         │── No ──▶ ALLOW (iframe)
│ (frameId === 0)        │
└───────────┬────────────┘
            │ Yes
            ▼
┌────────────────────────┐
│ Is internal URL?       │── Yes ─▶ ALLOW (extension/about)
│ (moz-extension, etc)   │
└───────────┬────────────┘
            │ No
            ▼
┌────────────────────────┐
│ Is online?             │── No ──▶ ALLOW (fail-safe)
└───────────┬────────────┘
            │ Yes
            ▼
┌────────────────────────┐
│ Has focus session?     │── No ──▶ ALLOW
└───────────┬────────────┘
            │ Yes
            ▼
┌────────────────────────┐
│ Session running?       │── No ──▶ ALLOW (paused/stopped)
│ (status === 'running') │
└───────────┬────────────┘
            │ Yes
            ▼
┌────────────────────────┐
│ Phase is focus?        │── No ──▶ ALLOW (break)
│ (phase === 'focus')    │
└───────────┬────────────┘
            │ Yes
            ▼
┌────────────────────────┐
│ Domain blocked?        │── No ──▶ ALLOW
│ (isDomainBlocked())    │
└───────────┬────────────┘
            │ Yes
            ▼
       🚫 REDIRECT
    to blocked.html
```

### Domain Matching Algorithm

```
isDomainBlocked(hostname):
  1. Normalize hostname (lowercase, strip www.)
  2. Get current day of week (0-6)
  3. Get all cached block lists
  4. Get all cached blocked websites

  5. For each blocked website:
     a. Get parent block list
     b. If list.is_enabled === false → skip
     c. If list.active_days !== null AND currentDay NOT IN active_days → skip
     d. If hostname === website.domain → BLOCKED
     e. If hostname ends with "." + website.domain → BLOCKED (subdomain)

  6. Return NOT BLOCKED
```

---

## Permissions

### Required Permissions

| Permission | Justification |
|------------|---------------|
| `storage` | Store auth tokens and cached data in IndexedDB and browser.storage.local |
| `webNavigation` | Intercept navigation events to implement blocking |
| `alarms` | Schedule reliable background polling every 30 seconds |

### Host Permissions

| Permission | Justification |
|------------|---------------|
| `<all_urls>` | Required to block navigation to any user-configured domain |

### Data Collection (Firefox)

```json
"data_collection_permissions": {
  "required": ["authenticationInfo", "personallyIdentifyingInfo"]
}
```

- **authenticationInfo**: Supabase session tokens for API access
- **personallyIdentifyingInfo**: Email address for account identification

---

## Installation

### Firefox (Add-ons)

1. Visit Firefox Add-ons store (link TBD)
2. Click "Add to Firefox"
3. Grant requested permissions
4. Click extension icon to log in

### Firefox (Development)

```bash
cd stellar-focus
npm install
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `dist-firefox/manifest.json`

### Chrome (Development)

```bash
cd stellar-focus
npm install
npm run build:chrome
```

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist-chrome` directory

---

## Configuration

### Environment Setup

```bash
cp src/config.local.example.ts src/config.local.ts
```

Edit `src/config.local.ts`:

```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const APP_URL = 'https://stellarplanner.vercel.app';
```

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build for all browsers |
| `npm run build:firefox` | Build Firefox only |
| `npm run build:chrome` | Build Chrome only |
| `npm run clean` | Remove dist directories |
| `npm run typecheck` | Type-check TypeScript |

---

## Project Structure

```
stellar-focus/
├── manifests/
│   ├── firefox.json           # Firefox manifest (MV3)
│   └── chrome.json            # Chrome manifest (MV3)
├── icons/
│   ├── icon-48.png            # Toolbar icon
│   └── icon-128.png           # Store listing icon
├── src/
│   ├── config.ts              # Config loader
│   ├── config.local.ts        # Local secrets (gitignored)
│   ├── config.local.example.ts
│   ├── background/
│   │   └── service-worker.ts  # Main background script
│   ├── popup/
│   │   ├── popup.html         # Popup markup
│   │   ├── popup.ts           # Popup logic
│   │   └── popup.css          # Popup styles
│   ├── pages/
│   │   ├── blocked.html       # Blocked page markup
│   │   ├── blocked.ts         # Galaxy/starfield renderer
│   │   └── blocked.css        # Blocked page styles
│   ├── lib/
│   │   ├── storage.ts         # IndexedDB layer
│   │   └── network.ts         # Connectivity detection
│   └── auth/
│       └── supabase.ts        # Supabase client
├── build.js                   # esbuild script
├── package.json
├── tsconfig.json
├── dist-firefox/              # Firefox build output
└── dist-chrome/               # Chrome build output
```

---

## Troubleshooting

### Websites Not Being Blocked

1. **Check focus session**: Ensure session is running in Stellar app
2. **Check phase**: Blocking only active during focus phase, not breaks
3. **Check block list**: Verify list is enabled
4. **Check schedule**: Verify list is active for current day
5. **Check domain**: Verify exact domain is in list
6. **Check online status**: Must be online for blocking to work
7. **Refresh**: Click sync button in popup

### "Offline" Shown When Online

1. Check actual network connectivity
2. Check if Supabase is accessible
3. Extension may need reload

### Session Not Updating

1. Check Supabase project is accessible
2. Verify realtime is enabled in Supabase
3. Check browser console for WebSocket errors
4. Wait for 30-second poll interval

### Login Fails

1. Verify credentials work in main Stellar app
2. Check network connectivity
3. Check browser console for auth errors

---

## Privacy

This extension:
- Stores authentication tokens locally only
- Caches block list data in local IndexedDB
- Does NOT track browsing history
- Does NOT send data to third parties
- Communicates only with your configured Supabase project

Data stored locally:
- Supabase session tokens (in browser.storage.local)
- Block lists and websites (in IndexedDB)
- Current focus session state (in IndexedDB)

All data is cleared on logout.

---

## Related Documentation

- [FRAMEWORKS.md](./FRAMEWORKS.md) - Guide to extension-specific dependencies (webextension-polyfill, esbuild, etc.) for developers new to browser extension development
- [Stellar README](../README.md) - Main application
- [Stellar Architecture](../ARCHITECTURE.md) - Backend architecture
- [Extension Architecture](./ARCHITECTURE.md) - Extension internals
- [Extension Testing](./TESTING.md) - Test plan
