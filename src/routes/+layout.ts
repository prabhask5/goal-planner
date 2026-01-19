import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import { isOnline } from '$lib/stores/network';
import { startSyncEngine, fullSync, performSync } from '$lib/sync/engine';
import { db } from '$lib/db/client';
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

    // If user is logged in, initialize sync
    if (session) {
      const hasInitialized = localStorage.getItem('lastSyncTimestamp');

      // Check if IndexedDB is empty (could have been cleared by browser)
      // If localStorage has timestamp but IndexedDB is empty, we need a full sync
      const localCount = await db.goalLists.count();
      const needsFullSync = !hasInitialized || (hasInitialized && localCount === 0 && navigator.onLine);

      if (needsFullSync) {
        // Clear stale timestamp if IndexedDB was empty
        if (hasInitialized && localCount === 0) {
          localStorage.removeItem('lastSyncTimestamp');
        }
        await fullSync();
      } else {
        // Do an immediate sync to pull any recent changes
        await performSync();
      }

      // Start the sync engine for background sync
      startSyncEngine();
    }

    return { session };
  }
  return { session: null };
};
