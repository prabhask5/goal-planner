/**
 * Stellar Focus Extension - Popup Logic
 * Simple, beautiful, read-only view with real-time sync
 *
 * EGRESS OPTIMIZATION: Popup no longer creates its own realtime subscriptions.
 * Instead, it receives updates from the service worker via messaging.
 * This reduces realtime connections from 6 (3 SW + 3 popup) to 1 consolidated channel.
 */

import browser from 'webextension-polyfill';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Types
interface FocusSession {
  id: string;
  user_id: string;
  phase: 'focus' | 'break';
  status: 'running' | 'paused' | 'completed';
  phase_started_at: string;
  focus_duration: number;
  break_duration: number;
  elapsed_duration: number;
  started_at: string;
  ended_at: string | null;
}

interface BlockList {
  id: string;
  name: string;
  is_enabled: boolean;
  active_days: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] | null;
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

// Supabase client with realtime config
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: {
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
    },
    autoRefreshToken: true,
    persistSession: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// DOM Elements
const offlinePlaceholder = document.getElementById('offlinePlaceholder') as HTMLElement;
const authSection = document.getElementById('authSection') as HTMLElement;
const mainSection = document.getElementById('mainSection') as HTMLElement;
const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const emailInput = document.getElementById('emailInput') as HTMLInputElement;
const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
const loginError = document.getElementById('loginError') as HTMLElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
const syncIndicator = document.getElementById('syncIndicator') as HTMLElement;
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement;
const statusLabel = document.getElementById('statusLabel') as HTMLElement;
const statusDesc = document.getElementById('statusDesc') as HTMLElement;
const blockListsContainer = document.getElementById('blockLists') as HTMLElement;
const userAvatar = document.getElementById('userAvatar') as HTMLElement;
const userName = document.getElementById('userName') as HTMLElement;
const openStellarBtn = document.getElementById('openStellarBtn') as HTMLAnchorElement;
const signupLink = document.getElementById('signupLink') as HTMLAnchorElement;
const privacyLink = document.getElementById('privacyLink') as HTMLAnchorElement;
const focusTimeValue = document.getElementById('focusTimeValue') as HTMLElement;
const activeBlockListCount = document.getElementById('activeBlockListCount') as HTMLElement;

// State
let isOnline = navigator.onLine;
let currentUserId: string | null = null;
let syncStatus: SyncStatus = 'idle';
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let cachedBlockLists: BlockList[] = [];
let focusTimeInterval: ReturnType<typeof setInterval> | null = null;
let hasActiveRunningSession = false;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Set links (for right-click open in new tab)
  if (openStellarBtn) openStellarBtn.href = config.appUrl;
  if (signupLink) signupLink.href = config.appUrl + '/login';
  if (privacyLink) privacyLink.href = config.appUrl + '/policy';

  // Network listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // EGRESS OPTIMIZATION: Listen for messages from service worker instead of creating our own subscriptions
  setupServiceWorkerMessageListener();

  // Initial state
  updateView();

  // Event listeners
  loginForm?.addEventListener('submit', handleLogin);
  logoutBtn?.addEventListener('click', handleLogout);

  // Password visibility toggle
  const passwordToggle = document.getElementById('passwordToggle');
  passwordToggle?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    passwordToggle.classList.toggle('showing', isPassword);
    passwordToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // Open Stellar button - focus existing tab if available, otherwise open new
  openStellarBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await focusOrOpenApp();
  });

  privacyLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    await navigateToApp(`${config.appUrl}/policy`);
  });

  // Check auth if online
  if (isOnline) {
    await checkAuth();
  }
}

// EGRESS OPTIMIZATION: Listen for updates from service worker instead of creating own subscriptions
function setupServiceWorkerMessageListener() {
  browser.runtime.onMessage.addListener((message: { type: string }) => {
    if (message.type === 'FOCUS_STATUS_CHANGED') {
      console.log('[Stellar Focus] Received focus status update from service worker');
      // Refresh focus status display
      loadFocusStatus();
      loadFocusTimeToday();
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 800);
    }
    if (message.type === 'BLOCK_LISTS_CHANGED') {
      console.log('[Stellar Focus] Received block lists update from service worker');
      // Refresh block lists display
      loadBlockLists();
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 800);
    }
  });
}

