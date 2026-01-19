import { writable, derived, type Readable } from 'svelte/store';
import type { SyncStatus } from '$lib/types';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null;
  lastSyncTime: string | null;
}

function createSyncStatusStore() {
  const { subscribe, set, update } = writable<SyncState>({
    status: 'idle',
    pendingCount: 0,
    lastError: null,
    lastSyncTime: null
  });

  return {
    subscribe,
    setStatus: (status: SyncStatus) => update(state => ({ ...state, status, lastError: status === 'idle' ? null : state.lastError })),
    setPendingCount: (count: number) => update(state => ({ ...state, pendingCount: count })),
    setError: (error: string | null) => update(state => ({ ...state, lastError: error })),
    setLastSyncTime: (time: string) => update(state => ({ ...state, lastSyncTime: time })),
    reset: () => set({ status: 'idle', pendingCount: 0, lastError: null, lastSyncTime: null })
  };
}

export const syncStatusStore = createSyncStatusStore();

// Derived stores for convenience
export const isSyncing: Readable<boolean> = derived(syncStatusStore, $sync => $sync.status === 'syncing');
export const hasPendingChanges: Readable<boolean> = derived(syncStatusStore, $sync => $sync.pendingCount > 0);
export const syncError: Readable<string | null> = derived(syncStatusStore, $sync => $sync.lastError);
