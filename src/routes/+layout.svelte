<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { signOut, getUserProfile, getSession, signIn } from '$lib/supabase/auth';
  import { stopSyncEngine, clearLocalCache, clearPendingSyncQueue, markAuthValidated, runFullSync, needsAuthValidation } from '$lib/sync/engine';
  import { getOfflineCredentials, clearOfflineCredentials } from '$lib/auth/offlineCredentials';
  import { syncStatusStore } from '$lib/stores/sync';
  import { authState, userDisplayInfo } from '$lib/stores/authState';
  import { clearOfflineSession } from '$lib/auth/offlineSession';
  import { setReconnectHandler } from '$lib/auth/reconnectHandler';
  import type { LayoutData } from './+layout';
  import SyncStatus from '$lib/components/SyncStatus.svelte';
  import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';

  interface Props {
    children?: import('svelte').Snippet;
    data: LayoutData;
  }

  let { children, data }: Props = $props();

  // Toast state for notifications
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'info' | 'error'>('info');

  // Signing out state - used to hide navbar immediately during sign out
  let isSigningOut = $state(false);

  // Reference for cleanup
  let chunkErrorHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  // Initialize auth state from layout data
  $effect(() => {
    if (data.authMode === 'supabase' && data.session) {
      authState.setSupabaseAuth(data.session);
    } else if (data.authMode === 'offline' && data.offlineProfile) {
      authState.setOfflineAuth(data.offlineProfile);
    } else {
      authState.setNoAuth();
    }
  });

  // Handle reconnection - validate auth BEFORE allowing sync
  // SECURITY: This is critical - we must verify cached credentials (email AND password)
  // are still valid with Supabase before allowing any pending changes to sync to the database
  async function handleReconnectAuthCheck(): Promise<void> {
    // Check if the sync engine needs auth validation (was offline at some point)
    if (!needsAuthValidation()) {
      // Was online the whole time - mark as validated and allow sync
      markAuthValidated();
      return;
    }

    console.log('[Auth] Reconnected from offline mode - validating credentials BEFORE sync');

    try {
      // Get cached credentials to validate with Supabase
      const credentials = await getOfflineCredentials();

      if (!credentials) {
        console.error('[Auth] No cached credentials found - cannot validate');
        await handleInvalidAuth('No cached credentials found. Please sign in again.');
        return;
      }

      if (!credentials.email || !credentials.password) {
        console.error('[Auth] Cached credentials missing email or password');
        await handleInvalidAuth('Invalid cached credentials. Please sign in again.');
        return;
      }

      // SECURITY: Actually re-authenticate with Supabase using cached email and password
      // This ensures the password hasn't been changed while the user was offline
      console.log('[Auth] Re-authenticating with Supabase using cached credentials...');

      // Add timeout to prevent hanging on flaky network
      const SESSION_TIMEOUT_MS = 15000;
      const authResult = await Promise.race([
        signIn(credentials.email, credentials.password),
        new Promise<{ session: null; error: string }>((resolve) => setTimeout(() => {
          console.warn('[Auth] Re-authentication timed out');
          resolve({ session: null, error: 'timeout' });
        }, SESSION_TIMEOUT_MS))
      ]);

      if (authResult.session) {
        // SUCCESS: Email and password are still valid with Supabase
        console.log('[Auth] Credentials validated with Supabase - allowing sync');
        await clearOfflineSession();
        authState.setSupabaseAuth(authResult.session);
        markAuthValidated();

        // Now trigger the sync that was waiting
        runFullSync(false);
      } else {
        // FAILURE: Credentials are invalid (password may have been changed)
        // SECURITY: Cancel all pending syncs to prevent unauthorized data modification
        console.error('[Auth] Credential validation failed:', authResult.error);
        await handleInvalidAuth('Your credentials may have changed while you are offline. Please sign in again.');
      }
    } catch (e) {
      console.error('[Auth] Error validating credentials on reconnect:', e);
      await handleInvalidAuth('Failed to validate credentials. Please sign in again.');
    }
  }

  // Handle invalid auth: clear everything and kick user to login
  async function handleInvalidAuth(message: string): Promise<void> {
    // SECURITY: Clear pending sync queue to prevent unauthorized data sync
    const clearedCount = await clearPendingSyncQueue();
    console.log(`[Auth] Cleared ${clearedCount} pending sync operations due to invalid auth`);

    // Clear offline session (credentials cleared by signOut below)
    await clearOfflineSession();

    // Sign out from Supabase and clear stale offline credentials
    // (credentials are invalid, so don't preserve them)
    await signOut({ preserveOfflineCredentials: false });

    // Also clear Supabase localStorage as backup (in case signOut fails)
    try {
      const supabaseKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
      supabaseKeys.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.error('[Auth] Failed to clear Supabase localStorage:', e);
    }

    // Update auth state
    authState.setNoAuth(message);

    // Show toast and redirect to login
    toastMessage = message;
    toastType = 'error';
    showToast = true;

    setTimeout(() => {
      showToast = false;
      goto('/login');
    }, 3000);
  }

  const AUTH_CHANNEL_NAME = 'stellar-auth-channel';
  let authChannel: BroadcastChannel | null = null;

  onMount(() => {
    // Handle chunk loading failures during offline navigation
    // When navigating offline to a page whose JS chunks aren't cached,
    // the dynamic import fails and shows a cryptic error. Catch and show a friendly message.
    chunkErrorHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      // Check if this is a chunk loading error (fetch failed or syntax error from 503 response)
      const isChunkError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('error loading dynamically imported module') ||
        error?.message?.includes('Importing a module script failed') ||
        (error?.name === 'ChunkLoadError') ||
        (error?.message?.includes('Loading chunk') && error?.message?.includes('failed'));

      if (isChunkError && !navigator.onLine) {
        event.preventDefault(); // Prevent default error handling
        // Show offline navigation toast
        toastMessage = "This page isn't available offline. Please reconnect or go back.";
        toastType = 'info';
        showToast = true;
        setTimeout(() => { showToast = false; }, 5000);
      }
    };

    window.addEventListener('unhandledrejection', chunkErrorHandler);

    // Register reconnect handler
    setReconnectHandler(handleReconnectAuthCheck);

    // Listen for focus requests from confirmation page
    // This allows the confirmation tab to communicate with any open Stellar tab
    if ('BroadcastChannel' in window) {
      authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);

      authChannel.onmessage = async (event) => {
        if (event.data.type === 'FOCUS_REQUEST') {
          // Respond that this tab is present
          authChannel?.postMessage({ type: 'TAB_PRESENT' });
          // Focus this window/tab
          window.focus();
          // If auth was just confirmed, handle the auth state update
          if (event.data.authConfirmed) {
            // The login page has its own handler that navigates to home
            // For other pages, we need to check auth and navigate/reload appropriately
            const isOnLoginPage = window.location.pathname.startsWith('/login');
            if (!isOnLoginPage) {
              // On protected pages, reload to refresh auth state
              window.location.reload();
            }
            // Login page handles its own navigation via its own BroadcastChannel listener
          }
        }
      };
    }

    // Proactively cache all app chunks for full offline support
    // This runs in the background after page load, so it doesn't affect Lighthouse scores
    if ('serviceWorker' in navigator) {
      // Listen for precache completion messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PRECACHE_COMPLETE') {
          const { cached, total } = event.data;
          console.log(`[PWA] Background precaching complete: ${cached}/${total} assets cached`);
          if (cached === total) {
            console.log('[PWA] Full offline support ready - all pages accessible offline');
          } else {
            console.warn(`[PWA] Some assets failed to cache: ${total - cached} missing`);
          }
        }
      });

      // Wait for service worker to be ready (handles first load case)
      navigator.serviceWorker.ready.then((registration) => {
        console.log('[PWA] Service worker ready, scheduling background precache...');

        // Give the page time to fully load, then trigger background precaching
        setTimeout(() => {
          const controller = navigator.serviceWorker.controller || registration.active;
          if (!controller) {
            console.warn('[PWA] No service worker controller available');
            return;
          }

          // First, cache current page's assets
          const scripts = Array.from(document.querySelectorAll('script[src]'))
            .map((el) => (el as HTMLScriptElement).src)
            .filter((src) => src.startsWith(location.origin));

          const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((el) => (el as HTMLLinkElement).href)
            .filter((href) => href.startsWith(location.origin));

          const urls = [...scripts, ...styles];

          if (urls.length > 0) {
            console.log(`[PWA] Caching ${urls.length} current page assets...`);
            controller.postMessage({
              type: 'CACHE_URLS',
              urls
            });
          }

          // Then trigger full background precaching for all app chunks
          // This ensures offline support for all pages, not just visited ones
          console.log('[PWA] Triggering background precache of all app chunks...');
          controller.postMessage({
            type: 'PRECACHE_ALL'
          });
        }, 2000); // Wait 2 seconds after page load for better UX
      });
    }
  });

  onDestroy(() => {
    // Cleanup chunk error handler
    if (chunkErrorHandler) {
      window.removeEventListener('unhandledrejection', chunkErrorHandler);
    }
    // Cleanup reconnect handler
    setReconnectHandler(null);
    // Cleanup auth channel
    authChannel?.close();
  });

  // Get user's first name from appropriate source
  const greeting = $derived(() => {
    // Try firstName from auth state
    if ($userDisplayInfo?.firstName) {
      return $userDisplayInfo.firstName;
    }
    // Try firstName from session profile
    if (data.session?.user) {
      const profile = getUserProfile(data.session.user);
      if (profile.firstName) {
        return profile.firstName;
      }
      // Fallback to email username (before @)
      if (data.session.user.email) {
        return data.session.user.email.split('@')[0];
      }
    }
    // Fallback to offline profile
    if (data.offlineProfile?.firstName) {
      return data.offlineProfile.firstName;
    }
    if (data.offlineProfile?.email) {
      return data.offlineProfile.email.split('@')[0];
    }
    return 'there';
  });

  // Check if user is authenticated (either mode)
  // Hide navbar on login page (it has its own full-screen layout)
  // Also hide during initial loading to prevent flicker
  const isOnLoginPage = $derived($page.url.pathname.startsWith('/login'));
  const isOnConfirmPage = $derived($page.url.pathname.startsWith('/confirm'));
  const isAuthPage = $derived(isOnLoginPage || isOnConfirmPage);
  const isAuthenticated = $derived(
    data.authMode !== 'none' &&
    !isAuthPage &&
    !$authState.isLoading
  );

  const navItems = [
    { href: '/tasks', label: 'Tasks', icon: 'tasks', mobileLabel: 'Tasks' },
    { href: '/lists', label: 'Goals', icon: 'goals', mobileLabel: 'Goals' },
    { href: '/calendar', label: 'Routines', icon: 'calendar', mobileLabel: 'Routines' },
    { href: '/focus', label: 'Focus', icon: 'focus', mobileLabel: 'Focus' }
  ];

  async function handleSignOut() {
    // Show full-screen overlay immediately
    isSigningOut = true;

    // Wait for overlay to fully appear
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Do cleanup in background (user sees overlay)
    stopSyncEngine();
    await clearPendingSyncQueue(); // Clear any pending sync operations
    await clearLocalCache();
    localStorage.removeItem('lastSyncTimestamp');
    syncStatusStore.reset();

    // Clear offline session (user must re-authenticate)
    await clearOfflineSession();

    // Only clear offline credentials if ONLINE
    // When offline, keep credentials so user can sign back in with password
    if (navigator.onLine) {
      await clearOfflineCredentials();
    }

    // Sign out from Supabase (pass flag to preserve credentials if offline)
    await signOut({ preserveOfflineCredentials: !navigator.onLine });

    // IMPORTANT: When offline, supabase.auth.signOut() doesn't clear localStorage
    // Manually clear Supabase session storage to prevent stale session being found
    try {
      const supabaseKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
      supabaseKeys.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.error('[Auth] Failed to clear Supabase localStorage:', e);
    }

    // Reset auth state
    authState.reset();

    // Navigate to login - overlay stays visible during navigation
    window.location.href = '/login';
  }

  function isActive(href: string): boolean {
    return $page.url.pathname.startsWith(href);
  }

  function dismissToast() {
    showToast = false;
  }
