/**
 * Stellar Focus Extension - Background Service Worker
 * Handles focus session polling and website blocking
 * CRITICAL: Only blocks websites when ONLINE and authenticated
 *
 * EGRESS OPTIMIZATIONS:
 * - Single consolidated realtime channel (instead of 3 separate)
 * - Explicit column selection (no SELECT *)
 * - Uses realtime payload data directly (avoids re-fetching)
 * - Uses session.user instead of separate getUser() calls
 */

import browser from 'webextension-polyfill';
import { type RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getSession } from '../auth/supabase';
import { blockListsCache, blockedWebsitesCache, focusSessionCacheStore, type FocusSessionCache } from '../lib/storage';
import { getNetworkStatus, checkConnectivity, getSupabaseUrl } from '../lib/network';

// Polling interval for focus session status (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Track current state
let currentFocusSession: FocusSessionCache | null = null;
let isOnline = getNetworkStatus();
let pollAlarmName = 'focus-poll';

// Rate limiting to prevent excessive polling (egress optimization)
let lastPollTime = 0;
const MIN_POLL_INTERVAL_MS = 25000; // Minimum 25 seconds between polls
let realtimeHealthy = false; // Track if realtime subscriptions are working

// Single consolidated realtime channel (egress optimization)
let realtimeChannel: RealtimeChannel | null = null;

// Explicit column definitions to reduce egress (no SELECT *)
const COLUMNS = {
  focus_sessions: 'id,user_id,phase,status,phase_started_at,focus_duration,break_duration,ended_at',
  block_lists: 'id,user_id,name,active_days,is_enabled,order,deleted',
  blocked_websites: 'id,block_list_id,domain,deleted'
} as const;

// Initialize
browser.runtime.onInstalled.addListener(() => {
  console.log('[Stellar Focus] Extension installed');
  setupAlarm();
  init();
});

browser.runtime.onStartup.addListener(() => {
  console.log('[Stellar Focus] Browser started');
  setupAlarm();
  init();
});

// Set up polling alarm
function setupAlarm() {
  browser.alarms.create(pollAlarmName, {
    periodInMinutes: POLL_INTERVAL_MS / 60000
  });
}

// Handle alarm with rate limiting
browser.alarms.onAlarm.addListener((alarm: browser.Alarms.Alarm) => {
  if (alarm.name === pollAlarmName) {
    // Skip polling if realtime is working (egress optimization)
    if (realtimeHealthy) {
      console.log('[Stellar Focus] Skipping poll - realtime is healthy');
      return;
    }
    pollFocusSessionThrottled();
  }
});

// Throttled poll to prevent excessive requests
async function pollFocusSessionThrottled() {
  const now = Date.now();
  if (now - lastPollTime < MIN_POLL_INTERVAL_MS) {
    console.log('[Stellar Focus] Skipping poll - too soon (rate limited)');
    return;
  }
  lastPollTime = now;
  await pollFocusSession();
}

// Listen for network changes
if (typeof navigator !== 'undefined') {
  // Note: Service workers don't have window, using navigator
  // We need to use different approach for service workers
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message: { type: string }, _sender: browser.Runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  if (message.type === 'CHECK_UPDATE') {
    // Firefox handles updates automatically through AMO
    // Just return false - no manual update check available
    sendResponse({ updateAvailable: false });
    return;
  }

  if (message.type === 'BLOCK_LIST_UPDATED') {
    // Refresh block lists cache
    refreshBlockLists();
    return;
  }

  if (message.type === 'FOCUS_SESSION_UPDATED') {
    // Refresh focus session state (throttled to prevent spam)
    pollFocusSessionThrottled();
    return;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({
      isOnline,
      focusActive: currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus'
    });
    return;
  }

  // EGRESS OPTIMIZATION: Popup requests full focus status from service worker
  // instead of making its own Supabase queries
  if (message.type === 'GET_FOCUS_STATUS') {
    sendResponse({
      isOnline,
      realtimeHealthy,
      focusSession: currentFocusSession
    });
    return;
  }

  // EGRESS OPTIMIZATION: Popup requests block lists from service worker cache
  if (message.type === 'GET_BLOCK_LISTS') {
    blockListsCache.getAll().then(lists => {
      sendResponse({ lists });
    });
    return true; // Keep channel open for async response
  }
});