function handleOnline() {
  isOnline = true;
  updateView();
  checkAuth();
}

function handleOffline() {
  isOnline = false;
  stopFocusTimeTick();
  hasActiveRunningSession = false;
  updateView();
}

function updateView() {
  // Hide all sections first
  offlinePlaceholder?.classList.add('hidden');
  authSection?.classList.add('hidden');
  mainSection?.classList.add('hidden');

  if (!isOnline) {
    // Offline: only show placeholder
    offlinePlaceholder?.classList.remove('hidden');
  } else if (!currentUserId) {
    // Online but not logged in: show auth
    authSection?.classList.remove('hidden');
  } else {
    // Online and logged in: show main
    mainSection?.classList.remove('hidden');
  }
}

async function checkAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      currentUserId = session.user.id;
      updateUserInfo(session.user);
      updateView();
      await loadData();
      // EGRESS OPTIMIZATION: No longer subscribe to realtime here
      // Service worker handles realtime and notifies popup via messaging
    } else {
      currentUserId = null;
      updateView();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    currentUserId = null;
    updateView();
  }
}

async function handleLogin(e: Event) {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showLoginError('Please enter email and password');
    return;
  }

  setLoginLoading(true);
  hideLoginError();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showLoginError(error.message);
      setLoginLoading(false);
      return;
    }

    if (data.user) {
      currentUserId = data.user.id;
      updateUserInfo(data.user);
      updateView();
      await loadData();
      // EGRESS OPTIMIZATION: No longer subscribe to realtime here
      // Service worker handles realtime and notifies popup via messaging
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('Login failed. Please try again.');
  }

  setLoginLoading(false);
}

