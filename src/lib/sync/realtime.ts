/**
 * Real-Time Subscription Manager
 *
 * Phase 5 of multi-device sync: Implements Supabase Realtime subscriptions
 * for instant multi-device synchronization.
 *
 * Design decisions:
 * - Uses Supabase Realtime PostgreSQL Changes for all entity tables
 * - Skips echo (own changes) by comparing device_id in the payload
 * - Tracks recently processed entities to prevent duplicate processing with polling
 * - Applies changes through existing conflict resolution engine
 * - Falls back to polling if WebSocket connection fails (max 5 reconnect attempts)
 * - Single channel per user with filter by user_id for efficiency
 * - Pauses reconnection attempts while offline (waits for online event)
 * - Uses reconnectScheduled flag to prevent duplicate reconnect attempts
 */

import { supabase } from '$lib/supabase/client';
import { db } from '$lib/db/client';
import { getDeviceId } from './deviceId';
import { resolveConflicts, storeConflictHistory, getPendingOpsForEntity } from './conflicts';
import { getPendingEntityIds } from './queue';
import { remoteChangesStore } from '$lib/stores/remoteChanges';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Tables that support real-time sync
const REALTIME_TABLES = [
  'goal_lists',
  'goals',
  'daily_routine_goals',
  'daily_goal_progress',
  'task_categories',
  'commitments',
  'daily_tasks',
  'long_term_tasks',
  'focus_settings',
  'focus_sessions',
  'block_lists',
  'blocked_websites',
  'projects'
] as const;

type RealtimeTable = (typeof REALTIME_TABLES)[number];

// Map from Supabase table names to Dexie table names
const TABLE_MAP: Record<RealtimeTable, keyof typeof db> = {
  goal_lists: 'goalLists',
  goals: 'goals',
  daily_routine_goals: 'dailyRoutineGoals',
  daily_goal_progress: 'dailyGoalProgress',
  task_categories: 'taskCategories',
  commitments: 'commitments',
  daily_tasks: 'dailyTasks',
  long_term_tasks: 'longTermTasks',
  focus_settings: 'focusSettings',
  focus_sessions: 'focusSessions',
  block_lists: 'blockLists',
  blocked_websites: 'blockedWebsites',
  projects: 'projects'
};

// Protection window for recently modified entities (matches engine.ts)
const RECENTLY_MODIFIED_TTL_MS = 2000;

// Track entities that realtime has just processed (to prevent duplicate processing with polling)
// This is separate from engine.ts's recentlyModifiedEntities (which tracks local writes)
const recentlyProcessedByRealtime: Map<string, number> = new Map();

// Connection state
export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RealtimeManagerState {
  channel: RealtimeChannel | null;
  connectionState: RealtimeConnectionState;
  userId: string | null;
  deviceId: string;
  lastError: string | null;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
}

const state: RealtimeManagerState = {
  channel: null,
  connectionState: 'disconnected',
  userId: null,
  deviceId: '',
  lastError: null,
  reconnectAttempts: 0,
  reconnectTimeout: null
};

// Callbacks for state changes and data updates
const connectionCallbacks: Set<(state: RealtimeConnectionState) => void> = new Set();
const dataUpdateCallbacks: Set<(table: string, entityId: string) => void> = new Set();

// Maximum reconnect attempts before giving up (will fall back to polling)
const MAX_RECONNECT_ATTEMPTS = 5;
// Base delay for exponential backoff (ms)
const RECONNECT_BASE_DELAY = 1000;

// Lock to prevent concurrent start/stop operations
let operationInProgress = false;

// Flag to track if reconnect is already scheduled (prevents duplicate scheduling)
let reconnectScheduled = false;

/**
 * Subscribe to connection state changes
 */
export function onConnectionStateChange(
  callback: (state: RealtimeConnectionState) => void
): () => void {
  connectionCallbacks.add(callback);
  // Immediately call with current state
  callback(state.connectionState);
  return () => connectionCallbacks.delete(callback);
}

/**
 * Subscribe to data update notifications (called after local DB is updated)
 */
export function onRealtimeDataUpdate(
  callback: (table: string, entityId: string) => void
): () => void {
  dataUpdateCallbacks.add(callback);
  return () => dataUpdateCallbacks.delete(callback);
}

/**
 * Get current connection state
 */
export function getConnectionState(): RealtimeConnectionState {
  return state.connectionState;
}

