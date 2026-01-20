<script lang="ts">
  import { browser } from '$app/environment';

  let showPrompt = $state(false);
  let newVersion = $state<string | null>(null);

  if (browser) {
    // Listen for service worker update messages
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        newVersion = event.data.version || 'new';
        showPrompt = true;
      }
    });

    // Also check for waiting service worker on load
    navigator.serviceWorker?.ready.then((registration) => {
      if (registration.waiting) {
        showPrompt = true;
      }

      // Listen for new service worker becoming available
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is ready but waiting
              showPrompt = true;
            }
          });
        }
      });
    });

    // Check for updates periodically (every 5 minutes)
    setInterval(() => {
      navigator.serviceWorker?.ready.then((registration) => {
        registration.update();
      });
    }, 5 * 60 * 1000);
  }

  function handleRefresh() {
    showPrompt = false;
    // Force reload from server
    window.location.reload();
  }

  function handleDismiss() {
    showPrompt = false;
  }
</script>

{#if showPrompt}
  <div class="update-prompt">
    <div class="update-content">
      <span class="update-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
          <path d="M21 3v6h-6"/>
        </svg>
      </span>
      <span class="update-text">A new version is available</span>
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
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: slideUp 0.3s ease-out;
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
    gap: 0.5rem;
  }

  .update-icon {
    color: var(--color-primary);
    display: flex;
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .update-text {
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .update-actions {
    display: flex;
    gap: 0.5rem;
  }

  .update-btn {
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .update-btn:hover {
    opacity: 0.9;
  }

  .update-btn.dismiss {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-muted);
  }

  .update-btn.refresh {
    background-color: var(--color-primary);
    color: white;
  }

  @media (max-width: 480px) {
    .update-prompt {
      max-width: calc(100% - 2rem);
    }
  }
</style>
