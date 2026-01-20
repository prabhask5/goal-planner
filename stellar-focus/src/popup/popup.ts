/**
 * Stellar Focus Extension - Popup Logic
 * Handles authentication, block list display, and focus status
 */

import browser from 'webextension-polyfill';
import { getSupabase, signIn, signOut, getSession, getUser, type Session, type User } from '../auth/supabase';
import { cacheOfflineCredentials, getOfflineCredentials, verifyOfflinePassword, clearOfflineCredentials } from '../auth/offlineCredentials';
import { createOfflineSession, getValidOfflineSession, clearOfflineSession } from '../auth/offlineSession';
import { blockListsCache, focusSessionCacheStore, type CachedBlockList } from '../lib/storage';
import { getNetworkStatus, onNetworkChange } from '../lib/network';
import { config } from '../config';

// Simple user type for offline mode (doesn't need all Supabase User fields)
interface OfflineUser {
  id: string;
  email: string;
  user_metadata?: {
    first_name?: string;
    last_name?: string;
  };
}

// DOM Elements
const authSection = document.getElementById('authSection') as HTMLElement;
const mainSection = document.getElementById('mainSection') as HTMLElement;
const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const emailInput = document.getElementById('emailInput') as HTMLInputElement;
const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
const loginError = document.getElementById('loginError') as HTMLElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const updateBanner = document.getElementById('updateBanner') as HTMLElement;
const updateBtn = document.getElementById('updateBtn') as HTMLButtonElement;
const offlineBanner = document.getElementById('offlineBanner') as HTMLElement;
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement;
const statusLabel = document.getElementById('statusLabel') as HTMLElement;
const statusDesc = document.getElementById('statusDesc') as HTMLElement;
const blockListsContainer = document.getElementById('blockLists') as HTMLElement;
const userAvatar = document.getElementById('userAvatar') as HTMLElement;
const userName = document.getElementById('userName') as HTMLElement;
const openStellarBtn = document.getElementById('openStellarBtn') as HTMLAnchorElement;
const signupLink = document.getElementById('signupLink') as HTMLAnchorElement;

// State
let currentUser: User | OfflineUser | null = null;
let isOnline = getNetworkStatus();

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  // Set app URL from config
  if (openStellarBtn) {
    openStellarBtn.href = config.appUrl;
  }

  // Set signup link URL
  if (signupLink) {
    signupLink.href = config.appUrl + '/auth/signup';
  }

  // Set up network listener
  onNetworkChange((online) => {
    isOnline = online;
    updateOfflineBanner();
    if (online && currentUser) {
      refreshData();
    }
  });

  updateOfflineBanner();
  await checkAuth();

  // Set up event listeners
  loginForm.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  refreshBtn.addEventListener('click', refreshData);
  updateBtn.addEventListener('click', handleUpdate);

  // Check for updates
  checkForUpdates();
}

function updateOfflineBanner() {
  if (!isOnline) {
    offlineBanner.classList.remove('hidden');
    // Hide main content when offline (show graceful placeholder instead)
    if (currentUser) {
      mainSection.classList.add('hidden');
    }
  } else {
    offlineBanner.classList.add('hidden');
    // Show main content when online
    if (currentUser) {
      mainSection.classList.remove('hidden');
    }
  }
}

