# Stellar Focus Extension - Frameworks & Dependencies Guide

This document explains all the frameworks and third-party tools used specifically in the Stellar Focus browser extension. If you're looking for the main Stellar app documentation, see `/FRAMEWORKS.md` in the root directory.

---

## Table of Contents

1. [Overview: Extension vs Main App](#overview-extension-vs-main-app)
2. [webextension-polyfill](#webextension-polyfill)
3. [Supabase (Browser Extension Context)](#supabase-browser-extension-context)
4. [esbuild](#esbuild)
5. [TypeScript](#typescript)
6. [Extension Architecture](#extension-architecture)
7. [No UI Framework](#no-ui-framework-vanilla-jshtml)

---

## Overview: Extension vs Main App

The browser extension is a **completely separate codebase** from the main Stellar web app. They share:
- The same Supabase backend (authentication, database)
- Similar TypeScript configuration

They differ in:

| Aspect | Main App | Extension |
|--------|----------|-----------|
| **UI Framework** | SvelteKit + Svelte 5 | Vanilla HTML/CSS/JS |
| **Build Tool** | Vite | esbuild |
| **Database Wrapper** | Dexie.js | Raw IndexedDB API |
| **Date Library** | date-fns | Manual calculations |
| **Runtime** | Browser tab | Extension context |

The extension has only **2 runtime dependencies** compared to the main app's larger dependency tree.

---

## webextension-polyfill

**What is it?**

`webextension-polyfill` is a library that provides a unified Promise-based API for browser extensions that works across Chrome and Firefox.

**Why is it needed?**

Browser extensions have different APIs:
- **Chrome** uses `chrome.*` namespace with callbacks
- **Firefox** uses `browser.*` namespace with Promises

This library gives you `browser.*` that works everywhere.

### Key APIs Used in This Extension

#### Storage API

```typescript
import browser from 'webextension-polyfill';

// Save data
await browser.storage.local.set({
  authToken: 'abc123',
  settings: { theme: 'dark' }
});

// Load data
const result = await browser.storage.local.get(['authToken', 'settings']);
console.log(result.authToken);  // 'abc123'

// Remove data
await browser.storage.local.remove('authToken');
```

#### Alarms API (Timers)

```typescript
// Create a repeating alarm (polling every 30 seconds)
browser.alarms.create('focus-poll', {
  periodInMinutes: 0.5  // 30 seconds
});

// Listen for alarm
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focus-poll') {
    checkFocusStatus();
  }
});

// Clear alarm
browser.alarms.clear('focus-poll');
```

#### Web Navigation API (Blocking)

```typescript
// Intercept navigation before it happens
browser.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    // details.url is where user is trying to go
    // details.tabId is which tab

    if (shouldBlock(details.url)) {
      // Redirect to blocked page
      await browser.tabs.update(details.tabId, {
        url: browser.runtime.getURL('pages/blocked.html')
      });
    }
  },
  { url: [{ schemes: ['http', 'https'] }] }  // Only HTTP/HTTPS
);
```

#### Tabs API

```typescript
// Update current tab's URL
await browser.tabs.update(tabId, { url: 'https://stellar.app' });

// Get current tab
const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

// Open new tab
await browser.tabs.create({ url: 'https://stellar.app/focus' });
```

#### Runtime API (Messaging)

```typescript
// Send message from popup to service worker
const response = await browser.runtime.sendMessage({
  type: 'GET_STATUS'
});

// Listen for messages in service worker
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'GET_STATUS') {
    return Promise.resolve({ status: 'active' });
  }
});

// Get URL for extension files
const blockedPageUrl = browser.runtime.getURL('pages/blocked.html');
```

### Where to Look

- Used throughout `/src/background/service-worker.ts`
- Used in `/src/popup/popup.ts`
- Used in `/src/lib/storage.ts`

---

## Supabase (Browser Extension Context)

**What is it?**

Same as the main app - Supabase provides authentication and real-time database. But in extensions, it needs special configuration.

### Extension-Specific Setup

Browser extensions can't use `localStorage` (the default for Supabase). Instead, we use a custom storage adapter:

```typescript
// /src/auth/supabase.ts
import { createClient } from '@supabase/supabase-js';
import browser from 'webextension-polyfill';

// Custom storage adapter for extensions
const storage = {
  getItem: async (key: string) => {
    const result = await browser.storage.local.get(key);
    return result[key] ?? null;
  },
  setItem: async (key: string, value: string) => {
    await browser.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string) => {
    await browser.storage.local.remove(key);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage,  // Use browser.storage instead of localStorage
    autoRefreshToken: true,
    persistSession: true
  }
});
```

### Real-Time Subscriptions

The extension subscribes to three tables for instant updates:

```typescript
// Subscribe to focus session changes
supabase
  .channel('focus-sessions')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'focus_sessions',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      // Handle INSERT, UPDATE, DELETE
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        updateBlockingState(payload.new);
      }
    }
  )
  .subscribe();
```

### Authentication Flow

```typescript
// Check for existing session
const { data: { session } } = await supabase.auth.getSession();

if (session) {
  // User is logged in
  startPolling();
  setupRealtimeSubscriptions();
} else {
  // Show login form in popup
}

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});

// Logout
await supabase.auth.signOut();
```

### Where to Look

- **Client setup:** `/src/auth/supabase.ts`
- **Usage:** `/src/background/service-worker.ts`, `/src/popup/popup.ts`

---

## esbuild

**What is it?**

esbuild is an extremely fast JavaScript bundler. It takes your TypeScript files and outputs browser-ready JavaScript.

**Why esbuild instead of Vite?**

- Much simpler for extension builds
- No dev server needed (extensions reload manually)
- Faster build times
- Direct control over output format

### Build Configuration

```javascript
// /build.js
const esbuild = require('esbuild');

await esbuild.build({
  entryPoints: [
    'src/background/service-worker.ts',
    'src/popup/popup.ts',
    'src/pages/blocked.ts'
  ],
  bundle: true,           // Bundle all imports
  outdir: 'dist-chrome',  // Output directory
  format: 'esm',          // ES modules
  target: ['chrome109'],  // Browser compatibility
  sourcemap: true,        // Enable debugging
  minify: false           // Keep readable for debugging
});
```

### Build Commands

```bash
# Build for both browsers
npm run build

# Build for Firefox only
npm run build:firefox

# Build for Chrome only
npm run build:chrome

# Type check without building
npm run typecheck

# Build + create .zip for distribution
npm run package
```

### Output Structure

```
dist-chrome/
├── background/
│   └── service-worker.js    # Background script
├── popup/
│   ├── popup.js             # Popup logic
│   ├── popup.html           # Popup UI (copied)
│   └── popup.css            # Popup styles (copied)
├── pages/
│   ├── blocked.js           # Blocked page logic
│   ├── blocked.html         # Blocked page UI (copied)
│   └── blocked.css          # Blocked page styles (copied)
└── manifest.json            # Extension manifest (copied)
```

### Where to Look

- **Build script:** `/build.js`
- **Output:** `/dist-chrome/` and `/dist-firefox/`

---

## TypeScript

Same as the main app, but with extension-specific type definitions.

### Extension Types

```typescript
// Types from @types/webextension-polyfill
import type { Alarms, Tabs, WebNavigation } from 'webextension-polyfill';

// Example: typed alarm listener
browser.alarms.onAlarm.addListener((alarm: Alarms.Alarm) => {
  console.log(alarm.name);
});

// Example: typed navigation details
browser.webNavigation.onBeforeNavigate.addListener(
  (details: WebNavigation.OnBeforeNavigateDetailsType) => {
    console.log(details.url, details.tabId);
  }
);
```

### Configuration Differences

The extension uses a simpler TypeScript config since there's no SvelteKit:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "lib": ["ES2022", "DOM"]
  }
}
```

### Where to Look

- **Config:** `/tsconfig.json`
- **Type definitions:** Provided by `@types/webextension-polyfill`

---

## Extension Architecture

Understanding how browser extensions work is crucial for working with this codebase.

### Extension Components

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Extension                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │  Service Worker  │◄──►│  Browser APIs    │           │
│  │  (Background)    │    │  (alarms, tabs,  │           │
│  │                  │    │   navigation)    │           │
│  └────────┬─────────┘    └──────────────────┘           │
│           │                                              │
│           │ Messages                                     │
│           │                                              │
│  ┌────────▼─────────┐    ┌──────────────────┐           │
│  │   Popup UI       │    │  Blocked Page    │           │
│  │  (popup.html)    │    │ (blocked.html)   │           │
│  └──────────────────┘    └──────────────────┘           │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Supabase (HTTPS)
                           ▼
                    ┌──────────────┐
                    │   Supabase   │
                    │  (Database)  │
                    └──────────────┘
```

### Service Worker (Background Script)

**File:** `/src/background/service-worker.ts`

The service worker runs in the background, even when the popup is closed:

- **Polling:** Checks focus status every 30 seconds
- **Web Navigation:** Intercepts page loads to block websites
- **Real-time:** Maintains Supabase WebSocket connection
- **Message Handling:** Responds to requests from popup

```typescript
// Service worker lifecycle
// Runs when extension starts
browser.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

// Runs when extension wakes up
browser.runtime.onStartup.addListener(() => {
  console.log('Browser started');
});
```

### Popup UI

**Files:** `/src/popup/popup.html`, `/src/popup/popup.ts`, `/src/popup/popup.css`

The popup appears when you click the extension icon:

- Shows current focus status
- Login/logout functionality
- Block list information
- Sync status indicator

### Blocked Page

**Files:** `/src/pages/blocked.html`, `/src/pages/blocked.ts`, `/src/pages/blocked.css`

Shown when a user tries to visit a blocked website:

- Canvas animation (spiral galaxy)
- Message about focus mode
- Link back to Stellar app

### Manifest Files

**Chrome:** `/manifest.chrome.json`
**Firefox:** `/manifest.firefox.json`

The manifest declares:
- Extension name, version, description
- Required permissions
- Which scripts to load
- Icon files

```json
{
  "manifest_version": 3,
  "name": "Stellar Focus",
  "permissions": [
    "storage",       // Save auth tokens
    "webNavigation", // Intercept navigation
    "alarms"         // Polling timer
  ],
  "host_permissions": [
    "<all_urls>"     // Block any domain
  ],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

---

## No UI Framework (Vanilla JS/HTML)

**Why no React/Svelte/Vue?**

The extension uses plain HTML, CSS, and TypeScript for several reasons:

1. **Smaller bundle size** - No framework overhead
2. **Faster load times** - Popup needs to open instantly
3. **Simpler debugging** - Direct DOM manipulation
4. **No build complexity** - Just HTML files

### DOM Manipulation Patterns

```typescript
// Get elements
const button = document.getElementById('login-btn') as HTMLButtonElement;
const status = document.querySelector('.status') as HTMLDivElement;

// Update content
status.textContent = 'Focus Active';
status.classList.add('active');

// Add event listeners
button.addEventListener('click', async () => {
  button.disabled = true;
  await handleLogin();
  button.disabled = false;
});

// Show/hide elements
function showElement(el: HTMLElement) {
  el.style.display = 'block';
}

function hideElement(el: HTMLElement) {
  el.style.display = 'none';
}
```

### Canvas Animation (Blocked Page)

The blocked page features a spiral galaxy animation using the Canvas API:

```typescript
const canvas = document.getElementById('galaxy') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Animation loop
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw stars
  stars.forEach(star => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = star.color;
    ctx.fill();
  });

  requestAnimationFrame(animate);
}

animate();
```

---

## Local Storage (IndexedDB)

The extension uses raw IndexedDB (no Dexie wrapper):

```typescript
// /src/lib/storage.ts
const DB_NAME = 'stellar-focus-extension';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      db.createObjectStore('blockLists', { keyPath: 'id' });
      db.createObjectStore('blockedWebsites', { keyPath: 'id' });
      db.createObjectStore('focusSessionCache', { keyPath: 'id' });
    };
  });
}

