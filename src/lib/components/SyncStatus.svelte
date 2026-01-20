<script lang="ts">
  import { syncStatusStore } from '$lib/stores/sync';
  import { isOnline } from '$lib/stores/network';
  import { performSync } from '$lib/sync/engine';
  import type { SyncStatus } from '$lib/types';

  let status = $state<SyncStatus>('idle');
  let pendingCount = $state(0);
  let online = $state(true);
  let lastError = $state<string | null>(null);
  let lastErrorDetails = $state<string | null>(null);
  let lastSyncTime = $state<string | null>(null);
  let syncMessage = $state<string | null>(null);
  let showTooltip = $state(false);
  let showDetails = $state(false);
  let tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  // Subscribe to stores
  $effect(() => {
    const unsubSync = syncStatusStore.subscribe((value) => {
      status = value.status;
      pendingCount = value.pendingCount;
      lastError = value.lastError;
      lastErrorDetails = value.lastErrorDetails;
      lastSyncTime = value.lastSyncTime;
      syncMessage = value.syncMessage;
    });
    const unsubOnline = isOnline.subscribe((value) => {
      online = value;
    });

    return () => {
      unsubSync();
      unsubOnline();
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
    };
  });

  function handleSyncClick() {
    if (online && status !== 'syncing') {
      performSync();
    }
  }

  function handleMouseEnter() {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      showTooltip = true;
    }, 200);
  }

  function handleMouseLeave() {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      showTooltip = false;
    }, 150);
  }

  // Derive the display state
  const displayState = $derived(() => {
    if (!online) return 'offline';
    if (status === 'syncing') return 'syncing';
    if (status === 'error') return 'error';
    if (pendingCount > 0) return 'pending';
    return 'synced';
  });

  // Format last sync time to relative time
  const formattedLastSync = $derived(() => {
    if (!lastSyncTime) return null;
    const date = new Date(lastSyncTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 10) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  });

  // Get status label for tooltip
  const statusLabel = $derived(() => {
    const state = displayState();
    switch (state) {
      case 'offline': return 'Offline';
      case 'syncing': return 'Syncing';
      case 'error': return 'Sync Error';
      case 'pending': return 'Changes Pending';
      default: return 'All Synced';
    }
  });

  // Get status description for tooltip
  const statusDescription = $derived(() => {
    const state = displayState();
    if (syncMessage) return syncMessage;

    switch (state) {
      case 'offline':
        return 'Changes will sync when you\'re back online.';
      case 'syncing':
        return 'Syncing your data...';
      case 'error':
        return lastError || 'Something went wrong. Tap to retry.';
      case 'pending':
        return `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync.`;
      default:
        return 'All your data is up to date.';
    }
  });
</script>

<!-- Sync indicator with tooltip -->
<div
  class="sync-wrapper"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocusin={handleMouseEnter}
  onfocusout={handleMouseLeave}