async function checkAuth() {
  try {
    if (isOnline) {
      // Try Supabase session first
      const session = await getSession();
      if (session) {
        currentUser = (await getUser())!;
        showMainSection();
        return;
      }
    }

    // Try offline session
    const offlineSession = await getValidOfflineSession();
    if (offlineSession) {
      const credentials = await getOfflineCredentials();
      if (credentials) {
        currentUser = {
          id: credentials.userId,
          email: credentials.email,
          user_metadata: {
            first_name: credentials.firstName,
            last_name: credentials.lastName
          }
        } as OfflineUser;
        showMainSection();
        return;
      }
    }

    // Not authenticated
    showAuthSection();
  } catch (error) {
    console.error('Auth check failed:', error);
    showAuthSection();
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
    if (isOnline) {
      // Online login via Supabase
      const { user, session, error } = await signIn(email, password);

      if (error) {
        showLoginError(error.message);
        setLoginLoading(false);
        return;
      }

      if (user && session) {
        // Cache credentials for offline use
        await cacheOfflineCredentials(email, password, user, session);
        currentUser = user;
        showMainSection();
      }
    } else {
      // Offline login
      const credentials = await getOfflineCredentials();

      if (!credentials || credentials.email !== email) {
        showLoginError('No offline credentials for this account');
        setLoginLoading(false);
        return;
      }

      const isValid = await verifyOfflinePassword(password);
      if (!isValid) {
        showLoginError('Invalid password');
        setLoginLoading(false);
        return;
      }

      // Create offline session
      await createOfflineSession(credentials.userId);
      currentUser = {
        id: credentials.userId,
        email: credentials.email,
        user_metadata: {
          first_name: credentials.firstName,
          last_name: credentials.lastName
        }
      } as OfflineUser;
      showMainSection();
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('Login failed. Please try again.');
  }

  setLoginLoading(false);
}

async function handleLogout() {
  try {
    if (isOnline) {
      await signOut();
    }
    await clearOfflineSession();
    // Don't clear credentials - allow offline login later
    currentUser = null;
    showAuthSection();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function showAuthSection() {
  authSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
  emailInput.value = '';
  passwordInput.value = '';
  hideLoginError();
}

function showMainSection() {
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  updateUserInfo();
  loadFocusStatus();
  loadBlockLists();
}

function updateUserInfo() {
  if (currentUser) {
    const firstName = currentUser.user_metadata?.first_name || '';
    const initial = firstName.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase() || '?';
    userAvatar.textContent = initial;
    userName.textContent = firstName || currentUser.email || 'User';
  }
}

async function loadFocusStatus() {
  try {
    // Get cached focus session
    const cached = await focusSessionCacheStore.get('current');

    if (cached && cached.status === 'running') {
      const phase = cached.phase;
      updateStatusDisplay(phase === 'focus' ? 'focus' : 'break', 'running');
    } else if (cached && cached.status === 'paused') {
      updateStatusDisplay('paused', 'paused');
    } else {
      updateStatusDisplay('idle', 'idle');
    }

    // If online, refresh from server
    if (isOnline && currentUser) {
      await refreshFocusStatus();
    }
  } catch (error) {
    console.error('Failed to load focus status:', error);
  }
}

async function refreshFocusStatus() {
  if (!currentUser) return;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', currentUser.id)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && !error) {
      const session = data[0];
      // Cache the session
      await focusSessionCacheStore.put({
        id: 'current',
        user_id: session.user_id,
        phase: session.phase,
        status: session.status,
        phase_started_at: session.phase_started_at,
        focus_duration: session.focus_duration,
        break_duration: session.break_duration,
        cached_at: new Date().toISOString()
      });

      // Update UI based on session state
      if (session.status === 'running') {
        updateStatusDisplay(session.phase === 'focus' ? 'focus' : 'break', 'running');
      } else if (session.status === 'paused') {
        updateStatusDisplay('paused', 'paused');
      }
    } else {
      // No active session
      await focusSessionCacheStore.clear();
      updateStatusDisplay('idle', 'idle');
    }
  } catch (error) {
    console.error('Failed to refresh focus status:', error);
  }
}

async function loadBlockLists() {
  try {
    // Load from cache first
    const cached = await blockListsCache.getAll();
    if (cached.length > 0) {
      renderBlockLists(cached);
    }

    // If online, refresh from server
    if (isOnline && currentUser) {
      await refreshBlockLists();
    } else if (cached.length === 0) {
      blockListsContainer.innerHTML = '<div class="empty-message">No block lists available</div>';
    }
  } catch (error) {
    console.error('Failed to load block lists:', error);
    blockListsContainer.innerHTML = '<div class="empty-message">Failed to load block lists</div>';
  }
}

async function refreshBlockLists() {
  if (!currentUser) return;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('block_lists')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('deleted', false)
      .order('order', { ascending: true });

    if (data && !error) {
      // Clear and update cache
      await blockListsCache.clear();
      for (const list of data) {
        await blockListsCache.put({
          id: list.id,
          user_id: list.user_id,
          name: list.name,
          is_enabled: list.is_enabled,
          order: list.order
        });
      }
      renderBlockLists(data);
    }
  } catch (error) {
    console.error('Failed to refresh block lists:', error);
  }
}