async function handleLogout() {
  try {
    stopFocusTimeTick();
    hasActiveRunningSession = false;
    await supabase.auth.signOut();
    currentUserId = null;
    updateView();
    emailInput.value = '';
    passwordInput.value = '';
    hideLoginError();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function updateUserInfo(user: { email?: string; user_metadata?: { first_name?: string } }) {
  const firstName = user.user_metadata?.first_name || '';
  const initial = firstName.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?';
  if (userAvatar) userAvatar.textContent = initial;
  const displayName = firstName || user.email?.split('@')[0] || 'there';
  if (userName) userName.textContent = `Hey, ${displayName}!`;
}

// Data loading with sync indicator
async function loadData() {
  try {
    await Promise.all([
      loadFocusStatus(true), // Initial load shows sync indicator
      loadBlockLists(),
      loadFocusTimeToday()
    ]);
  } catch (error) {
    console.error('Failed to load data:', error);
    setSyncStatus('error');
  }
}

// Track last known session for change detection
let lastSessionJson: string | null = null;

async function loadFocusStatus(isInitialLoad = false) {
  if (!currentUserId) return;

  if (isInitialLoad) {
    setSyncStatus('syncing');
  }

  try {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', currentUserId)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const session = (data && data.length > 0) ? data[0] as FocusSession : null;
    const sessionJson = session ? JSON.stringify({ id: session.id, phase: session.phase, status: session.status }) : null;

    // Check if session actually changed
    const hasChanged = sessionJson !== lastSessionJson;
    lastSessionJson = sessionJson;

    if (hasChanged) {
      console.log('[Stellar Focus] Session changed:', session?.phase, session?.status);

      // Show sync animation for changes (but not initial load which already shows it)
      if (!isInitialLoad) {
        setSyncStatus('syncing');
        setTimeout(() => setSyncStatus('synced'), 800);
      }

      updateStatusDisplay(session);
    }

    if (isInitialLoad) {
      setSyncStatus('synced');
    }
  } catch (error) {
    console.error('[Stellar Focus] Load focus status error:', error);
    if (isInitialLoad) {
      setSyncStatus('error');
    }
  }
}

async function loadBlockLists() {
  if (!currentUserId) return;

  const { data, error } = await supabase
    .from('block_lists')
    .select('id, name, is_enabled, active_days')
    .eq('user_id', currentUserId)
    .eq('deleted', false)
    .order('order', { ascending: true });

  if (error) throw error;

  cachedBlockLists = data || [];
  renderBlockLists(cachedBlockLists);
  updateActiveBlockListCount(cachedBlockLists);
}

// Helper to check if a block list is active today
function isBlockListActiveToday(list: BlockList): boolean {
  if (!list.is_enabled) return false;
  if (list.active_days === null) return true; // null means every day
  const currentDay = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return list.active_days.includes(currentDay);
}

// Update active block list count display
function updateActiveBlockListCount(lists: BlockList[]) {
  const activeCount = lists.filter(isBlockListActiveToday).length;
  if (activeBlockListCount) {
    activeBlockListCount.classList.add('updating');
    setTimeout(() => {
      activeBlockListCount.textContent = `${activeCount} active`;
      activeBlockListCount.classList.remove('updating');
    }, 150);
  }
}

// Load focus time today
async function loadFocusTimeToday(animate = true) {
  if (!currentUserId) return;

  try {
    // Get today's date at midnight in local timezone
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // Query all of today's sessions
    const { data: sessions, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', currentUserId)
      .gte('started_at', todayStr)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let totalMs = 0;
    let foundRunningFocusSession = false;

    for (const session of (sessions || [])) {
      // Skip deleted sessions
      if (session.deleted) continue;

      // Use elapsed_duration (actual time spent in focus)
      totalMs += (session.elapsed_duration || 0) * 60 * 1000;

      // For currently running focus phase, add current elapsed
      if (!session.ended_at && session.phase === 'focus' && session.status === 'running') {
        foundRunningFocusSession = true;
        const currentElapsed = Date.now() - new Date(session.phase_started_at).getTime();
        totalMs += Math.min(currentElapsed, session.focus_duration * 60 * 1000);
      }
    }

    // Track if there's an active running focus session
    const wasRunning = hasActiveRunningSession;
    hasActiveRunningSession = foundRunningFocusSession;

    // Start/stop the tick interval based on session state
    if (foundRunningFocusSession && !wasRunning) {
      startFocusTimeTick();
    } else if (!foundRunningFocusSession && wasRunning) {
      stopFocusTimeTick();
    }

    updateFocusTimeDisplay(totalMs, animate);
  } catch (error) {
    console.error('[Stellar Focus] Load focus time error:', error);
  }
}

// Format duration to readable string
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

// Update focus time display
function updateFocusTimeDisplay(ms: number, animate = true) {
  if (focusTimeValue) {
    if (animate) {
      focusTimeValue.classList.add('updating');
      setTimeout(() => {
        focusTimeValue.textContent = formatDuration(ms);
        focusTimeValue.classList.remove('updating');
      }, 150);
    } else {
      // No animation for periodic ticks
      focusTimeValue.textContent = formatDuration(ms);
    }
  }
}

// Start focus time tick interval (updates every 30 seconds while focus is running)
function startFocusTimeTick() {
  stopFocusTimeTick();
  // Update every 30 seconds for smooth incrementing
  focusTimeInterval = setInterval(() => {
    if (hasActiveRunningSession) {
      loadFocusTimeToday(false); // Don't animate periodic updates
    }
  }, 30000); // 30 seconds
}

// Stop focus time tick interval
function stopFocusTimeTick() {
  if (focusTimeInterval) {
    clearInterval(focusTimeInterval);
    focusTimeInterval = null;
  }
}

// Track previous timer state for transitions
type TimerState = 'idle' | 'focus' | 'break' | 'paused';
let prevTimerState: TimerState = 'idle';

function updateStatusDisplay(session: FocusSession | null) {
  let newState: TimerState = 'idle';
  let label = 'Ready to Focus';
  let desc = 'Start a session in Stellar';

  if (session) {
    if (session.status === 'running') {
      newState = session.phase; // 'focus' or 'break'
      label = session.phase === 'focus' ? 'Focus Time' : 'Break Time';
      desc = session.phase === 'focus'
        ? 'Stay focused — distractions blocked'
        : 'Take a breather, you earned it';
    } else if (session.status === 'paused') {
      newState = 'paused';
      label = 'Session Paused';
      desc = 'Resume when you\'re ready';
    }
  }

  // Only update if state actually changed
  if (newState === prevTimerState) return;

  const isTransitioning = prevTimerState !== 'idle' || newState !== 'idle';

  // Remove old state classes
  statusIndicator?.classList.remove('focus', 'break', 'paused', 'idle', 'transitioning');

  // Remove active class from all icons
  const icons = statusIndicator?.querySelectorAll('.status-icon svg');
  icons?.forEach(icon => icon.classList.remove('active', 'morph-in', 'morph-out'));

  // Add morph-out to previous icon
  if (isTransitioning) {
    const prevIcon = statusIndicator?.querySelector(`.icon-${prevTimerState}`);
    prevIcon?.classList.add('morph-out');
  }

  // Add new state class
  statusIndicator?.classList.add(newState);
  if (isTransitioning) {
    statusIndicator?.classList.add('transitioning');
  }

  // Add active and morph-in to new icon
  const newIcon = statusIndicator?.querySelector(`.icon-${newState}`);
  if (newIcon) {
    newIcon.classList.add('active');
    if (isTransitioning) {
      newIcon.classList.add('morph-in');
    }
  }

  // Update text with fade transition
  if (statusLabel) {
    statusLabel.classList.add('updating');
    setTimeout(() => {
      statusLabel.textContent = label;
      statusLabel.classList.remove('updating');
    }, 150);
  }

  if (statusDesc) {
    statusDesc.classList.add('updating');
    setTimeout(() => {
      statusDesc.textContent = desc;
      statusDesc.classList.remove('updating');
    }, 150);
  }

  // Remove transitioning class after animation
  setTimeout(() => {
    statusIndicator?.classList.remove('transitioning');
    icons?.forEach(icon => icon.classList.remove('morph-out'));
  }, 500);

  prevTimerState = newState;
}

function renderBlockLists(lists: BlockList[]) {
  if (!blockListsContainer) return;

  // Clear existing content
  blockListsContainer.textContent = '';

  if (lists.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-message';

    const p = document.createElement('p');
    p.textContent = 'No block lists yet';
    emptyDiv.appendChild(p);

    const createLink = document.createElement('a');
    createLink.href = `${config.appUrl}/focus`;
    createLink.className = 'create-link';
    createLink.textContent = 'Create one in Stellar';
    createLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await navigateToApp(`${config.appUrl}/focus`);
    });
    emptyDiv.appendChild(createLink);

    blockListsContainer.appendChild(emptyDiv);
    return;
  }

  // Sort: active lists first, then inactive
  const sortedLists = [...lists].sort((a, b) => {
    const aActive = isBlockListActiveToday(a);
    const bActive = isBlockListActiveToday(b);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return 0;
  });

  for (const list of sortedLists) {
    const isActive = isBlockListActiveToday(list);
    const editUrl = `${config.appUrl}/focus/block-lists/${list.id}`;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'block-list-item';

    const statusSpan = document.createElement('span');
    statusSpan.className = `list-status ${isActive ? 'enabled' : 'disabled'}`;
    itemDiv.appendChild(statusSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'block-list-name';
    nameSpan.textContent = list.name;
    itemDiv.appendChild(nameSpan);

    const editLink = document.createElement('a');
    editLink.href = editUrl;
    editLink.className = 'edit-link';
    editLink.title = 'Edit in Stellar';
    editLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await navigateToApp(editUrl);
    });

    // Create SVG using namespace
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7');
    svg.appendChild(path1);

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
    svg.appendChild(path2);

    editLink.appendChild(svg);
    itemDiv.appendChild(editLink);

    blockListsContainer.appendChild(itemDiv);
  }
}

