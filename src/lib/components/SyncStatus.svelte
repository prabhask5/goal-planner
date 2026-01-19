<script lang="ts">
  import { syncStatusStore, hasPendingChanges } from '$lib/stores/sync';
  import { isOnline } from '$lib/stores/network';
  import { performSync } from '$lib/sync/engine';
  import type { SyncStatus } from '$lib/types';

  let status = $state<SyncStatus>('idle');
  let pendingCount = $state(0);
  let online = $state(true);

  // Subscribe to stores
  $effect(() => {
    const unsubSync = syncStatusStore.subscribe((value) => {
      status = value.status;
      pendingCount = value.pendingCount;
    });
    const unsubOnline = isOnline.subscribe((value) => {
      online = value;
    });

    return () => {
      unsubSync();
      unsubOnline();
    };
  });

  function handleSyncClick() {
    if (online && status !== 'syncing') {
      performSync();
    }
  }
</script>

<div class="sync-status" class:offline={!online} class:syncing={status === 'syncing'} class:error={status === 'error'}>
  {#if !online}
    <span class="status-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
      </svg>
    </span>
    <span class="status-text">Offline</span>
  {:else if status === 'syncing'}
    <span class="status-icon spinning">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
    </span>
    <span class="status-text">Syncing...</span>
  {:else if status === 'error'}
    <button class="sync-btn error" onclick={handleSyncClick}>
      <span class="status-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </span>
      <span class="status-text">Sync Error</span>
    </button>
  {:else if pendingCount > 0}
    <button class="sync-btn pending" onclick={handleSyncClick}>
      <span class="status-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/>
        </svg>
      </span>
      <span class="status-text">{pendingCount} pending</span>
    </button>
  {:else}
    <span class="status-icon synced">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    </span>
    <span class="status-text">Synced</span>
  {/if}
</div>

<style>
  .sync-status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-tertiary);
  }

  .sync-status.offline {
    color: var(--color-yellow);
    background-color: rgba(241, 196, 15, 0.1);
  }

  .sync-status.syncing {
    color: var(--color-primary);
    background-color: rgba(108, 92, 231, 0.1);
  }

  .sync-status.error {
    color: var(--color-red);
    background-color: rgba(255, 107, 107, 0.1);
  }

  .status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-icon.spinning {
    animation: spin 1s linear infinite;
  }

  .status-icon.synced {
    color: var(--color-green);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .status-text {
    white-space: nowrap;
  }

  .sync-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .sync-btn:hover {
    opacity: 0.8;
  }

  .sync-btn.pending {
    color: var(--color-primary);
  }

  .sync-btn.error {
    color: var(--color-red);
  }
</style>
