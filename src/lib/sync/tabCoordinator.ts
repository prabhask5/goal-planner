/**
 * Multi-Tab Coordination System
 *
 * Coordinates sync operations between multiple browser tabs to:
 * - Prevent redundant polling (only leader tab polls)
 * - Broadcast sync completions so all tabs refresh their data
 * - Broadcast local writes so other tabs can refresh specific stores
 *
 * Uses BroadcastChannel API for inter-tab communication.
 */

import type { SyncQueueTable } from '$lib/types';

// Channel name for sync coordination
const SYNC_CHANNEL = 'stellar-sync';

// Message types
type TabMessage =
  | { type: 'SYNC_STARTED'; tabId: string }
  | { type: 'SYNC_COMPLETE'; tabId: string; timestamp: string }
  | { type: 'LOCAL_WRITE'; tabId: string; table: SyncQueueTable; entityId: string }
  | { type: 'LEADER_CLAIM'; tabId: string; timestamp: number }
  | { type: 'LEADER_HEARTBEAT'; tabId: string; timestamp: number }
  | { type: 'LEADER_QUERY'; tabId: string };

// State
let channel: BroadcastChannel | null = null;
let tabId: string = '';
let isLeader = false;
let leaderId: string | null = null;
let leaderLastHeartbeat = 0;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// Callbacks
let onSyncStartedCallback: (() => void) | null = null;
let onSyncCompleteCallback: (() => void) | null = null;
let onLocalWriteCallback: ((table: SyncQueueTable, entityId: string) => void) | null = null;
let onBecameLeaderCallback: (() => void) | null = null;
let onLostLeadershipCallback: (() => void) | null = null;

// Constants
const LEADER_HEARTBEAT_INTERVAL = 5000; // 5 seconds
const LEADER_TIMEOUT = 15000; // 15 seconds without heartbeat = leader lost

// Generate unique tab ID
function generateTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Handle incoming messages
function handleMessage(event: MessageEvent<TabMessage>): void {
  const message = event.data;

  // Ignore our own messages
  if (message.tabId === tabId) return;

  switch (message.type) {
    case 'SYNC_STARTED':
      // Another tab started syncing, skip our next scheduled sync
      onSyncStartedCallback?.();
      break;

    case 'SYNC_COMPLETE':
      // Another tab finished syncing, refresh our stores from local DB
      onSyncCompleteCallback?.();
      break;

    case 'LOCAL_WRITE':
      // Another tab wrote data, refresh specific store
      onLocalWriteCallback?.(message.table, message.entityId);
      break;

    case 'LEADER_CLAIM':
      // Another tab is claiming leadership
      if (!isLeader || message.timestamp < leaderLastHeartbeat) {
        // Accept their leadership
        leaderId = message.tabId;
        leaderLastHeartbeat = message.timestamp;
        if (isLeader) {
          isLeader = false;
          onLostLeadershipCallback?.();
        }
      }
      break;

    case 'LEADER_HEARTBEAT':
      // Leader is still alive
      if (message.tabId === leaderId) {
        leaderLastHeartbeat = message.timestamp;
      }
      break;

    case 'LEADER_QUERY':
      // Another tab is asking who the leader is
      if (isLeader) {
        broadcast({ type: 'LEADER_HEARTBEAT', tabId, timestamp: Date.now() });
      }
      break;
  }
}

// Broadcast a message to other tabs
function broadcast(message: TabMessage): void {
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch (e) {
    console.error('[TabCoordinator] Failed to broadcast:', e);
  }
}

// Attempt to become leader
function claimLeadership(): void {
  const timestamp = Date.now();
  isLeader = true;
  leaderId = tabId;
  leaderLastHeartbeat = timestamp;

  broadcast({ type: 'LEADER_CLAIM', tabId, timestamp });

  // Start heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  heartbeatInterval = setInterval(() => {
    if (isLeader) {
      broadcast({ type: 'LEADER_HEARTBEAT', tabId, timestamp: Date.now() });
    }
  }, LEADER_HEARTBEAT_INTERVAL);

  onBecameLeaderCallback?.();
}

