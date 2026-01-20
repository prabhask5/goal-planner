/**
 * Stellar Focus Extension - Background Service Worker
 * Handles focus session polling and website blocking
 * CRITICAL: Only blocks websites when ONLINE
 */

import browser from 'webextension-polyfill';
import { getSupabase, getSession, getUser } from '../auth/supabase';
import { getValidOfflineSession } from '../auth/offlineSession';
import { blockListsCache, blockedWebsitesCache, focusSessionCacheStore, type FocusSessionCache } from '../lib/storage';
import { getNetworkStatus, checkConnectivity, getSupabaseUrl } from '../lib/network';

// Polling interval for focus session status (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Track current state
let currentFocusSession: FocusSessionCache | null = null;
let isOnline = getNetworkStatus();
let pollAlarmName = 'focus-poll';

// Initialize
browser.runtime.onInstalled.addListener(() => {
  console.log('[Stellar Focus] Extension installed');
  setupAlarm();
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

// Handle alarm
browser.alarms.onAlarm.addListener((alarm: browser.Alarms.Alarm) => {
  if (alarm.name === pollAlarmName) {
    pollFocusSession();
  }
});

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

  if (message.type === 'GET_STATUS') {
    sendResponse({
      isOnline,
      focusActive: currentFocusSession?.status === 'running' && currentFocusSession?.phase === 'focus'
    });
    return;
  }
});

// Web navigation blocking
browser.webNavigation.onBeforeNavigate.addListener(async (details: browser.WebNavigation.OnBeforeNavigateDetailsType) => {
  // Only block main frame navigations
  if (details.frameId !== 0) return;

  // CRITICAL: Don't block if offline
  if (!isOnline) return;

  // Check if we have an active focus session
  if (!currentFocusSession || currentFocusSession.status !== 'running') return;

  // Only block during focus phase, not during breaks
  if (currentFocusSession.phase !== 'focus') return;

  // Check if the URL should be blocked
  const url = new URL(details.url);
  const shouldBlock = await isDomainBlocked(url.hostname);

  if (shouldBlock) {
    // Redirect to blocked page
    const blockedUrl = browser.runtime.getURL(
      `dist/pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(url.hostname)}`
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
}

async function pollFocusSession() {
  // Check connectivity first
  isOnline = await checkConnectivity(getSupabaseUrl());

  if (!isOnline) {
    console.log('[Stellar Focus] Offline - skipping poll');
    return;
  }

  try {
    // Check auth
    const session = await getSession();
    if (!session) {
      // Try offline session
      const offlineSession = await getValidOfflineSession();
      if (!offlineSession) {
        currentFocusSession = null;
        await focusSessionCacheStore.clear();
        return;
      }
    }

    const user = await getUser();
    if (!user) return;

    // Query active focus session
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .single();

    if (data && !error) {
      // Update cached session
      const sessionData: FocusSessionCache = {
        id: 'current',
        user_id: data.user_id,
        phase: data.phase,
        status: data.status,
        phase_started_at: data.phase_started_at,
        focus_duration: data.focus_duration,
        break_duration: data.break_duration,
        cached_at: new Date().toISOString()
      };

      await focusSessionCacheStore.put(sessionData);
      currentFocusSession = sessionData;

      console.log('[Stellar Focus] Focus session active:', data.phase, data.status);
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
    const session = await getSession();
    const offlineSession = await getValidOfflineSession();

    if (!session && !offlineSession) return;

    const user = await getUser();
    if (!user) return;

    const supabase = getSupabase();

    // Fetch block lists
    const { data: lists, error: listsError } = await supabase
      .from('block_lists')
      .select('*')
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
          is_enabled: list.is_enabled,
          order: list.order
        });
      }

      // Fetch blocked websites for enabled lists
      const enabledListIds = lists.map(l => l.id);

      if (enabledListIds.length > 0) {
        const { data: websites, error: websitesError } = await supabase
          .from('blocked_websites')
          .select('*')
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

    // Get all blocked websites from cache
    const blockedWebsites = await blockedWebsitesCache.getAll();

    // Check if hostname matches any blocked domain
    for (const website of blockedWebsites) {
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
