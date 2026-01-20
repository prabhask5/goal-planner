import { writable } from 'svelte/store';
import type { SyncStatus } from '$lib/types';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null; // Friendly error message
  lastErrorDetails: string | null; // Raw technical error
  lastSyncTime: string | null;
  syncMessage: string | null; // Human-readable status message
  isTabVisible: boolean; // Track if tab is visible
}

// Minimum time to show 'syncing' state to prevent flickering (ms)
const MIN_SYNCING_TIME = 500;

function createSyncStatusStore() {
  const { subscribe, set, update } = writable<SyncState>({
    status: 'idle',
    pendingCount: 0,
    lastError: null,
    lastErrorDetails: null,
    lastSyncTime: null,
    syncMessage: null,
    isTabVisible: true
  });

  let currentStatus: SyncStatus = 'idle';
  let syncingStartTime: number | null = null;
  let pendingStatusChange: { status: SyncStatus; timeout: ReturnType<typeof setTimeout> } | null = null;

  return {
    subscribe,
    setStatus: (status: SyncStatus) => {
      // Ignore redundant status updates to prevent unnecessary re-renders
      if (status === currentStatus && status !== 'syncing') {
        return;
      }

      // Clear any pending status change
      if (pendingStatusChange) {
        clearTimeout(pendingStatusChange.timeout);
        pendingStatusChange = null;
      }

      if (status === 'syncing') {
        // Starting sync - record the time
        syncingStartTime = Date.now();
        currentStatus = status;
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
              currentStatus = status;
              update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError }));
            }, remaining)
          };
        } else {
          syncingStartTime = null;
          currentStatus = status;
          update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError }));
        }
      } else {
        currentStatus = status;
        update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError }));
      }
    },
    setPendingCount: (count: number) => update(state => ({ ...state, pendingCount: count })),
    setError: (friendly: string | null, raw?: string | null) => update(state => ({
      ...state,
      lastError: friendly,
      lastErrorDetails: raw ?? null
    })),
    setLastSyncTime: (time: string) => update(state => ({ ...state, lastSyncTime: time })),
    setSyncMessage: (message: string | null) => update(state => ({ ...state, syncMessage: message })),
    setTabVisible: (visible: boolean) => update(state => ({ ...state, isTabVisible: visible })),
    reset: () => {
      if (pendingStatusChange) {
        clearTimeout(pendingStatusChange.timeout);
        pendingStatusChange = null;
      }
      syncingStartTime = null;
      currentStatus = 'idle';
      set({ status: 'idle', pendingCount: 0, lastError: null, lastErrorDetails: null, lastSyncTime: null, syncMessage: null, isTabVisible: true });
    }
  };
}

export const syncStatusStore = createSyncStatusStore();
