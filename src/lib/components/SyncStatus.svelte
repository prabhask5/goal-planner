<script lang="ts">
  import { syncStatusStore } from '$lib/stores/sync';
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
    gap: 0.625rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    padding: 0.5rem 1rem;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg,
      rgba(20, 20, 40, 0.9) 0%,
      rgba(15, 15, 32, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    transition: all 0.3s var(--ease-smooth);
    backdrop-filter: blur(10px);
  }

  .sync-status.offline {
    color: var(--color-yellow);
    background: linear-gradient(135deg,
      rgba(255, 217, 61, 0.15) 0%,
      rgba(255, 217, 61, 0.05) 100%);
    border-color: rgba(255, 217, 61, 0.4);
    box-shadow: 0 0 20px rgba(255, 217, 61, 0.15);
  }

  .sync-status.syncing {
    color: var(--color-primary-light);
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.2) 0%,
      rgba(108, 92, 231, 0.08) 100%);
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow: 0 0 25px var(--color-primary-glow);
    animation: syncPulse 1.5s ease-in-out infinite;
  }

  @keyframes syncPulse {
    0%, 100% { box-shadow: 0 0 20px var(--color-primary-glow); }
    50% { box-shadow: 0 0 35px var(--color-primary-glow); }
  }

  .sync-status.error {
    color: var(--color-red);
    background: linear-gradient(135deg,
      rgba(255, 107, 107, 0.18) 0%,
      rgba(255, 107, 107, 0.06) 100%);
    border-color: rgba(255, 107, 107, 0.4);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.2);
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
    filter: drop-shadow(0 0 8px var(--color-green-glow));
    animation: syncedPulse 2s ease-in-out infinite;
  }

  @keyframes syncedPulse {
    0%, 100% { filter: drop-shadow(0 0 8px var(--color-green-glow)); }
    50% { filter: drop-shadow(0 0 15px var(--color-green-glow)); }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .status-text {
    white-space: nowrap;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .sync-btn {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: all 0.25s var(--ease-spring);
  }

  .sync-btn:hover {
    transform: scale(1.08);
  }

  .sync-btn.pending {
    color: var(--color-primary-light);
  }

  .sync-btn.error {
    color: var(--color-red);
  }
</style>
