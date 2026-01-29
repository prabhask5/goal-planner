<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  let showPrompt = $state(false);

  onMount(() => {
    if (!browser || !navigator.serviceWorker) return;

    // Function to check for waiting worker
    function checkForWaitingWorker() {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting) {
          console.log('[UpdatePrompt] Found waiting service worker');
          showPrompt = true;
        }
      });
    }

    // Check immediately on mount
    checkForWaitingWorker();

    // Also check after a short delay (iOS PWA sometimes needs this)
    setTimeout(checkForWaitingWorker, 1000);
    setTimeout(checkForWaitingWorker, 3000);

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_INSTALLED') {
        console.log('[UpdatePrompt] Received SW_INSTALLED message');
        // Small delay to ensure the worker is in waiting state
        setTimeout(checkForWaitingWorker, 500);
      }
    });

    // Listen for new service worker becoming available
    navigator.serviceWorker.ready.then((registration) => {
      // Check if there's already a waiting worker
      if (registration.waiting) {
        console.log('[UpdatePrompt] Waiting worker found on ready');
        showPrompt = true;
      }

      // Listen for update found
      registration.addEventListener('updatefound', () => {
        console.log('[UpdatePrompt] Update found');
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            console.log('[UpdatePrompt] New worker state:', newWorker.state);
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is ready but waiting
              showPrompt = true;
            }
          });
        }
      });
    });

    // Check for updates when app becomes visible (critical for iOS PWA)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[UpdatePrompt] App became visible, checking for updates');
        navigator.serviceWorker.ready.then((registration) => {
          registration.update();
        });
        // Also check for waiting worker
        setTimeout(checkForWaitingWorker, 1000);
      }
    });

    // Check for updates periodically (every 2 minutes)
    setInterval(
      () => {
        navigator.serviceWorker.ready.then((registration) => {
          registration.update();
        });
      },
      2 * 60 * 1000
    );

    // Force an update check on page load
    navigator.serviceWorker.ready.then((registration) => {
      registration.update();
    });
  });

  async function handleRefresh() {
    showPrompt = false;

    // Tell the waiting service worker to take over
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.waiting) {
      // Listen for the new SW to take control, then reload
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.location.reload();
        },
        { once: true }
      );

      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // No waiting worker, just reload
      window.location.reload();
    }
  }

  function handleDismiss() {
    showPrompt = false;
  }
</script>

<!-- Update prompt is now mostly automatic, but keep UI as fallback -->
{#if showPrompt}
  <div class="update-prompt">
    <div class="update-content">
      <span class="update-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
          <path d="M21 3v6h-6" />
        </svg>
      </span>
      <span class="update-text">A new version of this page is available</span>
    </div>
    <div class="update-actions">
      <button class="update-btn dismiss" onclick={handleDismiss}>Later</button>
      <button class="update-btn refresh" onclick={handleRefresh}>Refresh</button>
    </div>
  </div>
{/if}

<style>
  .update-prompt {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1rem 1.5rem;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.95) 0%, rgba(26, 26, 46, 0.85) 100%);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(108, 92, 231, 0.4);
    border-radius: var(--radius-xl);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(108, 92, 231, 0.2);
    z-index: 1000;
    animation: slideUp 0.4s var(--ease-bounce);
  }

  .update-prompt::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(108, 92, 231, 0.5), transparent);
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  .update-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .update-icon {
    color: var(--color-primary);
    display: flex;
    animation: spin 2s linear infinite;
    filter: drop-shadow(0 0 8px var(--color-primary));
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .update-text {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .update-actions {
    display: flex;
    gap: 0.625rem;
  }

  .update-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s var(--ease-smooth);
  }

  .update-btn:hover {
    transform: translateY(-2px);
  }

  .update-btn.dismiss {
    background: rgba(37, 37, 61, 0.8);
    color: var(--color-text-muted);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .update-btn.dismiss:hover {
    background: rgba(37, 37, 61, 1);
    border-color: rgba(108, 92, 231, 0.4);
  }

  .update-btn.refresh {
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 15px var(--color-primary-glow);
  }

  .update-btn.refresh:hover {
    box-shadow: 0 6px 25px var(--color-primary-glow);
  }

  @media (max-width: 640px) {
    .update-prompt {
      left: 1rem;
      right: 1rem;
      transform: none;
      width: auto;
      padding: 0.875rem 1rem;
      gap: 0.75rem;
    }

    .update-content {
      flex: 1;
      min-width: 0;
    }

    .update-text {
      font-size: 0.8125rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .update-actions {
      flex-shrink: 0;
    }

    .update-btn {
      padding: 0.5rem 0.875rem;
      font-size: 0.75rem;
    }
  }

  @keyframes slideUpMobile {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .update-prompt {
      animation: slideUpMobile 0.4s var(--ease-bounce);
    }
  }
</style>
