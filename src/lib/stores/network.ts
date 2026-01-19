import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

function createNetworkStore(): Readable<boolean> & { init: () => void } {
  const { subscribe, set } = writable<boolean>(true);

  function init() {
    if (!browser) return;

    // Set initial state
    set(navigator.onLine);

    // Listen for changes
    window.addEventListener('online', () => set(true));
    window.addEventListener('offline', () => set(false));
  }

  return {
    subscribe,
    init
  };
}

export const isOnline = createNetworkStore();
