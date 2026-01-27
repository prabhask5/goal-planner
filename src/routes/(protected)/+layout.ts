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

    // ONLINE: Always use Supabase authentication only
    if (!isOffline) {
      try {
        const session = await getSession();

        if (session && !isSessionExpired(session)) {
          // Valid Supabase session - use it
          return { session, authMode: 'supabase', offlineProfile: null };
        }

        // No valid Supabase session while online - redirect to login
        // Do NOT fall back to offline session when online
      } catch (e) {
        console.warn('[Auth] Session check failed:', e);
      }

      // Redirect to login
      const returnUrl = url.pathname + url.search;
      const loginUrl = returnUrl && returnUrl !== '/'
        ? `/login?redirect=${encodeURIComponent(returnUrl)}`
        : '/login';
      throw redirect(302, loginUrl);
    }

    // OFFLINE: Try Supabase session from localStorage first, then offline session
    try {
      const session = await getSession();

      if (session && !isSessionExpired(session)) {
        // Supabase session still valid in localStorage - use it
        return { session, authMode: 'supabase', offlineProfile: null };
      }
    } catch (e) {
      console.warn('[Auth] Session check failed:', e);
    }

    // Check for valid offline session
    try {
      const offlineSession = await getValidOfflineSession();

      if (offlineSession) {
        // SECURITY: Verify offline session matches cached credentials
        const profile = await getOfflineCredentials();
        if (profile && profile.userId === offlineSession.userId) {
          // Valid offline session with matching credentials - use it
          return { session: null, authMode: 'offline', offlineProfile: profile };
        }
        // Mismatch: credentials changed after session created
        console.warn('[Auth] Offline session userId does not match credentials - clearing session');
        const { clearOfflineSession } = await import('$lib/auth/offlineSession');
        await clearOfflineSession();
      }
    } catch (e) {
      console.warn('[Auth] Offline session check failed:', e);
    }

    // No valid session while offline - redirect to login
    const returnUrl = url.pathname + url.search;
    const loginUrl = returnUrl && returnUrl !== '/'
      ? `/login?redirect=${encodeURIComponent(returnUrl)}`
      : '/login';
    throw redirect(302, loginUrl);
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
