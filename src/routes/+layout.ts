import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import { isOnline } from '$lib/stores/network';
import { startSyncEngine } from '$lib/sync/engine';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Initialize browser-only features
if (browser) {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });

    // Listen for service worker updates
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        // Optionally notify user of update
        console.log('App updated. Refresh for the latest version.');
      }
    });
  }

  // Initialize network status monitoring
  isOnline.init();
}

export const load: LayoutLoad = async () => {
  if (browser) {
    const session = await getSession();

    // If user is logged in, start sync engine for background writes
    if (session) {
      startSyncEngine();
    }

    return { session };
  }
  return { session: null };
};