// Web navigation blocking
browser.webNavigation.onBeforeNavigate.addListener(async (details: browser.WebNavigation.OnBeforeNavigateDetailsType) => {
  // Only block main frame navigations
  if (details.frameId !== 0) return;

  const url = new URL(details.url);
  const hostname = url.hostname;

  // Skip internal URLs
  if (hostname === '' || url.protocol === 'moz-extension:' || url.protocol === 'about:') return;

  // Debug: Log navigation attempts for common distracting sites
  const debugDomains = ['youtube.com', 'twitter.com', 'facebook.com', 'reddit.com', 'instagram.com'];
  const isDebugDomain = debugDomains.some(d => hostname.includes(d));

  if (isDebugDomain) {
    console.log('[Stellar Focus] Navigation to:', hostname, {
      isOnline,
      hasSession: !!currentFocusSession,
      sessionStatus: currentFocusSession?.status,
      sessionPhase: currentFocusSession?.phase
    });
  }

  // CRITICAL: Don't block if offline
  if (!isOnline) return;

  // Check if we have an active focus session
  if (!currentFocusSession || currentFocusSession.status !== 'running') return;

  // Only block during focus phase, not during breaks
  if (currentFocusSession.phase !== 'focus') return;

  // Check if the URL should be blocked
  const shouldBlock = await isDomainBlocked(hostname);

  if (isDebugDomain) {
    console.log('[Stellar Focus] Should block', hostname, ':', shouldBlock);
  }

  if (shouldBlock) {
    console.log('[Stellar Focus] 🚫 Blocking:', hostname);
    // Redirect to blocked page
    const blockedUrl = browser.runtime.getURL(
      `pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(hostname)}`
    );

    browser.tabs.update(details.tabId, { url: blockedUrl });
  }
});

async function init() {
  // Check online status
  isOnline = await checkConnectivity(getSupabaseUrl());

  // Load cached focus session
  const cached = await focusSessionCacheStore.get('current');
  if (cached) {
    currentFocusSession = cached;
  }

  // Initial poll
  await pollFocusSession();

  // Load block lists
  await refreshBlockLists();

  // Set up real-time subscriptions for instant updates
  await setupRealtimeSubscriptions();
}

// Set up real-time subscriptions for instant updates
// EGRESS OPTIMIZATION: Uses single consolidated channel instead of 3 separate channels
async function setupRealtimeSubscriptions() {
  if (!isOnline) return;

  const session = await getSession();
  if (!session) return;

  // Use session.user instead of separate getUser() call (egress optimization)
  const user = session.user;
  if (!user) return;

  const supabase = getSupabase();

  // Clean up existing subscriptions
  cleanupRealtimeSubscriptions();

  // Set auth token for realtime
  supabase.realtime.setAuth(session.access_token);

  const timestamp = Date.now();

  // EGRESS OPTIMIZATION: Single consolidated channel for all tables
  realtimeChannel = supabase
    .channel(`stellar-ext-${user.id}-${timestamp}`)
    // Focus sessions subscription
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'focus_sessions',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 Real-time: Focus session update', payload.eventType);
        // Use the payload data directly instead of making another query
        // This reduces egress since realtime already includes the data
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const focusSession = payload.new as FocusSessionCache & { ended_at?: string | null };
          if (!focusSession.ended_at) {
            // Active session - update cache directly
            const sessionData: FocusSessionCache = {
              id: 'current',
              user_id: focusSession.user_id,
              phase: focusSession.phase,
              status: focusSession.status,
              phase_started_at: focusSession.phase_started_at,
              focus_duration: focusSession.focus_duration,
              break_duration: focusSession.break_duration,
              cached_at: new Date().toISOString()
            };
            focusSessionCacheStore.put(sessionData).then(() => {
              currentFocusSession = sessionData;
              // Only refresh block lists when session starts (phase becomes focus)
              if (focusSession.status === 'running' && focusSession.phase === 'focus') {
                refreshBlockLists();
              }
            });
          } else {
            // Session ended
            focusSessionCacheStore.clear().then(() => {
              currentFocusSession = null;
            });
          }
        } else if (payload.eventType === 'DELETE') {
          focusSessionCacheStore.clear().then(() => {
            currentFocusSession = null;
          });
        }
        // Notify popup of focus session change
        notifyPopup('FOCUS_STATUS_CHANGED');
      }
    )
    // Block lists subscription
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'block_lists',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 Real-time: Block list update', payload.eventType);
        // EGRESS OPTIMIZATION: Use payload data directly instead of re-fetching
        handleBlockListRealtimeUpdate(payload);
      }
    )
    // Blocked websites subscription
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'blocked_websites'
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 Real-time: Blocked website update', payload.eventType);
        // EGRESS OPTIMIZATION: Use payload data directly instead of re-fetching
        handleBlockedWebsiteRealtimeUpdate(payload);
      }
    )
    .subscribe((status) => {
      console.log('[Stellar Focus] Realtime subscription:', status);
      if (status === 'SUBSCRIBED') {
        realtimeHealthy = true;
        console.log('[Stellar Focus] ✅ Realtime healthy - disabling polling fallback');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeHealthy = false;
        console.log('[Stellar Focus] ❌ Realtime unhealthy - polling enabled');
      }
    });

  console.log('[Stellar Focus] Real-time subscription set up (single consolidated channel)');
}

