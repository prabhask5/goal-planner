/**
 * Adaptive Smart Polling System
 *
 * Replaces fixed 15-minute interval with adaptive polling based on activity state.
 * Uses lightweight "has updates?" check before doing full pulls to minimize egress.
 *
 * Polling Intervals:
 * - Tab Focused + Online + Activity:    5 seconds
 * - Tab Focused + Online + Idle (30s): 15 seconds
 * - Tab Hidden or Not Focused:          No polling (syncs on return)
 * - Offline:                            No polling
 *
 * When a hidden/unfocused tab becomes visible/focused, an immediate sync is triggered.
 * This eliminates wasteful background polling while ensuring fresh data on return.
 */

import { supabase } from '$lib/supabase/client';

// Polling interval constants (in milliseconds)
const POLLING_INTERVALS = {
  ACTIVE: 5000,        // 5 seconds when user is actively interacting
  IDLE: 15000,         // 15 seconds when tab focused but no activity
  NONE: 0,             // No polling when hidden, unfocused, or offline
} as const;

// Activity detection constants
const ACTIVITY_IDLE_THRESHOLD_MS = 30000; // 30 seconds without activity = idle
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];

// State
let lastActivityTime = Date.now();
let isTabVisible = true;
let isTabFocused = true;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let syncCallback: ((quiet: boolean) => Promise<void>) | null = null;
let hasUpdatesCallback: ((cursor: string) => Promise<boolean>) | null = null;
let lastSyncCursor: string = '1970-01-01T00:00:00.000Z';
let skipNextPoll = false;

// Activity tracking
function updateActivity(): void {
  lastActivityTime = Date.now();
}

function isUserIdle(): boolean {
  return Date.now() - lastActivityTime > ACTIVITY_IDLE_THRESHOLD_MS;
}

// Determine current polling interval based on state
function getCurrentPollingInterval(): number {
  // No polling if offline, tab hidden, or tab not focused
  // When tab becomes visible/focused again, immediate sync is triggered
  if (!isOnline || !isTabVisible || !isTabFocused) {
    return POLLING_INTERVALS.NONE;
  }

  // Tab focused and active
  if (!isUserIdle()) {
    return POLLING_INTERVALS.ACTIVE;
  }

  // Tab focused but idle
  return POLLING_INTERVALS.IDLE;
}

// Check if there are updates since last sync (lightweight query)
async function checkForUpdates(cursor: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_updates_since', {
      p_cursor: cursor
    });

    if (error) {
      // If function doesn't exist, fall back to always returning true
      // This allows graceful degradation before migration is applied
      if (error.message?.includes('function') || error.code === '42883') {
        console.log('[Polling] check_updates_since not available, falling back to full sync');
        return true;
      }
      throw error;
    }

    return data === true;
  } catch (e) {
    console.error('[Polling] Failed to check for updates:', e);
    // On error, assume there might be updates
    return true;
  }
}

// Schedule next poll
function scheduleNextPoll(): void {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }

  const interval = getCurrentPollingInterval();
  if (interval === POLLING_INTERVALS.NONE) {
    return;
  }

  pollingTimer = setTimeout(async () => {
    await runPoll();
    scheduleNextPoll();
  }, interval);
}

// Run a poll cycle
async function runPoll(): Promise<void> {
  if (!syncCallback) return;

  // Skip if another tab is syncing
  if (skipNextPoll) {
    skipNextPoll = false;
    return;
  }

  try {
    // First do lightweight check if there are updates
    let hasUpdates = true;
    if (hasUpdatesCallback) {
      hasUpdates = await hasUpdatesCallback(lastSyncCursor);
    } else {
      hasUpdates = await checkForUpdates(lastSyncCursor);
    }

    if (hasUpdates) {
      // Full sync (quiet mode for background syncs)
      await syncCallback(true);
    }
  } catch (e) {
    console.error('[Polling] Poll cycle failed:', e);
  }
}