>
  <button
    class="sync-indicator"
    class:offline={displayState() === 'offline'}
    class:syncing={displayState() === 'syncing'}
    class:error={displayState() === 'error'}
    class:pending={displayState() === 'pending'}
    class:synced={displayState() === 'synced'}
    onclick={handleSyncClick}
    disabled={!online || status === 'syncing'}
    aria-label={statusLabel()}
  >
    <span class="indicator-ring"></span>
    <span class="indicator-core">
      {#if displayState() === 'offline'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
      {:else if displayState() === 'syncing'}
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      {:else if displayState() === 'error'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      {:else if displayState() === 'pending'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        <span class="pending-badge">{pendingCount}</span>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      {/if}
    </span>
  </button>

  <!-- Beautiful Tooltip -->
  {#if showTooltip}
    <div class="tooltip" class:error={displayState() === 'error'}>
      <div class="tooltip-arrow"></div>
      <div class="tooltip-content">
        <!-- Status Header -->
        <div class="tooltip-header">
          <div class="status-dot" class:offline={displayState() === 'offline'} class:syncing={displayState() === 'syncing'} class:error={displayState() === 'error'} class:pending={displayState() === 'pending'} class:synced={displayState() === 'synced'}></div>
          <span class="status-label">{statusLabel()}</span>
          {#if formattedLastSync() && displayState() !== 'syncing'}
            <span class="last-sync">{formattedLastSync()}</span>
          {/if}
        </div>

        <!-- Status Description -->
        <p class="tooltip-description">{statusDescription()}</p>

        <!-- Error Details (expandable) -->
        {#if displayState() === 'error' && lastErrorDetails && lastErrorDetails !== lastError}
          <button
            class="details-toggle"
            onclick={(e) => { e.stopPropagation(); showDetails = !showDetails; }}
          >
            <span>{showDetails ? 'Hide' : 'Show'} details</span>
            <svg
              class="chevron"
              class:expanded={showDetails}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {#if showDetails}
            <div class="error-details">
              <code>{lastErrorDetails}</code>
            </div>
          {/if}
        {/if}

        <!-- Action hint -->
        {#if displayState() === 'error' || displayState() === 'pending'}
          <div class="tooltip-action">
            <span class="action-hint">Tap to sync now</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .sync-wrapper {
    position: relative;
    display: inline-flex;
  }

  .sync-indicator {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg,
      rgba(20, 20, 40, 0.9) 0%,
      rgba(15, 15, 32, 0.95) 100%);
    border: 1.5px solid rgba(108, 92, 231, 0.25);
    cursor: pointer;
    transition: all 0.4s var(--ease-spring);
    flex-shrink: 0;
  }

  .sync-indicator:disabled {
    cursor: default;
  }

  .sync-indicator:not(:disabled):hover {
    transform: scale(1.1);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .sync-indicator:not(:disabled):active {
    transform: scale(0.95);
  }

  /* The animated ring around the indicator */
  .indicator-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid transparent;
    transition: all 0.4s var(--ease-smooth);
  }

  .indicator-core {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all 0.3s var(--ease-smooth);
  }

  /* Synced state - green glow */
  .sync-indicator.synced {
    border-color: rgba(38, 222, 129, 0.3);
  }

  .sync-indicator.synced .indicator-core {
    color: var(--color-green);
  }

  .sync-indicator.synced .indicator-ring {
    border-color: rgba(38, 222, 129, 0.2);
    animation: ringPulseGreen 3s ease-in-out infinite;
  }

  @keyframes ringPulseGreen {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
      border-color: rgba(38, 222, 129, 0.2);
    }
    50% {
      transform: scale(1.15);
      opacity: 0;
      border-color: rgba(38, 222, 129, 0.4);
    }
  }

  /* Syncing state - purple spinning */
  .sync-indicator.syncing {
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .sync-indicator.syncing .indicator-core {
    color: var(--color-primary-light);
  }

  .sync-indicator.syncing .indicator-ring {
    border-color: var(--color-primary);
    border-top-color: transparent;
    animation: ringSpinPurple 1s linear infinite;
  }

  @keyframes ringSpinPurple {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spin {
    animation: iconSpin 1s linear infinite;
  }

  @keyframes iconSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Pending state - needs attention */
  .sync-indicator.pending {
    border-color: rgba(108, 92, 231, 0.4);
  }

  .sync-indicator.pending .indicator-core {
    color: var(--color-primary-light);
  }

  .sync-indicator.pending:not(:disabled):hover {
    box-shadow: 0 0 25px var(--color-primary-glow);
  }

  .pending-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: var(--gradient-primary);
    color: white;
    font-size: 10px;
    font-weight: 700;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }

  /* Error state - red alert */
  .sync-indicator.error {
    border-color: rgba(255, 107, 107, 0.5);
    animation: errorShake 0.5s ease-in-out;
  }

  .sync-indicator.error .indicator-core {
    color: var(--color-red);
  }

  .sync-indicator.error .indicator-ring {
    border-color: rgba(255, 107, 107, 0.3);
    animation: ringPulseRed 1.5s ease-in-out infinite;
  }

  @keyframes ringPulseRed {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0;
    }
  }

  @keyframes errorShake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-3px); }
    40%, 80% { transform: translateX(3px); }
  }

  /* Offline state - yellow warning */
  .sync-indicator.offline {
    border-color: rgba(255, 217, 61, 0.4);
  }

  .sync-indicator.offline .indicator-core {
    color: var(--color-yellow);
  }

  .sync-indicator.offline .indicator-ring {
    border-color: rgba(255, 217, 61, 0.2);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BEAUTIFUL TOOLTIP
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .tooltip {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    z-index: 1000;
    pointer-events: auto;
    animation: tooltipFadeIn 0.25s var(--ease-spring);
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .tooltip-arrow {
    position: absolute;
    top: -6px;
    right: 16px;
    width: 12px;
    height: 12px;
    background: rgba(20, 20, 35, 0.98);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-bottom: none;
    border-right: none;
    transform: rotate(45deg);
    border-radius: 2px 0 0 0;
  }

  .tooltip.error .tooltip-arrow {
    border-color: rgba(255, 107, 107, 0.3);
  }

  .tooltip-content {
    min-width: 240px;
    max-width: 300px;
    padding: 14px 16px;
    background: linear-gradient(145deg,
      rgba(20, 20, 35, 0.98) 0%,
      rgba(15, 15, 28, 0.99) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: 16px;
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 1px 0 rgba(255, 255, 255, 0.05) inset;
  }

  .tooltip.error .tooltip-content {
    border-color: rgba(255, 107, 107, 0.3);
    background: linear-gradient(145deg,
      rgba(35, 18, 22, 0.98) 0%,
      rgba(25, 15, 18, 0.99) 100%);
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-muted);
    flex-shrink: 0;
  }

  .status-dot.synced {
    background: var(--color-green);
    box-shadow: 0 0 8px rgba(38, 222, 129, 0.5);
  }

  .status-dot.syncing {
    background: var(--color-primary);
    box-shadow: 0 0 8px var(--color-primary-glow);
    animation: dotPulse 1s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.85); }
  }

  .status-dot.error {
    background: var(--color-red);
    box-shadow: 0 0 8px rgba(255, 107, 107, 0.5);
  }

  .status-dot.pending {
    background: var(--color-primary);
    box-shadow: 0 0 8px var(--color-primary-glow);
  }

  .status-dot.offline {
    background: var(--color-yellow);
    box-shadow: 0 0 8px rgba(255, 217, 61, 0.5);
  }

  .status-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  .last-sync {
    margin-left: auto;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .tooltip-description {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-text-muted);
    margin: 0;
  }

  .tooltip.error .tooltip-description {
    color: rgba(255, 150, 150, 0.9);
  }

  .tooltip-action {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .tooltip.error .tooltip-action {
    border-top-color: rgba(255, 107, 107, 0.2);
  }

  .action-hint {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-primary-light);
    letter-spacing: 0.01em;
  }

  .tooltip.error .action-hint {
    color: rgba(255, 150, 150, 0.9);
  }

  .tooltip-action svg {
    color: var(--color-primary-light);
    opacity: 0.7;
  }

  .tooltip.error .tooltip-action svg {
    color: rgba(255, 150, 150, 0.9);
  }

  /* Error Details */
  .details-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 0;
    background: none;
    border: none;
    font-size: 0.6875rem;
    font-weight: 600;
    color: rgba(255, 150, 150, 0.7);
    cursor: pointer;
    transition: color 0.2s;
  }

  .details-toggle:hover {
    color: rgba(255, 150, 150, 1);
  }

  .chevron {
    transition: transform 0.2s var(--ease-out);
  }

  .chevron.expanded {
    transform: rotate(180deg);
  }

  .error-details {
    margin-top: 8px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 107, 107, 0.2);
    border-radius: 8px;
    animation: detailsSlideIn 0.2s var(--ease-out);
  }

  @keyframes detailsSlideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-details code {
    display: block;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.6875rem;
    line-height: 1.5;
    color: rgba(255, 180, 180, 0.9);
    word-break: break-word;
    white-space: pre-wrap;
  }

  /* Mobile optimization */
  @media (max-width: 640px) {
    .sync-indicator {
      width: 40px;
      height: 40px;
    }

    .tooltip {
      right: -8px;
      min-width: 220px;
    }

    .tooltip-arrow {
      right: 20px;
    }

    .tooltip-content {
      padding: 12px 14px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .tooltip {
      animation: none;
    }

    .status-dot.syncing {
      animation: none;
    }

    .sync-indicator.syncing .indicator-ring,
    .sync-indicator.synced .indicator-ring,
    .sync-indicator.error .indicator-ring {
      animation: none;
    }

    .spin {
      animation: none;
    }

    .sync-indicator.error {
      animation: none;
    }
  }
</style>