/**
 * Check if an entity was recently processed via realtime
 * Used by engine.ts to prevent duplicate processing during polling
 */
export function wasRecentlyProcessedByRealtime(entityId: string): boolean {
  const processedAt = recentlyProcessedByRealtime.get(entityId);
  if (!processedAt) return false;

  const age = Date.now() - processedAt;
  if (age > RECENTLY_MODIFIED_TTL_MS) {
    recentlyProcessedByRealtime.delete(entityId);
    return false;
  }
  return true;
}

/**
 * Update connection state and notify subscribers
 */
function setConnectionState(newState: RealtimeConnectionState, error?: string): void {
  state.connectionState = newState;
  state.lastError = error || null;

  for (const callback of connectionCallbacks) {
    try {
      callback(newState);
    } catch (e) {
      console.error('[Realtime] Connection callback error:', e);
    }
  }
}

/**
 * Notify data update subscribers
 */
function notifyDataUpdate(table: string, entityId: string): void {
  for (const callback of dataUpdateCallbacks) {
    try {
      callback(table, entityId);
    } catch (e) {
      console.error('[Realtime] Data update callback error:', e);
    }
  }
}

/**
 * Check if this change came from our own device (skip to prevent echo)
 */
function isOwnDeviceChange(record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  const recordDeviceId = record.device_id as string | undefined;
  return recordDeviceId === state.deviceId;
}

/**
 * Check if entity was recently processed by realtime (prevent duplicate processing)
 */
function wasRecentlyProcessed(entityId: string): boolean {
  const processedAt = recentlyProcessedByRealtime.get(entityId);
  if (!processedAt) return false;

  const age = Date.now() - processedAt;
  if (age > RECENTLY_MODIFIED_TTL_MS) {
    recentlyProcessedByRealtime.delete(entityId);
    return false;
  }
  return true;
}

/**
 * Handle incoming realtime change
 */
