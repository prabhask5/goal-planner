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
  let isMouseOver = $state(false);

  // Track previous state for transitions
  let prevDisplayState = $state<string>('idle');
  let isTransitioning = $state(false);

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
    isMouseOver = true;
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      if (isMouseOver) {
        showTooltip = true;
      }
    }, 200);
  }

  function handleMouseLeave() {
    isMouseOver = false;
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      if (!isMouseOver) {
        showTooltip = false;
        showDetails = false;
      }
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

  // Track state changes for transitions
  $effect(() => {
    const current = displayState();
    if (current !== prevDisplayState) {
      // Trigger transition animation when changing from syncing to another state
      if (prevDisplayState === 'syncing' && (current === 'synced' || current === 'error')) {
        isTransitioning = true;
        setTimeout(() => {
          isTransitioning = false;
        }, 600);
      }
      prevDisplayState = current;
    }
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
  role="status"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <button
    class="sync-indicator"
    class:offline={displayState() === 'offline'}
    class:syncing={displayState() === 'syncing'}
    class:error={displayState() === 'error'}
    class:pending={displayState() === 'pending'}
    class:synced={displayState() === 'synced'}
    class:transitioning={isTransitioning}
    onclick={handleSyncClick}
    disabled={!online || status === 'syncing'}
    aria-label={statusLabel()}
  >
    <span class="indicator-ring"></span>

    <!-- Morphing Icon Container -->
    <span class="indicator-core">
      <!-- Offline Icon -->
      <svg
        class="icon icon-offline"
        class:active={displayState() === 'offline'}
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      >
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>

      <!-- Syncing Spinner -->
      <svg
        class="icon icon-syncing"
        class:active={displayState() === 'syncing'}
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
      >
        <circle class="spinner-track" cx="12" cy="12" r="9" stroke-opacity="0.2"/>
        <path class="spinner-arc" d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>

      <!-- Success Checkmark -->
      <svg
        class="icon icon-synced"
        class:active={displayState() === 'synced'}
        class:morph-in={isTransitioning && displayState() === 'synced'}
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      >
        <circle class="check-circle" cx="12" cy="12" r="9"/>
        <polyline class="check-mark" points="8 12 11 15 16 9"/>
      </svg>

      <!-- Error Icon -->
      <svg
        class="icon icon-error"
        class:active={displayState() === 'error'}
        class:morph-in={isTransitioning && displayState() === 'error'}
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
      >
        <circle class="error-circle" cx="12" cy="12" r="9"/>
        <line class="error-line" x1="12" y1="8" x2="12" y2="12"/>
        <line class="error-dot" x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>

      <!-- Pending Icon -->
      <svg
        class="icon icon-pending"
        class:active={displayState() === 'pending'}
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
      >
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
    </span>

    {#if displayState() === 'pending'}
      <span class="pending-badge">{pendingCount}</span>
    {/if}
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

  /* Transition pulse effect */
  .sync-indicator.transitioning {
    animation: transitionPulse 0.6s var(--ease-spring);
  }

  @keyframes transitionPulse {
    0% { transform: scale(1); }
    30% { transform: scale(1.15); }
    100% { transform: scale(1); }
  }

  /* The animated ring around the indicator */
  .indicator-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid transparent;
    transition: all 0.4s var(--ease-smooth);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MORPHING ICON SYSTEM
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .indicator-core {
    position: relative;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Base icon styles - all icons are absolutely positioned and transition */
  .icon {
    position: absolute;
    opacity: 0;
    transform: scale(0.5) rotate(-90deg);
    transition:
      opacity 0.35s var(--ease-spring),
      transform 0.45s var(--ease-spring);
    color: var(--color-text-muted);
  }

  .icon.active {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SYNCING STATE - Spinning animation
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .sync-indicator.syncing {
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .icon-syncing {
    color: var(--color-primary-light);
  }

  .icon-syncing.active {
    animation: spinnerRotate 1s linear infinite;
  }

  .spinner-arc {
    stroke-dasharray: 45;
    stroke-dashoffset: 0;
  }

  @keyframes spinnerRotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SYNCED STATE - Checkmark with draw animation
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .sync-indicator.synced {
    border-color: rgba(38, 222, 129, 0.3);
  }

  .icon-synced {
    color: var(--color-green);
  }

  .icon-synced .check-circle {
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    transition: stroke-dashoffset 0.4s var(--ease-out) 0.1s;
  }

  .icon-synced .check-mark {
    stroke-dasharray: 20;
    stroke-dashoffset: 20;
    transition: stroke-dashoffset 0.3s var(--ease-out) 0.35s;
  }

  .icon-synced.active .check-circle {
    stroke-dashoffset: 0;
  }

  .icon-synced.active .check-mark {
    stroke-dashoffset: 0;
  }

  /* Morph-in animation from spinner */
  .icon-synced.morph-in {
    animation: morphInSuccess 0.5s var(--ease-spring);
  }

  @keyframes morphInSuccess {
    0% {
      transform: scale(0.8) rotate(-180deg);
      opacity: 0;
    }
    50% {
      transform: scale(1.1) rotate(10deg);
      opacity: 1;
    }
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ERROR STATE - With shake and draw animation
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .sync-indicator.error {
    border-color: rgba(255, 107, 107, 0.5);
  }

  .icon-error {
    color: var(--color-red);
  }

  .icon-error .error-circle {
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    transition: stroke-dashoffset 0.4s var(--ease-out) 0.1s;
  }

  .icon-error .error-line {
    stroke-dasharray: 10;
    stroke-dashoffset: 10;
    transition: stroke-dashoffset 0.2s var(--ease-out) 0.35s;
  }

  .icon-error .error-dot {
    opacity: 0;
    transition: opacity 0.2s var(--ease-out) 0.5s;
  }

  .icon-error.active .error-circle {
    stroke-dashoffset: 0;
  }

  .icon-error.active .error-line {
    stroke-dashoffset: 0;
  }

  .icon-error.active .error-dot {
    opacity: 1;
  }

  /* Morph-in animation from spinner */
  .icon-error.morph-in {
    animation: morphInError 0.5s var(--ease-spring);
  }

  @keyframes morphInError {
    0% {
      transform: scale(0.8) rotate(180deg);
      opacity: 0;
    }
    40% {
      transform: scale(1.15) rotate(-10deg);
      opacity: 1;
    }
    60% {
      transform: scale(1) rotate(5deg);
    }
    80% {
      transform: scale(1.05) rotate(-3deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PENDING STATE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .sync-indicator.pending {
    border-color: rgba(108, 92, 231, 0.4);
  }

  .icon-pending {
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
    animation: badgePop 0.3s var(--ease-spring);
  }

  @keyframes badgePop {
    0% { transform: scale(0); }
    70% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     OFFLINE STATE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .sync-indicator.offline {
    border-color: rgba(255, 217, 61, 0.4);
  }

  .icon-offline {
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
    transition: all 0.3s var(--ease-spring);
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

    .icon-syncing.active {
      animation: none;
    }

    .icon-synced.morph-in,
    .icon-error.morph-in {
      animation: none;
    }

    .sync-indicator.transitioning {
      animation: none;
    }

    .icon {
      transition: opacity 0.2s ease;
      transform: scale(1) rotate(0deg);
    }

    .icon.active {
      transform: scale(1) rotate(0deg);
    }
  }
</style>
