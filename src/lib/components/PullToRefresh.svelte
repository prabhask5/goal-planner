<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { performSync } from '$lib/sync/engine';
  import { invalidateAll } from '$app/navigation';

  interface Props {
    disabled?: boolean;
  }

  let { disabled = false }: Props = $props();

  let pullDistance = $state(0);
  let isPulling = $state(false);
  let isRefreshing = $state(false);
  let startY = 0;
  let currentY = 0;

  // Physics constants - balanced sensitivity
  const PULL_THRESHOLD = 55;
  const MAX_PULL = 120;
  const RESISTANCE = 0.6;

  function snapBack() {
    const animate = () => {
      if (pullDistance <= 1) {
        pullDistance = 0;
        isRefreshing = false;
        return;
      }
      pullDistance *= 0.85;
      requestAnimationFrame(animate);
    };
    animate();
  }

  function handleTouchStart(e: TouchEvent) {
    if (disabled || isRefreshing) return;

    // Only activate if at top of page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5) return;

    startY = e.touches[0].clientY;
    isPulling = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isPulling || disabled || isRefreshing) return;

    currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    if (delta > 0) {
      // Apply resistance as you pull further
      const progress = delta / MAX_PULL;
      const resistedDelta = delta * RESISTANCE * (1 - progress * 0.5);
      pullDistance = Math.min(resistedDelta, MAX_PULL);

      // Prevent scroll when pulling
      if (pullDistance > 10) {
        e.preventDefault();
      }
    }
  }

  function handleTouchEnd() {
    if (!isPulling || disabled) return;
    isPulling = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      triggerRefresh();
    } else if (!isRefreshing) {
      snapBack();
    }
  }

  async function triggerRefresh() {
    isRefreshing = true;
    // Hold at refresh position
    pullDistance = 50;

    try {
      // Sync data first
      await performSync();
      // Invalidate all SvelteKit data to refresh the page
      await invalidateAll();
      // Small delay then snap back
      setTimeout(() => {
        snapBack();
      }, 300);
    } catch (error) {
      console.error('Refresh failed:', error);
      snapBack();
    }
  }

  onMount(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
  });

  onDestroy(() => {
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  });

  // Computed values
  const progress = $derived(Math.min(pullDistance / PULL_THRESHOLD, 1));
  const isReady = $derived(pullDistance >= PULL_THRESHOLD);
  const rotation = $derived(progress * 180);
</script>

<!-- Simple, visible pull-to-refresh indicator -->
{#if pullDistance > 0 || isRefreshing}
  <div
    class="ptr-container"
    class:ready={isReady}
    class:refreshing={isRefreshing}
    style="--pull: {pullDistance}px; --progress: {progress};"
  >
    <div class="ptr-indicator">
      <!-- Spinner/Arrow icon -->
      <div class="ptr-icon" style="transform: rotate({isRefreshing ? 0 : rotation}deg)">
        {#if isRefreshing}
          <svg class="spinner" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-opacity="0.2"/>
            <path d="M22 12a10 10 0 1 1-7-9.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        {:else}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M12 3v12M5 10l7-7 7 7"/>
          </svg>
        {/if}
      </div>

      <!-- Status text -->
      <span class="ptr-text">
        {#if isRefreshing}
          Refreshing...
        {:else if isReady}
          Release to refresh
        {:else}
          Pull to refresh
        {/if}
      </span>
    </div>
  </div>
{/if}

<style>
  .ptr-container {
    position: fixed;
    /* Position clearly visible below the island header */
    top: calc(env(safe-area-inset-top, 47px) + 28px);
    left: 0;
    right: 0;
    z-index: 140;
    display: flex;
    justify-content: center;
    pointer-events: none;
    /* Translate down based on pull distance */
    transform: translateY(calc(var(--pull) * 0.3));
    opacity: var(--progress);
    transition: opacity 0.15s ease-out;
  }

  .ptr-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    background: linear-gradient(145deg,
      rgba(20, 20, 40, 0.95) 0%,
      rgba(12, 12, 28, 0.98) 100%);
    border: 1.5px solid rgba(108, 92, 231, 0.3);
    border-radius: 50px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    transform: scale(calc(0.8 + var(--progress) * 0.2));
    transition: transform 0.2s ease-out, border-color 0.2s, box-shadow 0.2s;
  }

  .ready .ptr-indicator {
    border-color: rgba(38, 222, 129, 0.5);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 30px rgba(38, 222, 129, 0.2),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  .refreshing .ptr-indicator {
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 30px rgba(108, 92, 231, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  .ptr-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary-light);
    transition: transform 0.1s ease-out, color 0.2s;
  }

  .ready .ptr-icon {
    color: var(--color-green);
    transform: rotate(180deg) !important;
  }

  .refreshing .ptr-icon {
    color: var(--color-primary-light);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .ptr-text {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
    transition: color 0.2s;
  }

  .ready .ptr-text {
    color: var(--color-green);
  }

  .refreshing .ptr-text {
    color: var(--color-primary-light);
  }

  /* Hide on desktop */
  @media (min-width: 641px) {
    .ptr-container {
      display: none;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }

    .ptr-container,
    .ptr-indicator {
      transition: none;
    }
  }
</style>
