import { writable } from 'svelte/store';
import type { SyncStatus } from '$lib/types';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null;
  lastSyncTime: string | null;
}

// Minimum time to show 'syncing' state to prevent flickering (ms)
const MIN_SYNCING_TIME = 500;

function createSyncStatusStore() {
  const { subscribe, set, update } = writable<SyncState>({
    status: 'idle',
    pendingCount: 0,
    lastError: null,
    lastSyncTime: null
  });

  let syncingStartTime: number | null = null;
  let pendingStatusChange: { status: SyncStatus; timeout: ReturnType<typeof setTimeout> } | null = null;

  return {
    subscribe,
    setStatus: (status: SyncStatus) => {
      // Clear any pending status change
      if (pendingStatusChange) {
        clearTimeout(pendingStatusChange.timeout);
        pendingStatusChange = null;
      }

      if (status === 'syncing') {
        // Starting sync - record the time
        syncingStartTime = Date.now();
        update(state => ({ ...state, status, lastError: null }));
      } else if (syncingStartTime !== null) {
        // Ending sync - ensure minimum display time
        const elapsed = Date.now() - syncingStartTime;
        const remaining = MIN_SYNCING_TIME - elapsed;

        if (remaining > 0) {
          // Delay the status change to prevent flickering
          pendingStatusChange = {
            status,
            timeout: setTimeout(() => {
              syncingStartTime = null;
              pendingStatusChange = null;
              update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError }));
            }, remaining)
          };
        } else {
          syncingStartTime = null;
          update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError }));
        }
      } else {
        update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError }));
      }
    },
    setPendingCount: (count: number) => update(state => ({ ...state, pendingCount: count })),
    setError: (error: string | null) => update(state => ({ ...state, lastError: error })),
    setLastSyncTime: (time: string) => update(state => ({ ...state, lastSyncTime: time })),
    reset: () => {
      if (pendingStatusChange) {
        clearTimeout(pendingStatusChange.timeout);
        pendingStatusChange = null;
      }
      syncingStartTime = null;
      set({ status: 'idle', pendingCount: 0, lastError: null, lastSyncTime: null });
    }
  };
}

export const syncStatusStore = createSyncStatusStore();