// Event handlers
function handleVisibilityChange(): void {
  const wasVisible = isTabVisible;
  isTabVisible = !document.hidden;

  if (!wasVisible && isTabVisible) {
    // Tab became visible - trigger immediate sync and resume polling
    updateActivity();
    runPoll().then(() => scheduleNextPoll());
  } else if (wasVisible && !isTabVisible) {
    // Tab became hidden - stop polling (will sync on return)
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
  }
}

function handleFocus(): void {
  const wasFocused = isTabFocused;
  isTabFocused = true;
  updateActivity();

  if (!wasFocused) {
    // Tab gained focus - trigger immediate sync and resume polling
    runPoll().then(() => scheduleNextPoll());
  } else {
    scheduleNextPoll();
  }
}

function handleBlur(): void {
  isTabFocused = false;
  // Stop polling when tab loses focus (will sync when focus returns)
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

function handleOnline(): void {
  isOnline = true;
  scheduleNextPoll();
}

function handleOffline(): void {
  isOnline = false;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

function handleActivity(): void {
  const wasIdle = isUserIdle();
  updateActivity();

  // If transitioning from idle to active, may need to adjust polling
  if (wasIdle) {
    scheduleNextPoll();
  }
}

// Initialize adaptive polling
export function initAdaptivePolling(
  onSync: (quiet: boolean) => Promise<void>,
  options?: {
    getCursor?: () => string;
    checkUpdates?: (cursor: string) => Promise<boolean>;
  }
): void {
  if (typeof window === 'undefined') return;

  syncCallback = onSync;

  if (options?.checkUpdates) {
    hasUpdatesCallback = options.checkUpdates;
  }

  // Set up cursor getter if provided
  if (options?.getCursor) {
    // Periodically update cursor (or get it before each check)
    setInterval(() => {
      lastSyncCursor = options.getCursor!();
    }, 1000);
  }

  // Track visibility
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Track focus
  window.addEventListener('focus', handleFocus);
  window.addEventListener('blur', handleBlur);

  // Track online/offline
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Track user activity (throttled)
  let activityThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  const throttledActivity = () => {
    if (activityThrottleTimer) return;
    activityThrottleTimer = setTimeout(() => {
      activityThrottleTimer = null;
      handleActivity();
    }, 1000);
  };

  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, throttledActivity, { passive: true });
  }

  // Initialize state
  isTabVisible = !document.hidden;
  isTabFocused = document.hasFocus();
  isOnline = navigator.onLine;
  lastActivityTime = Date.now();

  // Start polling
  scheduleNextPoll();
}

// Stop adaptive polling
export function stopAdaptivePolling(): void {
  if (typeof window === 'undefined') return;

  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }

  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('blur', handleBlur);
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);

  // Note: We don't remove activity listeners as they're throttled and
  // won't cause issues. Removing them would require tracking the throttled handler.

  syncCallback = null;
  hasUpdatesCallback = null;
}

// Update the sync cursor (called after successful sync)
export function updateSyncCursor(cursor: string): void {
  lastSyncCursor = cursor;
}

// Skip the next scheduled poll (called when another tab is syncing)
export function skipNextScheduledPoll(): void {
  skipNextPoll = true;
}

// Get current polling state for debugging
function getPollingState(): {
  interval: number;
  isOnline: boolean;
  isTabVisible: boolean;
  isTabFocused: boolean;
  isIdle: boolean;
  lastActivityAgo: number;
} {
  return {
    interval: getCurrentPollingInterval(),
    isOnline,
    isTabVisible,
    isTabFocused,
    isIdle: isUserIdle(),
    lastActivityAgo: Date.now() - lastActivityTime,
  };
}

// Expose for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__stellarPolling = () => {
    const state = getPollingState();
    console.log('=== STELLAR POLLING STATE ===');
    console.log(`Current interval: ${state.interval}ms`);
    console.log(`Online: ${state.isOnline}`);
    console.log(`Tab visible: ${state.isTabVisible}`);
    console.log(`Tab focused: ${state.isTabFocused}`);
    console.log(`User idle: ${state.isIdle}`);
    console.log(`Last activity: ${Math.round(state.lastActivityAgo / 1000)}s ago`);
    return state;
  };
}