// EGRESS OPTIMIZATION: Realtime subscriptions removed from popup
// Service worker handles all realtime and notifies popup via browser.runtime.sendMessage
// This reduces realtime connections from 6 (3 SW + 3 popup) to 1 consolidated channel
// Popup still receives instant updates via the service worker messaging

// Sync status indicator (matches main app SyncStatus behavior)
function setSyncStatus(status: SyncStatus) {
  const prevStatus = syncStatus;
  syncStatus = status;

  // Remove all state classes from indicator
  syncIndicator?.classList.remove('idle', 'syncing', 'synced', 'error', 'transitioning');
  syncIndicator?.classList.add(status);

  // Remove active class from all icons
  const icons = syncIndicator?.querySelectorAll('.icon');
  icons?.forEach(icon => icon.classList.remove('active', 'morph-in'));

  // Add active class to the correct icon
  const activeIcon = syncIndicator?.querySelector(`.icon-${status}`);
  if (activeIcon) {
    activeIcon.classList.add('active');

    // Add morph-in animation when transitioning from syncing to synced/error
    if (prevStatus === 'syncing' && (status === 'synced' || status === 'error')) {
      activeIcon.classList.add('morph-in');
      syncIndicator?.classList.add('transitioning');

      // Remove transitioning class after animation
      setTimeout(() => {
        syncIndicator?.classList.remove('transitioning');
      }, 600);
    }
  }

  // Auto-hide synced status after 2 seconds
  if (syncTimeout) clearTimeout(syncTimeout);

  if (status === 'synced') {
    syncTimeout = setTimeout(() => {
      syncIndicator?.classList.remove('synced');
      syncIndicator?.classList.add('idle');
      // Remove active from synced icon
      const syncedIcon = syncIndicator?.querySelector('.icon-synced');
      syncedIcon?.classList.remove('active', 'morph-in');
    }, 2000);
  }
}