async function handleRealtimeChange(
  table: RealtimeTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): Promise<void> {
  const eventType = payload.eventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newRecord = (payload as any).new as Record<string, unknown> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldRecord = (payload as any).old as Record<string, unknown> | null;

  // Determine entity ID
  const entityId = (newRecord?.id || oldRecord?.id) as string;
  if (!entityId) {
    console.warn('[Realtime] Change without entity ID:', table, eventType);
    return;
  }

  // Skip if this change came from our own device (prevents echo)
  if (isOwnDeviceChange(newRecord)) {
    return;
  }

  // Skip if we just processed this entity (prevents rapid duplicate processing)
  if (wasRecentlyProcessed(entityId)) {
    return;
  }

  const dexieTable = TABLE_MAP[table];
  if (!dexieTable) {
    console.warn('[Realtime] Unknown table:', table);
    return;
  }

  try {
    switch (eventType) {
      case 'INSERT':
      case 'UPDATE': {
        if (!newRecord) return;

        // Check if entity is being edited in a manual-save form
        const isBeingEdited = remoteChangesStore.isEditing(entityId, table);

        // Get local entity if it exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const localEntity = await (db[dexieTable] as any).get(entityId);

        // Determine which fields changed
        const changedFields: string[] = [];
        if (localEntity && newRecord) {
          for (const key of Object.keys(newRecord)) {
            if (key === 'updated_at' || key === '_version') continue;
            if (JSON.stringify(localEntity[key]) !== JSON.stringify(newRecord[key])) {
              changedFields.push(key);
            }
          }
        }

        // Check for pending operations
        const pendingEntityIds = await getPendingEntityIds();
        const hasPendingOps = pendingEntityIds.has(entityId);

        let applied = false;

        if (!localEntity) {
          // New entity - just insert it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db[dexieTable] as any).put(newRecord);
          applied = true;
        } else if (!hasPendingOps) {
          // No pending ops - check if remote is newer
          const localUpdatedAt = new Date(localEntity.updated_at as string).getTime();
          const remoteUpdatedAt = new Date(newRecord.updated_at as string).getTime();

          if (remoteUpdatedAt > localUpdatedAt) {
            // Remote is newer, accept it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (db[dexieTable] as any).put(newRecord);
            applied = true;
          }
        } else {
          // Has pending operations - use conflict resolution
          const pendingOps = await getPendingOpsForEntity(entityId);
          const resolution = await resolveConflicts(
            table,
            entityId,
            localEntity as Record<string, unknown>,
            newRecord,
            pendingOps
          );

          // Store merged entity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db[dexieTable] as any).put(resolution.mergedEntity);
          applied = true;

          // Store conflict history if there were conflicts
          if (resolution.hasConflicts) {
            await storeConflictHistory(resolution);
          }
        }

        // Calculate value delta for increment/decrement detection
        let valueDelta: number | undefined;
        if (changedFields.includes('current_value') && localEntity && newRecord) {
          const oldValue = (localEntity.current_value as number) || 0;
          const newValue = (newRecord.current_value as number) || 0;
          valueDelta = newValue - oldValue;
        }

        // Record the remote change for UI animation
        // If entity is being edited in a form, the change will be deferred
        // We pass the eventType so the store can detect the action type
        if (changedFields.length > 0 || !localEntity) {
          remoteChangesStore.recordRemoteChange(
            entityId,
            table,
            changedFields.length > 0 ? changedFields : ['*'],
            applied,
            eventType as 'INSERT' | 'UPDATE',
            valueDelta
          );

          // Special case: daily_goal_progress changes should also animate
          // the parent daily_routine_goal item in the UI
          if (table === 'daily_goal_progress' && newRecord) {
            const routineGoalId = newRecord.daily_routine_goal_id as string | undefined;
            if (routineGoalId) {
              remoteChangesStore.recordRemoteChange(
                routineGoalId,
                'daily_routine_goals',
                changedFields,
                applied,
                eventType as 'INSERT' | 'UPDATE',
                valueDelta
              );
            }
          }
        }

        // Mark as recently processed to prevent duplicate processing by polling
        recentlyProcessedByRealtime.set(entityId, Date.now());

        // Notify subscribers
        notifyDataUpdate(table, entityId);
        break;
      }

      case 'DELETE': {
        // For soft-delete systems, this would be an UPDATE with deleted=true
        // But if hard delete happens, we should remove locally too
        if (oldRecord) {
          // Record the delete for UI animation before removing
          remoteChangesStore.recordRemoteChange(entityId, table, ['*'], true, 'DELETE');

          // Mark as pending delete and wait for animation to complete
          // This allows the UI to play the delete animation before DOM removal
          await remoteChangesStore.markPendingDelete(entityId, table);

          // Now actually delete from database (triggers reactive DOM removal)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db[dexieTable] as any).delete(entityId);

          // Mark as recently processed
          recentlyProcessedByRealtime.set(entityId, Date.now());

          notifyDataUpdate(table, entityId);
        }
        break;
      }
    }
  } catch (error) {
    console.error(`[Realtime] Error handling ${eventType} on ${table}:`, error);
  }
}

/**
 * Schedule reconnection with exponential backoff
 * Only schedules if online - no point reconnecting while offline
 */
function scheduleReconnect(): void {
  // Prevent duplicate scheduling from multiple event callbacks
  if (reconnectScheduled) {
    return;
  }

  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }

  // Don't attempt reconnection while offline - wait for online event
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[Realtime] Offline - waiting for online event to reconnect');
    setConnectionState('disconnected');
    return;
  }

  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[Realtime] Max reconnect attempts reached, falling back to polling');
    setConnectionState('error', 'Max reconnection attempts reached');
    return;
  }

  reconnectScheduled = true;
  const delay = RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts);
  console.log(
    `[Realtime] Scheduling reconnect attempt ${state.reconnectAttempts + 1} in ${delay}ms`
  );

  state.reconnectTimeout = setTimeout(async () => {
    reconnectScheduled = false;
    // Double-check we're still online before attempting
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[Realtime] Went offline during backoff, cancelling reconnect');
      return;
    }
    state.reconnectAttempts++;
    if (state.userId) {
      await startRealtimeSubscriptions(state.userId);
    }
  }, delay);
}

/**
 * Internal stop function (doesn't check operation lock)
 */
async function stopRealtimeSubscriptionsInternal(): Promise<void> {
  // Clear reconnect timeout and flag
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }
  reconnectScheduled = false;

  // Unsubscribe from channel
  if (state.channel) {
    try {
      await supabase.removeChannel(state.channel);
    } catch (error) {
      console.error('[Realtime] Error removing channel:', error);
    }
    state.channel = null;
  }

  state.reconnectAttempts = 0;
  setConnectionState('disconnected');
}

