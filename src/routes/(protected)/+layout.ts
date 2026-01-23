import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getSession, isSessionExpired } from '$lib/supabase/auth';
import { getValidOfflineSession } from '$lib/auth/offlineSession';
import { getOfflineCredentials } from '$lib/auth/offlineCredentials';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@supabase/supabase-js';
import type { LayoutLoad } from './$types';

export interface ProtectedLayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

export const load: LayoutLoad = async ({ url }): Promise<ProtectedLayoutData> => {
  if (browser) {
    const isOffline = !navigator.onLine;

    // 1. Try Supabase session first
    try {
      const session = await getSession();

      if (session) {
        // Check if session is expired
        if (isSessionExpired(session)) {
          console.log('[Auth] Supabase session expired');

          if (isOffline) {
            // Offline with expired Supabase session → check for existing offline session
            // Don't create one here - let the user explicitly log in via the login page
            console.log('[Auth] Offline with expired session - checking for offline session');
            const offlineSession = await getValidOfflineSession();
            if (offlineSession) {
              const credentials = await getOfflineCredentials();
              return { session: null, authMode: 'offline', offlineProfile: credentials };
            }
          }
          // Online with expired session → will be handled by Supabase refresh or redirect to login
        } else {
          // Valid Supabase session - use it
          return { session, authMode: 'supabase', offlineProfile: null };
        }
      }
    } catch (e) {
      console.warn('[Auth] Session check failed:', e);
      // If offline, continue to offline fallback
      if (!isOffline) {
        // Online but session check failed - redirect to login
        throw redirect(302, '/login');
      }
    }

    // 2. If offline, check for valid offline session (don't create - that's only done via login page)
    if (isOffline) {
      try {
        const offlineSession = await getValidOfflineSession();

        if (offlineSession) {
          const profile = await getOfflineCredentials();
          return { session: null, authMode: 'offline', offlineProfile: profile };
        }
        // No valid offline session - will redirect to login where user can authenticate
      } catch (e) {
        console.warn('[Auth] Offline session check failed:', e);
      }
    }

    // 3. No valid session - redirect to login with return URL
    const returnUrl = url.pathname + url.search;
    const loginUrl = returnUrl && returnUrl !== '/'
      ? `/login?redirect=${encodeURIComponent(returnUrl)}`
      : '/login';
    throw redirect(302, loginUrl);
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
