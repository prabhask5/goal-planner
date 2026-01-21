/**
 * Stellar Focus Extension - Popup Logic
 * Simple, beautiful, read-only view with real-time sync
 */

import browser from 'webextension-polyfill';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
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
}

interface BlockList {
  id: string;
  name: string;
  is_enabled: boolean;
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

// State
let isOnline = navigator.onLine;
let currentUserId: string | null = null;
let focusSubscription: RealtimeChannel | null = null;
let syncStatus: SyncStatus = 'idle';
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Set links
  if (openStellarBtn) openStellarBtn.href = config.appUrl;
  if (signupLink) signupLink.href = config.appUrl + '/auth/signup';

  // Network listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial state
  updateView();

  // Event listeners
  loginForm?.addEventListener('submit', handleLogin);
  logoutBtn?.addEventListener('click', handleLogout);

  // Check auth if online
  if (isOnline) {
    await checkAuth();
  }
}

function handleOnline() {
  isOnline = true;
  updateView();
  checkAuth();
}

function handleOffline() {
  isOnline = false;
  unsubscribeFromRealtime();
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
      await subscribeToRealtime();
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
      await subscribeToRealtime();
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('Login failed. Please try again.');
  }

  setLoginLoading(false);
}

async function handleLogout() {
  try {
    unsubscribeFromRealtime();
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
  if (userName) userName.textContent = firstName || user.email || 'User';
}

// Data loading with sync indicator
async function loadData() {
  try {
    await Promise.all([
      loadFocusStatus(true), // Initial load shows sync indicator
      loadBlockLists()
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
    .select('id, name, is_enabled')
    .eq('user_id', currentUserId)
    .eq('deleted', false)
    .order('order', { ascending: true });

  if (error) throw error;

  renderBlockLists(data || []);
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

  if (lists.length === 0) {
    blockListsContainer.innerHTML = `
      <div class="empty-message">
        <p>No block lists yet</p>
        <a href="${config.appUrl}/focus" target="_blank" rel="noopener" class="create-link">Create one in Stellar</a>
      </div>
    `;
    return;
  }

  blockListsContainer.innerHTML = lists.map(list => `
    <div class="block-list-item">
      <span class="list-status ${list.is_enabled ? 'enabled' : 'disabled'}"></span>
      <span class="block-list-name">${escapeHtml(list.name)}</span>
      <a href="${config.appUrl}/focus/block-lists/${list.id}" target="_blank" rel="noopener" class="edit-link" title="Edit in Stellar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </a>
    </div>
  `).join('');
}

// Real-time subscription - instant updates
async function subscribeToRealtime() {
  if (!currentUserId) return;

  // Clean up existing subscription first
  if (focusSubscription) {
    supabase.removeChannel(focusSubscription);
    focusSubscription = null;
  }

  // Get the current session and set auth token for realtime
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
    console.log('[Stellar Focus] Realtime auth token set');
  }

  // Use unique channel name with user ID for better isolation
  const channelName = `focus-sessions-${currentUserId}-${Date.now()}`;

  console.log('[Stellar Focus] Setting up realtime subscription...');

  focusSubscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'focus_sessions',
        filter: `user_id=eq.${currentUserId}`
      },
      (payload) => {
        console.log('[Stellar Focus] 🚀 INSTANT Real-time update:', payload.eventType);

        // Handle the update directly from payload for instant response
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const session = payload.new as FocusSession & { ended_at?: string };

          // Update the lastSessionJson to prevent duplicate updates from polling
          lastSessionJson = session ? JSON.stringify({ id: session.id, phase: session.phase, status: session.status }) : null;

          // Check if this is an active session (not ended)
          if (!session.ended_at) {
            updateStatusDisplay(session);
          } else {
            // Session ended - show idle
            updateStatusDisplay(null);
          }
        } else if (payload.eventType === 'DELETE') {
          lastSessionJson = null;
          updateStatusDisplay(null);
        }

        // Show sync indicator with enough time to see the animation
        setSyncStatus('syncing');
        setTimeout(() => setSyncStatus('synced'), 800);
      }
    )
    .subscribe((status, err) => {
      console.log('[Stellar Focus] Subscription status:', status, err || '');
      if (status === 'SUBSCRIBED') {
        console.log('[Stellar Focus] ✅ Real-time connected! Instant updates enabled.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Stellar Focus] ❌ Realtime failed:', err);
      }
    });

  // Fast polling as fallback (1 second = near-instant if realtime fails)
  startPolling();
}

function unsubscribeFromRealtime() {
  if (focusSubscription) {
    supabase.removeChannel(focusSubscription);
    focusSubscription = null;
  }
  stopPolling();
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  stopPolling();
  // Poll every 1 second for near-instant updates if realtime fails
  pollInterval = setInterval(async () => {
    if (isOnline && currentUserId) {
      await loadFocusStatus();
    }
  }, 1000); // 1 second - feels instant
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Track previous state for transitions
let prevSyncStatus: SyncStatus = 'idle';

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

  prevSyncStatus = status;
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