/**
 * Start realtime subscriptions for a user
 */
export async function startRealtimeSubscriptions(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // Don't start if offline - wait for online event
  if (!navigator.onLine) {
    console.log('[Realtime] Offline - skipping subscription start');
    return;
  }

  // Don't start if already connected with same user
  if (state.channel && state.userId === userId && state.connectionState === 'connected') {
    return;
  }

  // Prevent concurrent start/stop operations
  if (operationInProgress) {
    console.log('[Realtime] Operation already in progress, skipping');
    return;
  }

  operationInProgress = true;

  try {
    // Stop existing subscriptions first
    await stopRealtimeSubscriptionsInternal();

    state.userId = userId;
    state.deviceId = getDeviceId();
    setConnectionState('connecting');

    // Create a single channel for all tables
    // Using a unique channel name per user
    const channelName = `stellar_sync_${userId}`;
    state.channel = supabase.channel(channelName);

    // Subscribe to each table
    for (const table of REALTIME_TABLES) {
      state.channel = state.channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // Handle async function properly - catch errors to prevent unhandled rejections
          handleRealtimeChange(
            table,
            payload as RealtimePostgresChangesPayload<Record<string, unknown>>
          ).catch((error) => {
            console.error(`[Realtime] Error processing ${table} change:`, error);
          });
        }
      );
    }

    // Subscribe to the channel
    state.channel.subscribe((status, err) => {
      // Release the operation lock once we get any response
      operationInProgress = false;

      switch (status) {
        case 'SUBSCRIBED':
          console.log('[Realtime] Connected and subscribed');
          state.reconnectAttempts = 0;
          reconnectScheduled = false;
          setConnectionState('connected');
          break;

        case 'CHANNEL_ERROR':
          if (err?.message) {
            console.error('[Realtime] Channel error:', err?.message);
          }
          setConnectionState('error', err?.message || 'Channel error');
          scheduleReconnect();
          break;

        case 'TIMED_OUT':
          console.warn('[Realtime] Connection timed out');
          setConnectionState('error', 'Connection timed out');
          scheduleReconnect();
          break;

        case 'CLOSED':
          console.log('[Realtime] Channel closed');
          // Only try to reconnect if:
          // 1. We weren't intentionally disconnected
          // 2. We have a user
          // 3. We're not already scheduled for reconnect (prevents duplicate from CHANNEL_ERROR + CLOSED)
          if (state.connectionState !== 'disconnected' && state.userId && !reconnectScheduled) {
            setConnectionState('disconnected');
            scheduleReconnect();
          }
          break;
      }
    });
  } catch (error) {
    operationInProgress = false;
    console.error('[Realtime] Failed to start subscriptions:', error);
    setConnectionState('error', error instanceof Error ? error.message : 'Failed to connect');
    scheduleReconnect();
  }
}

/**
 * Stop realtime subscriptions (public API)
 */
export async function stopRealtimeSubscriptions(): Promise<void> {
  // Prevent concurrent operations
  if (operationInProgress) {
    console.log('[Realtime] Operation already in progress, skipping stop');
    return;
  }

  operationInProgress = true;

  try {
    await stopRealtimeSubscriptionsInternal();
    state.userId = null;
    // Clear recently processed tracking
    recentlyProcessedByRealtime.clear();
  } finally {
    operationInProgress = false;
  }
}

/**
 * Pause realtime (when going offline) - stops reconnection attempts
 * Called by sync engine when offline event fires
 */
export function pauseRealtime(): void {
  // Clear any pending reconnect attempts and reset flags
  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }
  reconnectScheduled = false;
  // Reset reconnect attempts so we get fresh attempts when coming online
  state.reconnectAttempts = 0;
  setConnectionState('disconnected');
  console.log('[Realtime] Paused - waiting for online event');
}

/**
 * Check if realtime is healthy (connected and not in error state)
 */
export function isRealtimeHealthy(): boolean {
  return state.connectionState === 'connected';
}

/**
 * Clean up expired entries from recently processed tracking
 */
export function cleanupRealtimeTracking(): void {
  const now = Date.now();
  for (const [entityId, processedAt] of recentlyProcessedByRealtime) {
    if (now - processedAt > RECENTLY_MODIFIED_TTL_MS) {
      recentlyProcessedByRealtime.delete(entityId);
    }
  }
}
