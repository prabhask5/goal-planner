<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  let isOffline = $state(false);

  $effect(() => {
    if (browser) {
      isOffline = !navigator.onLine;

      const handleOnline = () => {
        isOffline = false;
      };
      const handleOffline = () => {
        isOffline = true;
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  });

  function handleRetry() {
    window.location.reload();
  }

  function handleGoHome() {
    goto('/');
  }
</script>

<div class="error-page">
  <div class="error-container glass-card">
    <div class="error-icon">
      {#if isOffline}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
      {:else if $page.status === 404}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
          ></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      {/if}
    </div>

    <h1 class="error-title">
      {#if isOffline}
        You're Offline
      {:else if $page.status === 404}
        Page Not Found
      {:else}
        Something Went Wrong
      {/if}
    </h1>

    <p class="error-message">
      {#if isOffline}
        This page isn't available offline. Please check your connection and try again.
      {:else if $page.status === 404}
        The page you're looking for doesn't exist or has been moved.
      {:else}
        {$page.error?.message || 'An unexpected error occurred. Please try again.'}
      {/if}
    </p>

    <div class="error-actions">
      {#if isOffline}
        <button class="btn btn-primary" onclick={handleRetry}> Try Again </button>
      {:else}
        <button class="btn btn-secondary" onclick={handleRetry}> Refresh Page </button>
      {/if}
      <button class="btn btn-ghost" onclick={handleGoHome}> Go Home </button>
    </div>

    {#if !isOffline && $page.status !== 404}
      <p class="error-hint">
        If this problem persists, try refreshing the page or clearing your browser cache.
      </p>
    {/if}
  </div>
</div>

<style>
  .error-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: var(--bg-primary);
  }

  .error-container {
    max-width: 420px;
    width: 100%;
    padding: var(--space-8);
    text-align: center;
  }

  .error-icon {
    color: var(--text-tertiary);
    margin-bottom: var(--space-4);
  }

  .error-icon svg {
    width: 64px;
    height: 64px;
  }

  .error-title {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2);
  }

  .error-message {
    color: var(--text-secondary);
    margin: 0 0 var(--space-6);
    line-height: 1.5;
  }

  .error-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .error-hint {
    margin-top: var(--space-6);
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
  }
</style>
