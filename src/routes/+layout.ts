import { browser } from '$app/environment';
import { getSession, isSessionExpired } from '$lib/supabase/auth';
import { isOnline } from '$lib/stores/network';
import { startSyncEngine, performSync } from '$lib/sync/engine';
import { getValidOfflineSession, createOfflineSession } from '$lib/auth/offlineSession';
import { getOfflineCredentials } from '$lib/auth/offlineCredentials';
import { callReconnectHandler } from '$lib/auth/reconnectHandler';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@supabase/supabase-js';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Initialize browser-only features once
if (browser) {
  // Initialize network status monitoring
  isOnline.init();

  // Register callback to create offline session when going offline
  isOnline.onDisconnect(async () => {
    console.log('[App] Gone offline - creating offline session if credentials cached');

    try {
      // Get current Supabase session to verify user
      const currentSession = await getSession();
      if (!currentSession?.user?.id) {
        console.log('[App] No active Supabase session - skipping offline session creation');
        return;
      }

      // Check if we have cached credentials that match the current user
      const credentials = await getOfflineCredentials();
      if (!credentials) {
        console.log('[App] No cached credentials - skipping offline session creation');
        return;
      }

      // SECURITY: Only create offline session if credentials match current user (both userId and email)
      if (
        credentials.userId !== currentSession.user.id ||
        credentials.email !== currentSession.user.email
      ) {
        console.warn(
          '[App] Cached credentials do not match current user - skipping offline session creation'
        );
        return;
      }

      // Check if offline session already exists
      const existingSession = await getValidOfflineSession();
      if (!existingSession) {
        await createOfflineSession(credentials.userId);
        console.log('[App] Offline session created from cached credentials');
      }
    } catch (e) {
      console.error('[App] Failed to create offline session:', e);
    }
  });

  // Register callback to sync when coming back online
  isOnline.onReconnect(async () => {
    console.log('[App] Back online - triggering sync and auth check');

    // First, check auth state on reconnect
    await callReconnectHandler();

    // Then sync data
    performSync();
  });
}

export interface LayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

export const load: LayoutLoad = async (): Promise<LayoutData> => {
  if (browser) {
    try {
      const isOffline = !navigator.onLine;

      // EGRESS OPTIMIZATION: Get session once and reuse (avoids duplicate getSession() calls)
      const session = await getSession();
      const hasValidSession = session && !isSessionExpired(session);

      // ONLINE: Always use Supabase authentication
      if (!isOffline) {
        if (hasValidSession) {
          // Valid Supabase session - use it
          await startSyncEngine();
          return { session, authMode: 'supabase', offlineProfile: null };
        }

        // No valid Supabase session while online - user needs to login
        // Do NOT fall back to offline session when online
        return { session: null, authMode: 'none', offlineProfile: null };
      }

      // OFFLINE: Try Supabase session from localStorage first, then offline session
      if (hasValidSession) {
        // Supabase session still valid in localStorage - use it
        // Start sync engine even when offline - it will queue operations and sync when online
        await startSyncEngine();
        return { session, authMode: 'supabase', offlineProfile: null };
      }

      // No valid Supabase session - check for offline session
      const offlineSession = await getValidOfflineSession();

      if (offlineSession) {
        // SECURITY: Verify offline session matches cached credentials
        const profile = await getOfflineCredentials();
        if (profile && profile.userId === offlineSession.userId) {
          // Valid offline session with matching credentials - use it
          // Start sync engine even in offline mode - it will:
          // 1. Queue operations locally
          // 2. Register event listeners for 'online' event
          // 3. Sync automatically when connection is restored
          await startSyncEngine();
          return { session: null, authMode: 'offline', offlineProfile: profile };
        }
        // Mismatch: credentials changed after session created (e.g., different user logged in)
        // Clear the stale offline session
        console.warn(
          '[Layout] Offline session userId does not match credentials - clearing session'
        );
        const { clearOfflineSession } = await import('$lib/auth/offlineSession');
        await clearOfflineSession();
      }

      // No valid session while offline
      return { session: null, authMode: 'none', offlineProfile: null };
    } catch (e) {
      // If session retrieval fails completely (corrupted auth state),
      // clear all Supabase auth data and return no session
      console.error('[Layout] Failed to get session, clearing auth state:', e);
      try {
        // Clear all Supabase auth storage
        const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));
        keys.forEach((k) => localStorage.removeItem(k));
      } catch {
        // Ignore storage errors
      }
      return { session: null, authMode: 'none', offlineProfile: null };
    }
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
