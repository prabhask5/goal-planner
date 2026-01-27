import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

type NetworkCallback = () => void;

function createNetworkStore(): Readable<boolean> & {
  init: () => void;
  onReconnect: (callback: NetworkCallback) => () => void;
  onDisconnect: (callback: NetworkCallback) => () => void;
} {
  const { subscribe, set } = writable<boolean>(true);
  const reconnectCallbacks: Set<NetworkCallback> = new Set();
  const disconnectCallbacks: Set<NetworkCallback> = new Set();
  let wasOffline = false;
  let currentValue = true; // Track current value to prevent redundant updates

  function setIfChanged(value: boolean) {
    if (value !== currentValue) {
      currentValue = value;
      set(value);
    }
  }

  function init() {
    if (!browser) return;

    // Set initial state
    const initiallyOnline = navigator.onLine;
    currentValue = initiallyOnline;
    set(initiallyOnline);
    wasOffline = !initiallyOnline;

    // Listen for going offline
    window.addEventListener('offline', () => {
      const wasOnline = currentValue;
      wasOffline = true;
      setIfChanged(false);

      // If we were online, trigger disconnect callbacks
      if (wasOnline) {
        disconnectCallbacks.forEach((callback) => {
          try {
            callback();
          } catch (e) {
            console.error('[Network] Disconnect callback error:', e);
          }
        });
      }
    });

    // Listen for coming back online
    window.addEventListener('online', () => {
      setIfChanged(true);

      // If we were offline, trigger reconnect callbacks
      if (wasOffline) {
        wasOffline = false;
        // Small delay to ensure network is stable
        setTimeout(() => {
          reconnectCallbacks.forEach((callback) => {
            try {
              callback();
            } catch (e) {
              console.error('[Network] Reconnect callback error:', e);
            }
          });
        }, 500);
      }
    });

    // Also listen for visibility changes (iOS specific - PWA may not fire online/offline)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const nowOnline = navigator.onLine;
        setIfChanged(nowOnline); // Only update if actually changed

        // If we're coming back online after being hidden
        if (nowOnline && wasOffline) {
          wasOffline = false;
          setTimeout(() => {
            reconnectCallbacks.forEach((callback) => {
              try {
                callback();
              } catch (e) {
                console.error('[Network] Reconnect callback error:', e);
              }
            });
          }, 500);
        }
      } else {
        // When going to background, assume we might lose connection
        wasOffline = !navigator.onLine;
      }
    });
  }

  function onReconnect(callback: NetworkCallback): () => void {
    reconnectCallbacks.add(callback);
    return () => reconnectCallbacks.delete(callback);
  }

  function onDisconnect(callback: NetworkCallback): () => void {
    disconnectCallbacks.add(callback);
    return () => disconnectCallbacks.delete(callback);
  }

  return {
    subscribe,
    init,
    onReconnect,
    onDisconnect
  };
}

export const isOnline = createNetworkStore();