// EGRESS OPTIMIZATION: Handle block list updates directly from realtime payload
async function handleBlockListRealtimeUpdate(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
  try {
    if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && (payload.new as { deleted?: boolean })?.deleted)) {
      // Remove deleted block list from cache
      const id = (payload.old?.id || payload.new?.id) as string;
      if (id) {
        await blockListsCache.delete(id);
        // Also remove associated websites
        const websites = await blockedWebsitesCache.getAll();
        for (const website of websites) {
          if (website.block_list_id === id) {
            await blockedWebsitesCache.delete(website.id);
          }
        }
      }
    } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const list = payload.new as { id: string; user_id: string; name: string; active_days: (0|1|2|3|4|5|6)[] | null; is_enabled: boolean; order: number; deleted?: boolean };
      if (list && !list.deleted && list.is_enabled) {
        // Add/update enabled block list in cache
        await blockListsCache.put({
          id: list.id,
          user_id: list.user_id,
          name: list.name,
          active_days: list.active_days,
          is_enabled: list.is_enabled,
          order: list.order
        });
      } else if (list && (list.deleted || !list.is_enabled)) {
        // Remove disabled or deleted list from cache
        await blockListsCache.delete(list.id);
      }
    }
    // Notify popup of block list change
    notifyPopup('BLOCK_LISTS_CHANGED');
  } catch (error) {
    console.error('[Stellar Focus] Error handling block list update:', error);
    // Fall back to full refresh only on error
    refreshBlockLists();
  }
}

// EGRESS OPTIMIZATION: Handle blocked website updates directly from realtime payload
async function handleBlockedWebsiteRealtimeUpdate(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
  try {
    if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && (payload.new as { deleted?: boolean })?.deleted)) {
      // Remove deleted website from cache
      const id = (payload.old?.id || payload.new?.id) as string;
      if (id) {
        await blockedWebsitesCache.delete(id);
      }
    } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const website = payload.new as { id: string; block_list_id: string; domain: string; deleted?: boolean };
      if (website && !website.deleted) {
        // Check if the block list is in our cache (i.e., enabled)
        const blockLists = await blockListsCache.getAll();
        const parentList = blockLists.find(l => l.id === website.block_list_id);
        if (parentList) {
          // Add/update website in cache
          await blockedWebsitesCache.put({
            id: website.id,
            block_list_id: website.block_list_id,
            domain: website.domain
          });
        }
      }
    }
  } catch (error) {
    console.error('[Stellar Focus] Error handling blocked website update:', error);
    // Fall back to full refresh only on error
    refreshBlockLists();
  }
}