function renderBlockLists(lists: CachedBlockList[]) {
  if (lists.length === 0) {
    blockListsContainer.innerHTML = '<div class="empty-message">No block lists. Create one in Stellar.</div>';
    return;
  }

  blockListsContainer.innerHTML = lists.map(list => `
    <div class="block-list-item" data-id="${list.id}">
      <button class="block-list-toggle ${list.is_enabled ? 'active' : ''}" data-id="${list.id}">
        <span class="knob"></span>
      </button>
      <span class="block-list-name">${escapeHtml(list.name)}</span>
    </div>
  `).join('');

  // Add toggle listeners
  blockListsContainer.querySelectorAll('.block-list-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id!;
      await toggleBlockList(id);
    });
  });
}

async function toggleBlockList(id: string) {
  if (!isOnline) {
    // Can't toggle offline
    return;
  }

  const list = await blockListsCache.get(id);
  if (!list) return;

  const previousState = list.is_enabled;
  const newEnabled = !previousState;

  // Optimistic update: Update UI immediately
  const toggle = blockListsContainer.querySelector(`[data-id="${id}"].block-list-toggle`);
  if (toggle) {
    toggle.classList.toggle('active', newEnabled);
  }

  // Update cache optimistically
  await blockListsCache.put({ ...list, is_enabled: newEnabled });

  try {
    // Update server
    const supabase = getSupabase();
    const { error } = await supabase
      .from('block_lists')
      .update({ is_enabled: newEnabled, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw error;
    }

    // Notify background script on success
    browser.runtime.sendMessage({ type: 'BLOCK_LIST_UPDATED' });
  } catch (error) {
    console.error('Failed to toggle block list:', error);

    // Rollback: Restore previous state in cache
    await blockListsCache.put({ ...list, is_enabled: previousState });

    // Rollback: Restore UI to previous state
    if (toggle) {
      toggle.classList.toggle('active', previousState);
    }
  }
}

async function refreshData() {
  if (!isOnline) return;

  // Add spinning animation to refresh button
  refreshBtn.style.animation = 'spin 1s linear infinite';

  await Promise.all([
    refreshFocusStatus(),
    refreshBlockLists()
  ]);

  // Stop spinning
  setTimeout(() => {
    refreshBtn.style.animation = '';
  }, 500);
}

async function checkForUpdates() {
  try {
    // Check if there's a newer version available
    const response = await browser.runtime.sendMessage({ type: 'CHECK_UPDATE' });
    if (response?.updateAvailable) {
      updateBanner.classList.remove('hidden');
    }
  } catch (error) {
    // Ignore - background script might not support this
  }
}

function handleUpdate() {
  browser.runtime.reload();
}

function setLoginLoading(loading: boolean) {
  const btnText = loginBtn.querySelector('.btn-text') as HTMLElement;
  const btnLoading = loginBtn.querySelector('.btn-loading') as HTMLElement;

  if (loading) {
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    loginBtn.disabled = true;
  } else {
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    loginBtn.disabled = false;
  }
}

function showLoginError(message: string) {
  loginError.textContent = message;
  loginError.classList.remove('hidden');
}

function hideLoginError() {
  loginError.classList.add('hidden');
}

function updateStatusDisplay(phase: 'focus' | 'break' | 'paused' | 'idle', status: 'running' | 'paused' | 'idle') {
  // Remove all state classes
  statusIndicator.classList.remove('focus', 'break', 'paused', 'idle');

  switch (phase) {
    case 'focus':
      statusIndicator.classList.add('focus');
      statusLabel.textContent = 'Focus Time';
      statusDesc.textContent = 'Stay focused — distractions blocked';
      break;
    case 'break':
      statusIndicator.classList.add('break');
      statusLabel.textContent = 'Break Time';
      statusDesc.textContent = 'Take a breather, you earned it';
      break;
    case 'paused':
      statusIndicator.classList.add('paused');
      statusLabel.textContent = 'Session Paused';
      statusDesc.textContent = 'Resume when you\'re ready';
      break;
    case 'idle':
    default:
      statusIndicator.classList.add('idle');
      statusLabel.textContent = 'Ready to Focus';
      statusDesc.textContent = 'Start a session in Stellar';
      break;
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