</script>

<div class="app" class:authenticated={isAuthenticated} class:loading={$authState.isLoading}>
  <!-- Initial Loading State - prevents flash during auth check -->
  {#if $authState.isLoading && !isAuthPage}
    <div class="auth-loading-overlay">
      <div class="auth-loading-spinner"></div>
    </div>
  {/if}

  <!-- Sign Out Overlay - covers everything during sign out -->
  {#if isSigningOut}
    <div class="signout-overlay" transition:fade={{ duration: 200 }}>
      <div class="signout-content">
        <div class="signout-icon">
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="45" stroke="url(#signoutGrad)" stroke-width="5" fill="none"/>
            <path d="M30 52 L45 67 L72 35" stroke="url(#signoutCheck)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <defs>
              <linearGradient id="signoutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6c5ce7"/>
                <stop offset="100%" stop-color="#ff79c6"/>
              </linearGradient>
              <linearGradient id="signoutCheck" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#26de81"/>
                <stop offset="100%" stop-color="#00d4ff"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <p class="signout-text">Signing out...</p>
      </div>
    </div>
  {/if}

  <!-- Toast Notification -->
  {#if showToast}
    <div class="app-toast" class:toast-error={toastType === 'error'}>
      <div class="toast-content">
        {#if toastType === 'error'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        {/if}
        <span>{toastMessage}</span>
        <button class="toast-dismiss" onclick={dismissToast} aria-label="Dismiss notification">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Pull to Refresh for PWA -->
  {#if isAuthenticated}
    <PullToRefresh />
  {/if}

  <!-- iPhone Pro Dynamic Island Status Bar (Mobile Only) -->
  {#if isAuthenticated}
    <header class="island-header">
      <div class="island-left">
        <!-- Brand matches desktop: logo + "Stellar" text -->
        <a href="/" class="island-brand-link">
          <span class="island-brand">
            <svg class="island-logo" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="url(#islandGrad)" stroke-width="6" fill="none"/>
              <path d="M30 52 L45 67 L72 35" stroke="url(#islandCheck)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <defs>
                <linearGradient id="islandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6c5ce7"/>
                  <stop offset="100%" stop-color="#ff79c6"/>
                </linearGradient>
                <linearGradient id="islandCheck" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#26de81"/>
                  <stop offset="100%" stop-color="#00d4ff"/>
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span class="island-brand-text">Stellar</span>
        </a>
      </div>
      <!-- Center gap for Dynamic Island -->
      <div class="island-center"></div>
      <div class="island-right">
        <SyncStatus />
      </div>
    </header>
  {/if}

  <!-- Desktop/Tablet Top Navigation -->
  {#if isAuthenticated}
    <nav class="nav-desktop">
      <div class="nav-inner">
        <!-- Brand -->
        <a href="/" class="nav-brand">
          <span class="brand-icon">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="url(#brandGradient)" stroke-width="6" fill="none"/>
              <path d="M30 52 L45 67 L72 35" stroke="url(#checkGradient)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <defs>
                <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6c5ce7"/>
                  <stop offset="100%" stop-color="#ff79c6"/>
                </linearGradient>
                <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#26de81"/>
                  <stop offset="100%" stop-color="#00d4ff"/>
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span class="brand-text">Stellar</span>
        </a>

        <!-- Center Navigation Links -->
        <div class="nav-center">
          {#each navItems as item}
            <a
              href={item.href}
              class="nav-link"
              class:active={isActive(item.href)}
            >
              <span class="link-icon">
                {#if item.icon === 'tasks'}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                {:else if item.icon === 'goals'}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                {:else if item.icon === 'focus'}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="6"/>
                    <circle cx="12" cy="12" r="2"/>
                  </svg>
                {:else}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                {/if}
              </span>
              <span class="link-text">{item.label}</span>
              {#if isActive(item.href)}
                <span class="active-indicator"></span>
              {/if}
            </a>
          {/each}
        </div>

        <!-- Right Actions -->
        <div class="nav-actions">
          <SyncStatus />
          <a href="/profile" class="user-menu user-menu-link">
            <span class="user-avatar">
              {greeting().charAt(0).toUpperCase()}
            </span>
            <span class="user-greeting">Hey, {greeting()}!</span>
          </a>
          <button class="logout-btn" onclick={handleSignOut} aria-label="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  {:else if !isAuthPage && !isSigningOut && !$authState.isLoading}
    <!-- Unauthenticated header (hidden on login page and during sign out) -->
    <nav class="nav-desktop nav-simple">
      <div class="nav-inner">
        <a href="/" class="nav-brand">
          <span class="brand-icon">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="url(#brandGradient2)" stroke-width="6" fill="none"/>
              <path d="M30 52 L45 67 L72 35" stroke="url(#checkGradient2)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <defs>
                <linearGradient id="brandGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6c5ce7"/>
                  <stop offset="100%" stop-color="#ff79c6"/>
                </linearGradient>
                <linearGradient id="checkGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#26de81"/>
                  <stop offset="100%" stop-color="#00d4ff"/>
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span class="brand-text">Stellar</span>
        </a>
        <div class="nav-simple-actions">
          <a href="/policy" class="nav-text-link">Privacy</a>
          <a href="/login" class="btn btn-primary btn-sm">Get Started</a>
        </div>
      </div>
    </nav>
  {/if}

  <!-- Main Content Area -->
  <main class="main" class:with-bottom-nav={isAuthenticated}>
    {@render children?.()}
  </main>

  <!-- Mobile Bottom Tab Bar (iOS-style) - Redesigned for iPhone 16 Pro -->
  {#if isAuthenticated}
    <nav class="nav-mobile">
      <!-- Floating glass effect background -->
      <div class="nav-mobile-bg"></div>

      <div class="tab-bar">
        {#each navItems as item, index}
          <a
            href={item.href}
            class="tab-item"
            class:active={isActive(item.href)}
            style="--tab-index: {index};"
          >
            <!-- Animated background glow for active state -->
            <span class="tab-glow"></span>

            <span class="tab-icon">
              {#if item.icon === 'tasks'}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              {:else if item.icon === 'goals'}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="6"/>
                  <circle cx="12" cy="12" r="2"/>
                </svg>
              {:else if item.icon === 'focus'}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="6"/>
                  <circle cx="12" cy="12" r="2"/>
                </svg>
              {:else}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              {/if}
            </span>
            <span class="tab-label">{item.mobileLabel}</span>
            {#if isActive(item.href)}
              <span class="tab-active-indicator"></span>
            {/if}
          </a>
        {/each}

        <!-- Profile/Logout - Simplified, no sync status here -->
        <a href="/profile" class="tab-item tab-profile">
          <span class="tab-glow"></span>
          <span class="tab-icon">
            <span class="mobile-avatar">{greeting().charAt(0).toUpperCase()}</span>
          </span>
          <span class="tab-label">Profile</span>
        </a>
      </div>
    </nav>
  {/if}

  <UpdatePrompt />
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     APP SHELL
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .app {
    min-height: 100vh;
    min-height: 100dvh; /* Dynamic viewport height for mobile */
    display: flex;
    flex-direction: column;
  }

  /* Hide content during initial auth check to prevent flicker */
  .app.loading > :not(.auth-loading-overlay) {
    visibility: hidden;
  }

  .auth-loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-primary, #0f0f1a);
  }

  .auth-loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(108, 92, 231, 0.2);
    border-top-color: #6c5ce7;
    border-radius: 50%;
    animation: auth-spin 0.8s linear infinite;
  }

  @keyframes auth-spin {
    to { transform: rotate(360deg); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     IPHONE PRO DYNAMIC ISLAND HEADER (Mobile Only)
     Cinematic redesign for iPhone 16 Pro - respects Dynamic Island and status bar
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .island-header {
    display: none; /* Hidden by default, shown on mobile */
    position: fixed;
    /* Extend into the top safe area to prevent black bar */
    top: calc(-1 * env(safe-area-inset-top, 0px));
    left: 0;
    right: 0;
    z-index: 150;
    /* Height includes the safe area we extended into + content area */
    height: calc(env(safe-area-inset-top, 47px) * 2 + 24px);
    /* Push content below the Dynamic Island */
    padding-top: calc(env(safe-area-inset-top, 47px) * 2);
    /* Transparent gradient to show starfield behind Dynamic Island */
    background: linear-gradient(180deg,
      rgba(5, 5, 16, 0.3) 0%,
      rgba(5, 5, 16, 0.6) 40%,
      rgba(8, 8, 16, 0.85) 70%,
      rgba(8, 8, 16, 0.7) 100%);
    pointer-events: none;
    /* Entry animation */
    animation: islandFadeIn 0.6s var(--ease-out) 0.1s backwards;
  }

  @keyframes islandFadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .island-header > * {
    pointer-events: auto;
  }

  /* Container for the split layout */
  .island-header {
    flex-direction: row;
    /* Center vertically to align brand with SyncStatus */
    align-items: center;
    justify-content: space-between;
    padding-left: max(12px, env(safe-area-inset-left, 12px));
    padding-right: max(12px, env(safe-area-inset-right, 12px));
    padding-bottom: 0;
  }

  /* Left side - Brand (logo + Stellar text, matching desktop) */
  .island-left {
    display: flex;
    align-items: center;
    padding-left: 4px;
    /* Staggered fade in */
    animation: islandItemFadeIn 0.5s var(--ease-out) 0.2s backwards;
  }

  @keyframes islandItemFadeIn {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Brand link container - matches desktop nav-brand style */
  .island-brand-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .island-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    /* Subtle float animation for the brand */
    animation: brandFloatMobile 4s ease-in-out infinite;
  }

  .island-logo {
    width: 38px;
    height: 38px;
  }

  @keyframes brandFloatMobile {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }

  /* Brand text - matches desktop brand-text style */
  .island-brand-text {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    /* Gradient text effect matching desktop */
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: brandTextShimmer 8s linear infinite;
  }

  @keyframes brandTextShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  /* Center gap - Reserved space for Dynamic Island */
  .island-center {
    /* Dynamic Island is ~126px wide on iPhone 14/15/16 Pro */
    /* Add extra margin for visual comfort */
    flex: 0 0 145px;
    min-width: 145px;
    height: 100%;
  }

  /* Right side - Sync status (ONLY place for sync on mobile) */
  .island-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 4px;
    /* Staggered fade in from right */
    animation: islandItemFadeInRight 0.5s var(--ease-out) 0.3s backwards;
  }

  @keyframes islandItemFadeInRight {
    from {
      opacity: 0;
      transform: translateX(8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Sync indicator sizing for island header */
  .island-right :global(.sync-indicator) {
    width: 40px;
    height: 40px;
    border-width: 1.5px;
  }

  .island-right :global(.sync-indicator .indicator-core) {
    width: 24px;
    height: 24px;
  }

  /* Synced icon is 24px */
  .island-right :global(.sync-indicator .icon-synced) {
    width: 24px;
    height: 24px;
  }

  /* Syncing icon is 20px */
  .island-right :global(.sync-indicator .icon-syncing) {
    width: 20px;
    height: 20px;
  }

  /* Other icons are 16px */
  .island-right :global(.sync-indicator .icon-offline),
  .island-right :global(.sync-indicator .icon-error),
  .island-right :global(.sync-indicator .icon-pending) {
    width: 16px;
    height: 16px;
  }

  .island-right :global(.pending-badge) {
    min-width: 16px;
    height: 16px;
    font-size: 10px;
    padding: 0 4px;
  }

  /* Position tooltip below and to the left on mobile */
  .island-right :global(.tooltip) {
    right: 0;
    top: calc(100% + 8px);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DESKTOP NAVIGATION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nav-desktop {
    position: sticky;
    top: 0;
    z-index: 100;
    background: linear-gradient(180deg,
      rgba(10, 10, 18, 0.95) 0%,
      rgba(10, 10, 18, 0.9) 100%);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
    padding: 0 1.5rem;
    /* Safe area for notch devices */
    padding-top: env(safe-area-inset-top, 0);
  }

  /* Animated glow line at top */
  .nav-desktop::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.4) 25%,
      rgba(255, 121, 198, 0.6) 50%,
      rgba(108, 92, 231, 0.4) 75%,
      transparent 100%);
    animation: navGlowMove 8s linear infinite;
  }

  @keyframes navGlowMove {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .nav-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    max-width: 1400px;
    margin: 0 auto;
    gap: 1.5rem;
    position: relative;
  }

  /* Brand */
  .nav-brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-decoration: none;
  }

  .brand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    animation: brandFloat 4s ease-in-out infinite;
  }

  @keyframes brandFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }

  .brand-text {
    font-size: 1.375rem;
    font-weight: 800;
    background: linear-gradient(135deg,
      var(--color-primary-light) 0%,
      var(--color-text) 50%,
      var(--color-primary-light) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    animation: textShimmer 6s linear infinite;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  /* Center Navigation */
  .nav-center {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    /* Absolutely center the nav regardless of brand/actions widths */
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .nav-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 1.25rem;
    color: var(--color-text-muted);
    font-weight: 600;
    font-size: 0.9rem;
    border-radius: var(--radius-lg);
    text-decoration: none;
    transition: color 0.4s var(--ease-out);
    z-index: 1;
    overflow: hidden;
  }

  /* Sliding background effect */
  .nav-link::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(108, 92, 231, 0.15);
    opacity: 0;
    transform: scale(0.8);
    transition: all 0.4s var(--ease-spring);
    z-index: -1;
  }

  .nav-link:hover::before {
    opacity: 1;
    transform: scale(1);
  }

  .nav-link:hover {
    color: var(--color-text);
  }

  /* Active state with gradient slide-in */
  .nav-link.active::before {
    opacity: 1;
    transform: scale(1);
    background: var(--gradient-primary);
    box-shadow:
      0 4px 20px var(--color-primary-glow),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .nav-link.active {
    color: white;
  }

  /* Shimmer effect on active */
  .nav-link.active::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    animation: navShimmer 2s ease-in-out infinite;
    z-index: 0;
  }

  @keyframes navShimmer {
    0% { left: -100%; }
    50%, 100% { left: 100%; }
  }

  .link-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.4s var(--ease-spring), filter 0.3s;
    position: relative;
    z-index: 1;
  }

  .nav-link:hover .link-icon {
    transform: scale(1.15) rotate(-5deg);
  }

  .nav-link.active .link-icon {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
    transform: scale(1.1);
  }

  .nav-link.active:hover .link-icon {
    transform: scale(1.2) rotate(-5deg);
  }

  .link-text {
    letter-spacing: 0.02em;
    position: relative;
    z-index: 1;
    transition: transform 0.3s var(--ease-spring);
  }

  .nav-link:hover .link-text {
    transform: translateX(2px);
  }

  .active-indicator {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%) scale(0);
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 10px white, 0 0 20px var(--color-primary);
    transition: transform 0.4s var(--ease-spring);
  }

  .nav-link.active .active-indicator {
    transform: translateX(-50%) scale(1);
  }

  /* Right Actions */
  .nav-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.375rem;
    padding-left: 0.5rem;
    padding-right: 0.375rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-full);
    transition: all 0.3s var(--ease-out);
  }

  .user-menu:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(15, 15, 26, 0.8);
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gradient-primary);
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    border-radius: 50%;
    box-shadow: 0 2px 8px var(--color-primary-glow);
    transition: transform 0.3s var(--ease-spring), box-shadow 0.3s;
  }

  .user-menu:hover .user-avatar {
    transform: scale(1.05);
    box-shadow: 0 4px 16px var(--color-primary-glow);
  }

  .user-greeting {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    padding-right: 0.25rem;
  }

  .logout-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    border-radius: 50%;
    transition: all 0.3s var(--ease-spring);
    cursor: pointer;
    background: none;
    border: none;
  }

  .logout-btn:hover {
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.15);
    transform: scale(1.1);
  }

  /* Simple nav for unauthenticated */
  .nav-simple .nav-inner {
    justify-content: space-between;
  }

  .nav-simple-actions {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-text-link {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .nav-text-link:hover {
    color: var(--color-text);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MAIN CONTENT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .main {
    flex: 1;
    padding: 2rem;
    padding-bottom: 2rem;
    animation: fadeInUp 0.4s var(--ease-out);
    position: relative;
    z-index: 1;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE BOTTOM TAB BAR — Cinematic Redesign for iPhone 16 Pro
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nav-mobile {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    /* Reduced safe area padding - moves icons closer to bottom */
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) * 0.6);
    /* Background fills the entire area including safe area padding */
    background: var(--color-void);
  }

  /* Glass morphism background - fills entire nav including safe area */
  .nav-mobile-bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    /* SOLID color that extends to the very bottom - eliminates black bar */
    background: linear-gradient(180deg,
      rgba(12, 12, 24, 0.95) 0%,
      rgba(8, 8, 16, 0.98) 50%,
      #080810 100%);
    backdrop-filter: blur(40px) saturate(200%);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    border-top: 1px solid rgba(108, 92, 231, 0.15);
    /* Subtle inner glow */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 -10px 40px rgba(0, 0, 0, 0.3);
  }

  /* Animated cosmic glow line at top */
  .nav-mobile-bg::before {
    content: '';
    position: absolute;
    top: 0;
    left: 5%;
    right: 5%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 20%,
      rgba(255, 121, 198, 0.5) 40%,
      rgba(38, 222, 129, 0.3) 60%,
      rgba(108, 92, 231, 0.3) 80%,
      transparent 100%);
    animation: navGlowShift 6s ease-in-out infinite;
  }

  @keyframes navGlowShift {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  /* Subtle nebula accent at top */
  .nav-mobile-bg::after {
    content: '';
    position: absolute;
    top: -20px;
    left: 20%;
    right: 20%;
    height: 40px;
    background: radial-gradient(ellipse at center,
      rgba(108, 92, 231, 0.15) 0%,
      transparent 70%);
    pointer-events: none;
  }

  .tab-bar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 64px;
    max-width: 420px;
    margin: 0 auto;
    padding: 0 0.75rem;
    /* Safe area handled by parent nav-mobile */
    padding-left: max(0.75rem, env(safe-area-inset-left, 0));
    padding-right: max(0.75rem, env(safe-area-inset-right, 0));
    z-index: 1;
  }

  .tab-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 0.875rem;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border: none;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    min-width: 56px;
    /* Staggered entry animation */
    animation: tabItemEnter 0.5s var(--ease-spring) backwards;
    animation-delay: calc(var(--tab-index, 0) * 0.05s);
  }

  @keyframes tabItemEnter {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Animated glow background for tabs */
  .tab-glow {
    position: absolute;
    inset: 4px;
    border-radius: var(--radius-xl);
    background: transparent;
    transition: all 0.4s var(--ease-spring);
    z-index: -1;
  }

  .tab-item.active .tab-glow {
    background: linear-gradient(145deg,
      rgba(108, 92, 231, 0.2) 0%,
      rgba(108, 92, 231, 0.05) 100%);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.3);
  }

  .tab-item:active {
    transform: scale(0.9);
    transition: transform 0.1s var(--ease-out);
  }

  .tab-item:active .tab-glow {
    background: rgba(108, 92, 231, 0.15);
  }

  .tab-item.active {
    color: var(--color-text);
  }

  .tab-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    transition: all 0.4s var(--ease-spring);
  }

  .tab-icon svg {
    transition: all 0.4s var(--ease-spring);
  }

  .tab-item.active .tab-icon {
    color: var(--color-primary-light);
    transform: translateY(-2px);
  }

  .tab-item.active .tab-icon svg {
    filter: drop-shadow(0 0 10px var(--color-primary-glow));
  }

  .tab-label {
    transition: all 0.3s var(--ease-out);
  }

  .tab-item.active .tab-label {
    color: var(--color-primary-light);
    text-shadow: 0 0 10px var(--color-primary-glow);
  }

  /* Active indicator - orbital dot effect */
  .tab-active-indicator {
    position: absolute;
    top: 0px;
    left: 50%;
    width: 6px;
    height: 6px;
    background: var(--gradient-primary);
    border-radius: 50%;
    transform: translateX(-50%);
    box-shadow:
      0 0 12px var(--color-primary-glow),
      0 0 24px rgba(108, 92, 231, 0.3);
    animation: activeIndicatorPulse 2s ease-in-out infinite;
  }

  @keyframes activeIndicatorPulse {
    0%, 100% {
      transform: translateX(-50%) scale(1);
      box-shadow:
        0 0 12px var(--color-primary-glow),
        0 0 24px rgba(108, 92, 231, 0.3);
    }
    50% {
      transform: translateX(-50%) scale(1.2);
      box-shadow:
        0 0 16px var(--color-primary-glow),
        0 0 32px rgba(108, 92, 231, 0.4);
    }
  }

  .tab-profile {
    min-width: auto;
  }

  .mobile-avatar {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.2) 100%);
    border: 1.5px solid rgba(108, 92, 231, 0.4);
    color: var(--color-text);
    font-weight: 700;
    font-size: 0.75rem;
    border-radius: 50%;
    transition: all 0.4s var(--ease-spring);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .tab-item.active .mobile-avatar,
  .tab-profile:hover .mobile-avatar {
    border-color: rgba(108, 92, 231, 0.6);
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 4px 12px rgba(0, 0, 0, 0.4);
    transform: scale(1.05);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE BREAKPOINTS — Optimized for iPhone 16 Pro and all modern phones
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* Wide tablet - start hiding user greeting earlier to prevent overlap */
  @media (max-width: 1100px) {
    .user-greeting {
      display: none;
    }

    .user-menu {
      padding-right: 0.375rem;
    }

    .nav-actions {
      gap: 0.75rem;
    }
  }

  /* Tablet - hide link text */
  @media (max-width: 900px) {
    .link-text {
      display: none;
    }

    .nav-link {
      padding: 0.625rem 0.875rem;
    }

    .nav-center {
      gap: 0.25rem;
    }

    .nav-actions {
      gap: 0.5rem;
    }
  }

  /* Mobile - Show bottom nav, hide desktop, show island header */
  @media (max-width: 640px) {
    /* Hide desktop nav completely on mobile */
    .nav-desktop {
      display: none;
    }

    /* Show Dynamic Island header */
    .island-header {
      display: flex;
    }

    .nav-mobile {
      display: block;
    }

    .main {
      padding: 1rem;
      padding-left: max(1rem, env(safe-area-inset-left, 1rem));
      padding-right: max(1rem, env(safe-area-inset-right, 1rem));
      /* Add top padding for the island header + breathing room */
      padding-top: calc(env(safe-area-inset-top, 47px) + 24px);
      /* Smooth page transition */
      animation: pageContentFadeIn 0.4s var(--ease-out);
    }

    @keyframes pageContentFadeIn {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .main.with-bottom-nav {
      /* Bottom nav height (64px) + safe area + breathing room */
      padding-bottom: calc(72px + env(safe-area-inset-bottom, 0) + 16px);
    }
  }

  /* iPhone SE and smaller (375px) - No Dynamic Island, uses notch */
  @media (max-width: 375px) {
    .tab-bar {
      padding: 0 0.25rem;
    }

    .tab-item {
      padding: 0.5rem 0.375rem;
      min-width: 48px;
    }

    .tab-label {
      font-size: 0.5625rem;
    }

    .tab-icon svg {
      width: 22px;
      height: 22px;
    }

    .main {
      padding: 0.875rem;
      padding-top: calc(env(safe-area-inset-top, 20px) + 16px);
    }

    /* Smaller center gap for notch devices (no Dynamic Island) */
    .island-center {
      flex: 0 0 95px;
      min-width: 95px;
    }

    .island-left,
    .island-right {
      max-width: 95px;
    }

    .island-brand-text {
      font-size: 0.75rem;
    }

    .island-brand svg {
      width: 16px;
      height: 16px;
    }
  }

  /* Small phones (376px - 389px) */
  @media (min-width: 376px) and (max-width: 389px) {
    .island-center {
      flex: 0 0 110px;
      min-width: 110px;
    }

    .tab-bar {
      padding: 0 0.5rem;
    }
  }

  /* iPhone 14/15/16 Pro (390px - 402px width) - Dynamic Island */
  @media (min-width: 390px) and (max-width: 402px) {
    .island-center {
      flex: 0 0 135px;
      min-width: 135px;
    }

    .island-left,
    .island-right {
      max-width: 118px;
    }

    .island-brand-text {
      font-size: 0.875rem;
    }

    .tab-bar {
      padding: 0 0.5rem;
    }

    .tab-item {
      padding: 0.625rem 0.625rem;
      min-width: 52px;
    }
  }

  /* iPhone 16 Pro (402px logical width) - Primary target */
  @media (min-width: 400px) and (max-width: 415px) {
    .island-center {
      flex: 0 0 140px;
      min-width: 140px;
    }

    .island-left,
    .island-right {
      max-width: 120px;
    }

    .island-brand-text {
      font-size: 0.9375rem;
    }

    .island-brand svg {
      width: 18px;
      height: 18px;
    }

    .tab-bar {
      padding: 0 0.75rem;
    }

    .tab-item {
      padding: 0.625rem 0.75rem;
      min-width: 56px;
    }

    .tab-label {
      font-size: 0.625rem;
    }
  }

  /* iPhone 14/15/16 Pro Max (430px+, has Dynamic Island) */
  @media (min-width: 430px) and (max-width: 640px) {
    .tab-bar {
      max-width: 450px;
      padding: 0 1rem;
    }

    .tab-item {
      padding: 0.625rem 1rem;
      min-width: 64px;
    }

    .tab-label {
      font-size: 0.6875rem;
    }

    .tab-icon svg {
      width: 26px;
      height: 26px;
    }

    /* Larger center gap for Pro Max - more screen real estate */
    .island-center {
      flex: 0 0 150px;
      min-width: 150px;
    }

    .island-left,
    .island-right {
      max-width: 135px;
    }

    .island-brand-text {
      font-size: 1rem;
    }

    .island-brand svg {
      width: 20px;
      height: 20px;
    }

    .main {
      padding: 1.25rem;
      padding-top: calc(env(safe-area-inset-top, 59px) + 28px);
    }

    .main.with-bottom-nav {
      padding-bottom: calc(80px + env(safe-area-inset-bottom, 0) + 20px);
    }
  }

  /* Landscape mobile - hide ALL navigation (landscape blocker in app.html handles display) */
  @media (max-height: 500px) and (max-width: 900px) and (orientation: landscape) {
    .nav-mobile,
    .island-header,
    .nav-desktop {
      display: none !important;
    }

    .main {
      /* Content hidden behind landscape blocker anyway */
      padding-top: 1rem;
      padding-bottom: 1rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DARK MODE OPTIMIZATIONS (already dark, but ensuring consistency)
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-color-scheme: dark) {
    .nav-desktop,
    .nav-mobile {
      background: linear-gradient(180deg,
        rgba(8, 8, 14, 0.97) 0%,
        rgba(8, 8, 14, 0.95) 100%);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .brand-icon,
    .brand-text,
    .active-indicator,
    .tab-active-dot {
      animation: none;
    }

    .nav-desktop::before {
      animation: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SIGN OUT OVERLAY - Full screen transition overlay
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .signout-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000; /* Above everything */
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at center,
      rgba(15, 15, 35, 1) 0%,
      rgba(5, 5, 16, 1) 50%,
      rgba(0, 0, 5, 1) 100%);
  }

  .signout-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    animation: signoutPulse 2s ease-in-out infinite;
  }

  @keyframes signoutPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(0.98); }
  }

  .signout-icon {
    filter: drop-shadow(0 0 30px var(--color-primary-glow));
    animation: signoutSpin 3s linear infinite;
  }

  @keyframes signoutSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .signout-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
    margin: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     APP TOAST - Space themed notification
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .app-toast {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 1rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    animation: toastSlideIn 0.4s var(--ease-spring);
  }

  @keyframes toastSlideIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .toast-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.25rem;
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.2) 100%);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-xl);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 500;
    max-width: calc(100vw - 2rem);
  }

  .app-toast.toast-error .toast-content {
    background: linear-gradient(135deg,
      rgba(255, 121, 198, 0.15) 0%,
      rgba(108, 92, 231, 0.2) 100%);
    border-color: rgba(255, 121, 198, 0.3);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(255, 121, 198, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .toast-content svg {
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .app-toast.toast-error .toast-content svg {
    color: var(--color-accent);
  }

  .toast-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    margin-left: 0.25rem;
    color: var(--color-text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .toast-dismiss:hover {
    color: var(--color-text);
    background: rgba(255, 255, 255, 0.1);
  }

  /* User menu as link */
  .user-menu-link {
    text-decoration: none;
    cursor: pointer;
  }

  .user-menu-link:hover {
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }
</style>