// UI helpers
function setLoginLoading(loading: boolean) {
  const btnText = loginBtn?.querySelector('.btn-text') as HTMLElement;
  const btnLoading = loginBtn?.querySelector('.btn-loading') as HTMLElement;

  if (loading) {
    btnText?.classList.add('hidden');
    btnLoading?.classList.remove('hidden');
    if (loginBtn) loginBtn.disabled = true;
  } else {
    btnText?.classList.remove('hidden');
    btnLoading?.classList.add('hidden');
    if (loginBtn) loginBtn.disabled = false;
  }
}

function showLoginError(message: string) {
  if (loginError) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
  }
}

function hideLoginError() {
  loginError?.classList.add('hidden');
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Focus an existing app tab if open, otherwise open a new tab to the app home
 */
async function focusOrOpenApp() {
  try {
    const tabs = await browser.tabs.query({
      currentWindow: true,
      url: `${config.appUrl}/*`
    });

    if (tabs.length > 0 && tabs[0].id !== undefined) {
      // Found an existing app tab - just focus it without changing URL
      await browser.tabs.update(tabs[0].id, { active: true });
    } else {
      // No existing tab - create a new one
      await browser.tabs.create({ url: config.appUrl });
    }

    window.close();
  } catch (error) {
    console.error('[Stellar Focus] Navigation error:', error);
    await browser.tabs.create({ url: config.appUrl });
    window.close();
  }
}

/**
 * Navigate to a specific URL in the main app, reusing an existing tab if one is open
 */
async function navigateToApp(url: string) {
  try {
    const tabs = await browser.tabs.query({
      currentWindow: true,
      url: `${config.appUrl}/*`
    });

    if (tabs.length > 0 && tabs[0].id !== undefined) {
      // Found an existing app tab - update it and focus
      await browser.tabs.update(tabs[0].id, { url, active: true });
    } else {
      // No existing tab - create a new one
      await browser.tabs.create({ url });
    }

    window.close();
  } catch (error) {
    console.error('[Stellar Focus] Navigation error:', error);
    await browser.tabs.create({ url });
    window.close();
  }
}
