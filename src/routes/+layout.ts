import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import { isOnline } from '$lib/stores/network';
import { startSyncEngine, performSync } from '$lib/sync/engine';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Initialize browser-only features once
if (browser) {
  // Initialize network status monitoring
  isOnline.init();

  // Register callback to sync when coming back online
  isOnline.onReconnect(() => {
    console.log('[App] Back online - triggering sync');
    performSync();
  });
}

export const load: LayoutLoad = async () => {
  if (browser) {
    try {
      const session = await getSession();

      // If user is logged in, start sync engine for background writes
      if (session) {
        startSyncEngine();
      }

      return { session };
    } catch (e) {
      // If session retrieval fails completely (corrupted auth state),
      // clear all Supabase auth data and return no session
      console.error('[Layout] Failed to get session, clearing auth state:', e);
      try {
        // Clear all Supabase auth storage
        const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
        keys.forEach(k => localStorage.removeItem(k));
      } catch {
        // Ignore storage errors
      }
      return { session: null };
    }
  }
  return { session: null };
};