// Check if current leader is still alive
function checkLeaderHealth(): void {
  if (leaderId === tabId) return; // We are leader

  const now = Date.now();
  if (now - leaderLastHeartbeat > LEADER_TIMEOUT) {
    // Leader seems dead, try to claim leadership
    claimLeadership();
  }
}

// Initialize tab coordination
export function initTabCoordinator(options?: {
  onSyncStarted?: () => void;
  onSyncComplete?: () => void;
  onLocalWrite?: (table: SyncQueueTable, entityId: string) => void;
  onBecameLeader?: () => void;
  onLostLeadership?: () => void;
}): void {
  if (typeof window === 'undefined') return;
  if (typeof BroadcastChannel === 'undefined') {
    console.log('[TabCoordinator] BroadcastChannel not supported, running as standalone');
    // In single-tab mode, this tab is always leader
    isLeader = true;
    options?.onBecameLeader?.();
    return;
  }

  tabId = generateTabId();

  // Set up callbacks
  onSyncStartedCallback = options?.onSyncStarted || null;
  onSyncCompleteCallback = options?.onSyncComplete || null;
  onLocalWriteCallback = options?.onLocalWrite || null;
  onBecameLeaderCallback = options?.onBecameLeader || null;
  onLostLeadershipCallback = options?.onLostLeadership || null;

  // Create channel
  channel = new BroadcastChannel(SYNC_CHANNEL);
  channel.onmessage = handleMessage;

  // Query for existing leader
  broadcast({ type: 'LEADER_QUERY', tabId });

  // Wait a bit for response, then claim leadership if no leader responds
  setTimeout(() => {
    if (!leaderId) {
      claimLeadership();
    }
  }, 500);

  // Periodically check leader health
  setInterval(checkLeaderHealth, LEADER_HEARTBEAT_INTERVAL);

  // Claim leadership on visibility change if we're the only visible tab
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isLeader) {
      // Query for leader
      broadcast({ type: 'LEADER_QUERY', tabId });
      setTimeout(() => {
        if (Date.now() - leaderLastHeartbeat > LEADER_TIMEOUT) {
          claimLeadership();
        }
      }, 500);
    }
  });
}

// Stop tab coordination
export function stopTabCoordinator(): void {
  if (channel) {
    channel.close();
    channel = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  isLeader = false;
  leaderId = null;

  onSyncStartedCallback = null;
  onSyncCompleteCallback = null;
  onLocalWriteCallback = null;
  onBecameLeaderCallback = null;
  onLostLeadershipCallback = null;
}

// Check if this tab is the leader (only leader should poll)
export function isLeaderTab(): boolean {
  // If BroadcastChannel not supported, always act as leader
  if (typeof BroadcastChannel === 'undefined') return true;
  return isLeader;
}

// Notify other tabs that sync has started
export function notifySyncStarted(): void {
  broadcast({ type: 'SYNC_STARTED', tabId });
}

// Notify other tabs that sync has completed
export function notifySyncComplete(): void {
  broadcast({ type: 'SYNC_COMPLETE', tabId, timestamp: new Date().toISOString() });
}

// Notify other tabs of a local write
export function notifyLocalWrite(table: SyncQueueTable, entityId: string): void {
  broadcast({ type: 'LOCAL_WRITE', tabId, table, entityId });
}

// Get coordinator state for debugging
function getCoordinatorState(): {
  tabId: string;
  isLeader: boolean;
  leaderId: string | null;
  leaderLastHeartbeat: number;
  channelActive: boolean;
} {
  return {
    tabId,
    isLeader,
    leaderId,
    leaderLastHeartbeat,
    channelActive: channel !== null,
  };
}

// Expose for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__stellarTabs = () => {
    const state = getCoordinatorState();
    console.log('=== STELLAR TAB COORDINATOR ===');
    console.log(`Tab ID: ${state.tabId}`);
    console.log(`Is Leader: ${state.isLeader}`);
    console.log(`Leader ID: ${state.leaderId}`);
    console.log(`Leader last heartbeat: ${state.leaderLastHeartbeat ? Math.round((Date.now() - state.leaderLastHeartbeat) / 1000) + 's ago' : 'never'}`);
    console.log(`Channel active: ${state.channelActive}`);
    return state;
  };
}
