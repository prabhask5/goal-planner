import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { FocusSettings, FocusSession, BlockList, BlockedWebsite } from '$lib/types';
import * as repo from '$lib/db/repositories';
import * as sync from '$lib/sync/engine';
import { browser } from '$app/environment';
import {
  calculateRemainingMs,
  getNextPhase
} from '$lib/utils/focus';

// ============================================================
// FOCUS TIMER STORE
// ============================================================

interface FocusState {
  settings: FocusSettings | null;
  session: FocusSession | null;
  remainingMs: number;
  isRunning: boolean;
}

// Store to notify when focus time should be refreshed
const focusTimeUpdatedStore = writable(0);

function createFocusStore() {
  const { subscribe, set, update }: Writable<FocusState> = writable({
    settings: null,
    session: null,
    remainingMs: 0,
    isRunning: false
  });

  let loading = writable(true);
  let tickInterval: ReturnType<typeof setInterval> | null = null;
  let currentUserId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let isHandlingPhaseComplete = false; // Prevent concurrent phase completions

  // Function to trigger focus time refresh
  function notifyFocusTimeUpdated() {
    focusTimeUpdatedStore.update(n => n + 1);
  }

  // Tick function to update remaining time
  function tick() {
    update(state => {
      if (!state.session || state.session.status !== 'running') {
        return state;
      }

      const remaining = calculateRemainingMs(state.session);

      // Check if phase completed (prevent concurrent calls)
      if (remaining <= 0 && !isHandlingPhaseComplete) {
        isHandlingPhaseComplete = true;
        handlePhaseComplete().finally(() => {
          isHandlingPhaseComplete = false;
        });
        return state; // State will be updated by handlePhaseComplete
      }

      return { ...state, remainingMs: remaining };
    });
  }

  // Handle phase completion
  async function handlePhaseComplete() {
    let state: FocusState | null = null;
    update(s => { state = s; return s; });

    if (!state || !(state as FocusState).session || !(state as FocusState).settings) return;

    const session = (state as FocusState).session!;
    const settings = (state as FocusState).settings!;

    // Calculate elapsed focus time if completing a focus phase
    let elapsedFocusMinutes: number | undefined;
    if (session.phase === 'focus') {
      elapsedFocusMinutes = session.focus_duration; // Full duration on natural completion
    }

    const next = getNextPhase(session, settings);

    if (next.phase === 'idle') {
      // Session complete
      await repo.stopFocusSession(session.id, elapsedFocusMinutes);
      const stopped = await repo.getFocusSession(session.id);
      update(s => ({
        ...s,
        session: stopped,
        remainingMs: 0,
        isRunning: false
      }));
      stopTicker();
      // Notify that focus time has been updated
      if (elapsedFocusMinutes !== undefined) {
        notifyFocusTimeUpdated();
      }
      return;
    }

    // Advance to next phase
    const updated = await repo.advancePhase(
      session.id,
      next.phase,
      next.cycle,
      next.durationMs,
      elapsedFocusMinutes
    );

    if (updated) {
      // Check auto-start settings
      const shouldAutoStart =
        (next.phase === 'break' && settings.auto_start_breaks) ||
        (next.phase === 'focus' && settings.auto_start_focus);

      if (!shouldAutoStart) {
        // Pause at the start of new phase
        await repo.pauseFocusSession(session.id, next.durationMs);
        const paused = await repo.getFocusSession(session.id);
        update(s => ({
          ...s,
          session: paused,
          remainingMs: next.durationMs,
          isRunning: false
        }));
        stopTicker();
      } else {
        update(s => ({
          ...s,
          session: updated,
          remainingMs: next.durationMs,
          isRunning: true
        }));
      }

      // Notify that focus time has been updated after completing a focus phase
      if (elapsedFocusMinutes !== undefined) {
        notifyFocusTimeUpdated();
      }
    }
  }

  function startTicker() {
    if (tickInterval) return;
    tickInterval = setInterval(tick, 100); // Update every 100ms for smooth countdown
  }

  function stopTicker() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    // Load settings and any active session for user
    load: async (userId: string) => {
      loading.set(true);
      currentUserId = userId;

      try {
        // Get or create settings
        const settings = await repo.getOrCreateFocusSettings(userId);

        // Check for active session
        const activeSession = await repo.getActiveSession(userId);

        let remainingMs = 0;
        let isRunning = false;

        if (activeSession) {
          remainingMs = calculateRemainingMs(activeSession);
          isRunning = activeSession.status === 'running';

          // If session has expired while away, stop it
          if (remainingMs <= 0 && isRunning) {
            await repo.stopFocusSession(activeSession.id);
            const stopped = await repo.getFocusSession(activeSession.id);
            set({ settings, session: stopped, remainingMs: 0, isRunning: false });
            loading.set(false);
            return;
          }

          if (isRunning) {
            startTicker();
          }
        }

        set({ settings, session: activeSession, remainingMs, isRunning });

        // Register for sync complete
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentUserId) {
              const refreshedSettings = await repo.getFocusSettings(currentUserId);
              const refreshedSession = await repo.getActiveSession(currentUserId);
              update(s => ({
                ...s,
                settings: refreshedSettings || s.settings,
                session: refreshedSession || s.session
              }));
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    // Start a new focus session
    start: async () => {
      let state: FocusState | null = null;
      update(s => { state = s; return s; });

      if (!state || !(state as FocusState).settings || !currentUserId) return;

      const settings = (state as FocusState).settings!;

      // Create new session
      const session = await repo.createFocusSession(
        currentUserId,
        settings.focus_duration,
        settings.break_duration,
        settings.cycles_before_long_break
      );

      const durationMs = settings.focus_duration * 60 * 1000;

      update(s => ({
        ...s,
        session,
        remainingMs: durationMs,
        isRunning: true
      }));

      startTicker();
    },

    // Pause current session
    pause: async () => {
      let state: FocusState | null = null;
      update(s => { state = s; return s; });

      if (!state || !(state as FocusState).session) return;

      const session = (state as FocusState).session!;
      const remaining = calculateRemainingMs(session);

      await repo.pauseFocusSession(session.id, remaining);
      const paused = await repo.getFocusSession(session.id);

      update(s => ({
        ...s,
        session: paused,
        remainingMs: remaining,
        isRunning: false
      }));

      stopTicker();
    },

    // Resume paused session
    resume: async () => {
      let state: FocusState | null = null;
      update(s => { state = s; return s; });

      if (!state || !(state as FocusState).session) return;

      const session = (state as FocusState).session!;

      await repo.resumeFocusSession(session.id);
      const resumed = await repo.getFocusSession(session.id);

      update(s => ({
        ...s,
        session: resumed,
        isRunning: true
      }));

      startTicker();
    },

    // Stop session entirely
    stop: async () => {
      let state: FocusState | null = null;
      update(s => { state = s; return s; });

      if (!state || !(state as FocusState).session) return;

      const session = (state as FocusState).session!;

      // Calculate elapsed focus time if stopping during a focus phase
      let elapsedFocusMinutes: number | undefined;
      if (session.phase === 'focus') {
        const elapsedMs = Date.now() - new Date(session.phase_started_at).getTime();
        elapsedFocusMinutes = Math.min(Math.floor(elapsedMs / 60000), session.focus_duration);
      }

      await repo.stopFocusSession(session.id, elapsedFocusMinutes);

      update(s => ({
        ...s,
        session: null,
        remainingMs: 0,
        isRunning: false
      }));

      stopTicker();

      // Notify that focus time has been updated
      if (elapsedFocusMinutes !== undefined) {
        notifyFocusTimeUpdated();
      }
    },

    // Skip to next phase
    skip: async () => {
      let state: FocusState | null = null;
      update(s => { state = s; return s; });

      if (!state || !(state as FocusState).session || !(state as FocusState).settings) return;

      const session = (state as FocusState).session!;
      const settings = (state as FocusState).settings!;
      const wasRunning = session.status === 'running';

      // Calculate elapsed focus time if skipping during a focus phase
      let elapsedFocusMinutes: number | undefined;
      if (session.phase === 'focus') {
        const elapsedMs = Date.now() - new Date(session.phase_started_at).getTime();
        elapsedFocusMinutes = Math.min(Math.floor(elapsedMs / 60000), session.focus_duration);
      }

      const next = getNextPhase(session, settings);

      if (next.phase === 'idle') {
        // Session complete
        await repo.stopFocusSession(session.id, elapsedFocusMinutes);
        update(s => ({
          ...s,
          session: null,
          remainingMs: 0,
          isRunning: false
        }));
        stopTicker();
        // Notify that focus time has been updated
        if (elapsedFocusMinutes !== undefined) {
          notifyFocusTimeUpdated();
        }
        return;
      }

      // Advance to next phase
      const updated = await repo.advancePhase(
        session.id,
        next.phase,
        next.cycle,
        next.durationMs,
        elapsedFocusMinutes
      );

      if (updated) {
        // Keep running state if was running
        if (wasRunning) {
          update(s => ({
            ...s,
            session: updated,
            remainingMs: next.durationMs,
            isRunning: true
          }));
        } else {
          await repo.pauseFocusSession(session.id, next.durationMs);
          const paused = await repo.getFocusSession(session.id);
          update(s => ({
            ...s,
            session: paused,
            remainingMs: next.durationMs,
            isRunning: false
          }));
        }

        // Notify that focus time has been updated after completing a focus phase
        if (elapsedFocusMinutes !== undefined) {
          notifyFocusTimeUpdated();
        }
      }
    },

    // Update settings
    updateSettings: async (updates: Partial<Pick<FocusSettings, 'focus_duration' | 'break_duration' | 'long_break_duration' | 'cycles_before_long_break' | 'auto_start_breaks' | 'auto_start_focus'>>) => {
      let state: FocusState | null = null;
      update(s => { state = s; return s; });

      if (!state || !(state as FocusState).settings) return;

      const settings = (state as FocusState).settings!;
      const updated = await repo.updateFocusSettings(settings.id, updates);

      if (updated) {
        update(s => ({ ...s, settings: updated }));
      }
    },

    // Get today's focus time
    getTodayFocusTime: async (): Promise<number> => {
      if (!currentUserId) return 0;
      return repo.getTodayFocusTime(currentUserId);
    },

    // Cleanup
    destroy: () => {
      stopTicker();
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}

export const focusStore = createFocusStore();

// Export the focus time updated store for components to subscribe to
export const focusTimeUpdated: Readable<number> = { subscribe: focusTimeUpdatedStore.subscribe };

// ============================================================
// BLOCK LIST STORE
// ============================================================

function createBlockListStore() {
  const { subscribe, set, update }: Writable<BlockList[]> = writable([]);
  let loading = writable(true);
  let currentUserId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    load: async (userId: string) => {
      loading.set(true);
      currentUserId = userId;

      try {
        const lists = await repo.getBlockLists(userId);
        set(lists);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentUserId) {
              const refreshed = await repo.getBlockLists(currentUserId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    create: async (name: string) => {
      if (!currentUserId) return;
      const newList = await repo.createBlockList(name, currentUserId);
      update(lists => [newList, ...lists]);
      return newList;
    },

    update: async (id: string, updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>) => {
      const updated = await repo.updateBlockList(id, updates);
      if (updated) {
        update(lists => lists.map(l => l.id === id ? updated : l));
      }
      return updated;
    },

    toggle: async (id: string) => {
      const updated = await repo.toggleBlockList(id);
      if (updated) {
        update(lists => lists.map(l => l.id === id ? updated : l));
      }
      return updated;
    },

    delete: async (id: string) => {
      await repo.deleteBlockList(id);
      update(lists => lists.filter(l => l.id !== id));
    },

    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderBlockList(id, newOrder);
      if (updated) {
        update(lists => {
          const updatedLists = lists.map(l => l.id === id ? updated : l);
          updatedLists.sort((a, b) => a.order - b.order);
          return updatedLists;
        });
      }
      return updated;
    },

    refresh: async () => {
      if (currentUserId) {
        const lists = await repo.getBlockLists(currentUserId);
        set(lists);
      }
    },

    getEnabledCount: (): Readable<number> => {
      return derived({ subscribe }, $lists => $lists.filter(l => l.is_enabled).length);
    }
  };
}

export const blockListStore = createBlockListStore();

// ============================================================
// BLOCKED WEBSITES STORE (for a single block list)
// ============================================================

function createBlockedWebsitesStore() {
  const { subscribe, set, update }: Writable<BlockedWebsite[]> = writable([]);
  let loading = writable(true);
  let currentBlockListId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    load: async (blockListId: string) => {
      loading.set(true);
      currentBlockListId = blockListId;

      try {
        const websites = await repo.getBlockedWebsites(blockListId);
        set(websites);

        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentBlockListId) {
              const refreshed = await repo.getBlockedWebsites(currentBlockListId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    create: async (domain: string) => {
      if (!currentBlockListId) return;
      const newWebsite = await repo.createBlockedWebsite(currentBlockListId, domain);
      // Prepend to top
      update(websites => [newWebsite, ...websites]);
      return newWebsite;
    },

    update: async (id: string, domain: string) => {
      const updated = await repo.updateBlockedWebsite(id, domain);
      if (updated) {
        update(websites => websites.map(w => w.id === id ? updated : w));
      }
      return updated;
    },

    delete: async (id: string) => {
      await repo.deleteBlockedWebsite(id);
      update(websites => websites.filter(w => w.id !== id));
    },

    clear: () => {
      currentBlockListId = null;
      set([]);
    }
  };
}

export const blockedWebsitesStore = createBlockedWebsitesStore();

// ============================================================
// SINGLE BLOCK LIST STORE (for edit page)
// ============================================================

function createSingleBlockListStore() {
  const { subscribe, set }: Writable<BlockList | null> = writable(null);
  let loading = writable(true);
  let currentId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    load: async (id: string) => {
      loading.set(true);
      currentId = id;

      try {
        const list = await repo.getBlockList(id);
        set(list);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await repo.getBlockList(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    update: async (id: string, updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>) => {
      const updated = await repo.updateBlockList(id, updates);
      if (updated) {
        set(updated);
        // Also refresh the main block list store so counts update
        blockListStore.refresh();
      }
      return updated;
    },

    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

export const singleBlockListStore = createSingleBlockListStore();