// Notify popup of state changes via messaging
function notifyPopup(type: string) {
  browser.runtime.sendMessage({ type }).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Clean up real-time subscriptions
function cleanupRealtimeSubscriptions() {
  const supabase = getSupabase();

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function pollFocusSession() {
  // Check connectivity first
  const wasOnline = isOnline;
  isOnline = await checkConnectivity(getSupabaseUrl());

  if (!isOnline) {
    console.log('[Stellar Focus] Offline - skipping poll');
    cleanupRealtimeSubscriptions();
    return;
  }

  // Re-setup subscriptions if we just came back online
  if (!wasOnline && isOnline) {
    console.log('[Stellar Focus] Back online - setting up real-time subscriptions');
    await setupRealtimeSubscriptions();
  }

  try {
    // Check auth - no offline fallback, must be online and logged in
    const session = await getSession();
    if (!session) {
      currentFocusSession = null;
      await focusSessionCacheStore.clear();
      cleanupRealtimeSubscriptions();
      return;
    }

    // EGRESS OPTIMIZATION: Use session.user instead of separate getUser() call
    const user = session.user;
    if (!user) return;

    // Query active focus session with explicit columns (egress optimization)
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('focus_sessions')
      .select(COLUMNS.focus_sessions)
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && !error) {
      const focusSession = data[0];

      // Check if focus session just started (wasn't running before, now it is)
      const wasRunning = currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus';
      const isNowRunning = focusSession.status === 'running' && focusSession.phase === 'focus';

      // Update cached session
      const sessionData: FocusSessionCache = {
        id: 'current',
        user_id: focusSession.user_id,
        phase: focusSession.phase,
        status: focusSession.status,
        phase_started_at: focusSession.phase_started_at,
        focus_duration: focusSession.focus_duration,
        break_duration: focusSession.break_duration,
        cached_at: new Date().toISOString()
      };

      await focusSessionCacheStore.put(sessionData);
      currentFocusSession = sessionData;

      // Refresh block lists when focus session starts to ensure we have latest data
      if (!wasRunning && isNowRunning) {
        console.log('[Stellar Focus] Focus session started - refreshing block lists');
        await refreshBlockLists();
      }

      console.log('[Stellar Focus] Focus session active:', focusSession.phase, focusSession.status);
    } else {
      // No active session
      await focusSessionCacheStore.clear();
      currentFocusSession = null;

      console.log('[Stellar Focus] No active focus session');
    }
  } catch (error) {
    console.error('[Stellar Focus] Poll error:', error);
  }
}

async function refreshBlockLists() {
  if (!isOnline) return;

  try {
    // Must be online and authenticated
    const session = await getSession();
    if (!session) return;

    // EGRESS OPTIMIZATION: Use session.user instead of separate getUser() call
    const user = session.user;
    if (!user) return;

    const supabase = getSupabase();

    // Fetch block lists with explicit columns (egress optimization)
    const { data: lists, error: listsError } = await supabase
      .from('block_lists')
      .select(COLUMNS.block_lists)
      .eq('user_id', user.id)
      .eq('deleted', false)
      .eq('is_enabled', true);

    if (lists && !listsError) {
      // Clear and update cache
      await blockListsCache.clear();
      for (const list of lists) {
        await blockListsCache.put({
          id: list.id,
          user_id: list.user_id,
          name: list.name,
          active_days: list.active_days,
          is_enabled: list.is_enabled,
          order: list.order
        });
      }

      // Fetch blocked websites for enabled lists with explicit columns
      const enabledListIds = lists.map(l => l.id);

      if (enabledListIds.length > 0) {
        const { data: websites, error: websitesError } = await supabase
          .from('blocked_websites')
          .select(COLUMNS.blocked_websites)
          .in('block_list_id', enabledListIds)
          .eq('deleted', false);

        if (websites && !websitesError) {
          await blockedWebsitesCache.clear();
          for (const website of websites) {
            await blockedWebsitesCache.put({
              id: website.id,
              block_list_id: website.block_list_id,
              domain: website.domain
            });
          }
        }
      }

      console.log('[Stellar Focus] Block lists refreshed:', lists.length, 'lists');
    }
  } catch (error) {
    console.error('[Stellar Focus] Block lists refresh error:', error);
  }
}

async function isDomainBlocked(hostname: string): Promise<boolean> {
  try {
    // Normalize hostname (remove www prefix, lowercase)
    const normalizedHostname = hostname.toLowerCase().replace(/^www\./, '');

    // Get current day of week (0=Sunday, 6=Saturday)
    const currentDay = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // Get all block lists and websites from cache
    const blockLists = await blockListsCache.getAll();
    const blockedWebsites = await blockedWebsitesCache.getAll();

    // Check if hostname matches any blocked domain from an active list
    for (const website of blockedWebsites) {
      // Find the block list for this website
      const list = blockLists.find(l => l.id === website.block_list_id);
      if (!list) continue;

      // Check if list is active today
      // active_days null means all days, otherwise check if current day is in the array
      if (list.active_days !== null && !list.active_days.includes(currentDay)) {
        continue; // Skip this website - list not active today
      }

      const blockedDomain = website.domain.toLowerCase().replace(/^www\./, '');

      // Exact match
      if (normalizedHostname === blockedDomain) {
        return true;
      }

      // Subdomain match (e.g., mail.google.com matches google.com)
      if (normalizedHostname.endsWith('.' + blockedDomain)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[Stellar Focus] Domain check error:', error);
    return false;
  }
}

// Initialize on load
init();