// Read data
async function getBlockLists(): Promise<BlockList[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blockLists', 'readonly');
    const store = tx.objectStore('blockLists');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Write data
async function saveBlockList(blockList: BlockList): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blockLists', 'readwrite');
    const store = tx.objectStore('blockLists');
    const request = store.put(blockList);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
```

---

## Communication with Main App

The extension doesn't directly communicate with the main Stellar app. Instead, they share the same Supabase backend:

```
┌──────────────┐         ┌──────────────┐
│  Stellar App │         │  Extension   │
│   (Web)      │         │  (Browser)   │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │    PostgreSQL          │
       └────────►┌─────◄────────┘
                 │ Supabase │
                 │ Database │
                 └──────────┘
```

When you start a focus session in the web app:
1. Web app writes to `focus_sessions` table
2. Extension's real-time subscription receives the event
3. Extension starts blocking websites

---

## Quick Reference: File Locations

| What | Where |
|------|-------|
| Service Worker | `/src/background/service-worker.ts` |
| Popup UI | `/src/popup/popup.html`, `.ts`, `.css` |
| Blocked Page | `/src/pages/blocked.html`, `.ts`, `.css` |
| Supabase Client | `/src/auth/supabase.ts` |
| Storage (IndexedDB) | `/src/lib/storage.ts` |
| Network Detection | `/src/lib/network.ts` |
| Build Script | `/build.js` |
| Chrome Manifest | `/manifest.chrome.json` |
| Firefox Manifest | `/manifest.firefox.json` |

---

## Building & Testing

```bash
# Install dependencies
npm install

# Build for both browsers
npm run build

# Build for Chrome only
npm run build:chrome

# Build for Firefox only
npm run build:firefox

# Type check
npm run typecheck

# Create distribution packages
npm run package
```

### Loading in Chrome

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `/dist-chrome` folder

### Loading in Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `/dist-firefox`

---

## Environment Configuration

Create `/src/config.ts` with your Supabase credentials:

```typescript
export const SUPABASE_URL = 'your-supabase-url';
export const SUPABASE_KEY = 'your-anon-key';
```

These should match the main Stellar app's Supabase project.
