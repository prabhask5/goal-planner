<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { signOut, getUserProfile } from '$lib/supabase/auth';
  import { stopSyncEngine, clearLocalCache } from '$lib/sync/engine';
  import { syncStatusStore } from '$lib/stores/sync';
  import SyncStatus from '$lib/components/SyncStatus.svelte';
  import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';
  import type { Session } from '@supabase/supabase-js';

  interface Props {
    children?: import('svelte').Snippet;
    data: { session: Session | null };
  }

  let { children, data }: Props = $props();

  // Get user's first name from profile
  const profile = $derived(getUserProfile(data.session?.user ?? null));
  const greeting = $derived(profile.firstName ? profile.firstName : 'there');

  const navItems = [
    { href: '/tasks', label: 'Tasks', icon: 'tasks', mobileLabel: 'Tasks' },
    { href: '/lists', label: 'Goals', icon: 'goals', mobileLabel: 'Goals' },
    { href: '/calendar', label: 'Routines', icon: 'calendar', mobileLabel: 'Routines' }
  ];

  async function handleSignOut() {
    stopSyncEngine();
    await clearLocalCache();
    localStorage.removeItem('lastSyncTimestamp');
    syncStatusStore.reset();
    await signOut();
    // Use hard navigation to ensure session state is fully cleared
    window.location.href = '/login';
  }

  function isActive(href: string): boolean {
    return $page.url.pathname.startsWith(href);
  }
</script>

<div class="app" class:authenticated={data.session}>
  <!-- Pull to Refresh for PWA -->
  {#if data.session}
    <PullToRefresh />
  {/if}

  <!-- iPhone Pro Dynamic Island Status Bar (Mobile Only) -->
  {#if data.session}
    <header class="island-header">
      <div class="island-left">
        <span class="island-brand">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
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
        <span class="island-title">{$page.url.pathname.startsWith('/tasks') ? 'Tasks' : $page.url.pathname.startsWith('/calendar') ? 'Routines' : 'Goals'}</span>
      </div>
      <!-- Center gap for Dynamic Island -->
      <div class="island-center"></div>
      <div class="island-right">
        <SyncStatus />
      </div>
    </header>
  {/if}

  <!-- Desktop/Tablet Top Navigation -->
  {#if data.session}
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
          <div class="user-menu">
            <span class="user-avatar">
              {greeting.charAt(0).toUpperCase()}
            </span>
            <button class="logout-btn" onclick={handleSignOut} aria-label="Logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  {:else if !$page.url.pathname.startsWith('/login')}
    <!-- Unauthenticated header (hidden on login page) -->
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
        <a href="/login" class="btn btn-primary btn-sm">Get Started</a>
      </div>
    </nav>
  {/if}

  <!-- Main Content Area -->
  <main class="main" class:with-bottom-nav={data.session}>
    {@render children?.()}
  </main>

  <!-- Mobile Bottom Tab Bar (iOS-style) -->
  {#if data.session}
    <nav class="nav-mobile">
      <div class="tab-bar">
        {#each navItems as item}
          <a
            href={item.href}
            class="tab-item"
            class:active={isActive(item.href)}
          >
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
              <span class="tab-active-dot"></span>
            {/if}
          </a>
        {/each}

        <!-- Sync indicator in mobile nav -->
        <div class="tab-item tab-sync">
          <SyncStatus />
        </div>

        <!-- Profile/Logout -->
        <button class="tab-item tab-profile" onclick={handleSignOut}>
          <span class="tab-icon">
            <span class="mobile-avatar">{greeting.charAt(0).toUpperCase()}</span>
          </span>
          <span class="tab-label">Logout</span>
        </button>
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     IPHONE PRO DYNAMIC ISLAND HEADER (Mobile Only)
     Creates a split header that respects the Dynamic Island and status bar
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .island-header {
    display: none; /* Hidden by default, shown on mobile */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 150;
    height: calc(env(safe-area-inset-top, 47px) + 8px);
    padding-top: env(safe-area-inset-top, 47px);
    background: linear-gradient(180deg,
      rgba(10, 10, 18, 0.98) 0%,
      rgba(10, 10, 18, 0.85) 60%,
      transparent 100%);
    pointer-events: none;
  }

  .island-header > * {
    pointer-events: auto;
  }

  /* Container for the split layout */
  .island-header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    padding-left: env(safe-area-inset-left, 16px);
    padding-right: env(safe-area-inset-right, 16px);
    padding-bottom: 8px;
  }

  /* Left side - Brand and current section */
  .island-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-left: 8px;
    max-width: 110px; /* Keep away from Dynamic Island */
  }

  .island-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.9;
  }

  .island-title {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-text);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Center gap - Reserved space for Dynamic Island */
  .island-center {
    /* This creates the gap around the Dynamic Island */
    /* Dynamic Island is ~126px wide on iPhone 14/15/16 Pro */
    flex: 0 0 140px;
    min-width: 140px;
    height: 100%;
  }

  /* Right side - Sync status */
  .island-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
    max-width: 110px; /* Keep away from Dynamic Island */
  }

  /* Scale down sync indicator for the island header */
  .island-right :global(.sync-indicator) {
    width: 32px;
    height: 32px;
    border-width: 1px;
  }

  .island-right :global(.sync-indicator svg) {
    width: 14px;
    height: 14px;
  }

  .island-right :global(.pending-badge) {
    min-width: 14px;
    height: 14px;
    font-size: 9px;
    padding: 0 3px;
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
    gap: 2rem;
  }

  /* Brand */
  .nav-brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-decoration: none;
    flex-shrink: 0;
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
    gap: 0.5rem;
    padding: 0.375rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
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
    transition: all 0.3s var(--ease-out);
    text-decoration: none;
  }

  .nav-link:hover {
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.1);
  }

  .nav-link.active {
    color: white;
    background: var(--gradient-primary);
    box-shadow:
      0 4px 16px var(--color-primary-glow),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .link-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s var(--ease-spring);
  }

  .nav-link:hover .link-icon {
    transform: scale(1.1);
  }

  .nav-link.active .link-icon {
    filter: drop-shadow(0 0 8px white);
  }

  .link-text {
    letter-spacing: 0.02em;
  }

  .active-indicator {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 10px white, 0 0 20px var(--color-primary);
  }

  /* Right Actions */
  .nav-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem;
    padding-left: 0.5rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-full);
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
     MOBILE BOTTOM TAB BAR
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nav-mobile {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: linear-gradient(180deg,
      rgba(15, 15, 26, 0.95) 0%,
      rgba(10, 10, 18, 0.98) 100%);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-top: 1px solid rgba(108, 92, 231, 0.2);
    /* iPhone safe area for home indicator */
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  /* Glow line at top of mobile nav */
  .nav-mobile::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 121, 198, 0.4),
      rgba(108, 92, 231, 0.5),
      transparent);
  }

  .tab-bar {
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 60px;
    max-width: 500px;
    margin: 0 auto;
    padding: 0 0.5rem;
  }

  .tab-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition: all 0.3s var(--ease-spring);
    border: none;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    min-width: 64px;
  }

  .tab-item:active {
    transform: scale(0.92);
  }

  .tab-item.active {
    color: var(--color-primary-light);
  }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
  }

  .tab-item.active .tab-icon {
    color: var(--color-primary-light);
    filter: drop-shadow(0 0 8px var(--color-primary-glow));
    transform: scale(1.1);
  }

  .tab-label {
    transition: color 0.3s;
  }

  .tab-active-dot {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--color-primary-glow);
  }

  .tab-sync {
    padding: 0.25rem;
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
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.3) 0%, rgba(108, 92, 231, 0.1) 100%);
    border: 1.5px solid rgba(108, 92, 231, 0.4);
    color: var(--color-primary-light);
    font-weight: 700;
    font-size: 0.75rem;
    border-radius: 50%;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE BREAKPOINTS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* Tablet */
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
      padding: 1.25rem;
      /* Add top padding for the island header fade area */
      padding-top: calc(env(safe-area-inset-top, 47px) + 20px);
    }

    .main.with-bottom-nav {
      padding-bottom: calc(80px + env(safe-area-inset-bottom, 0));
    }
  }

  /* iPhone SE and smaller - No Dynamic Island, use notch layout */
  @media (max-width: 375px) {
    .tab-item {
      padding: 0.5rem 0.5rem;
      min-width: 56px;
    }

    .tab-label {
      font-size: 0.625rem;
    }

    .main {
      padding: 1rem;
      padding-top: calc(env(safe-area-inset-top, 20px) + 16px);
    }

    /* Smaller center gap for notch devices (no Dynamic Island) */
    .island-center {
      flex: 0 0 100px;
      min-width: 100px;
    }

    .island-left,
    .island-right {
      max-width: 100px;
    }

    .island-title {
      font-size: 0.625rem;
    }
  }

  /* iPhone 14/15/16 Pro (393px width, has Dynamic Island) */
  @media (min-width: 390px) and (max-width: 429px) and (max-height: 900px) {
    .island-center {
      flex: 0 0 130px;
      min-width: 130px;
    }

    .island-left,
    .island-right {
      max-width: 115px;
    }

    .island-title {
      font-size: 0.6875rem;
    }
  }

  /* iPhone 14/15/16 Pro Max and larger phones (430px+, has Dynamic Island) */
  @media (min-width: 430px) and (max-width: 640px) {
    .tab-bar {
      max-width: 100%;
      padding: 0 1rem;
    }

    .tab-item {
      padding: 0.5rem 1.25rem;
    }

    /* Larger center gap for Pro Max - more screen real estate */
    .island-center {
      flex: 0 0 145px;
      min-width: 145px;
    }

    .island-left,
    .island-right {
      max-width: 130px;
    }

    .island-title {
      font-size: 0.75rem;
    }

    .island-brand svg {
      width: 20px;
      height: 20px;
    }
  }

  /* Extra: Detect iPhone Pro via safe-area (Dynamic Island has larger inset ~59px vs ~47px notch) */
  @supports (padding-top: env(safe-area-inset-top)) {
    @media (max-width: 640px) {
      /* Adjust header for proper Dynamic Island clearance */
      .island-header {
        /* The gradient fades below the Dynamic Island area */
        background: linear-gradient(180deg,
          rgba(10, 10, 18, 1) 0%,
          rgba(10, 10, 18, 0.95) 40%,
          rgba(10, 10, 18, 0.7) 70%,
          transparent 100%);
      }
    }
  }

  /* Landscape mobile */
  @media (max-height: 500px) and (max-width: 900px) {
    .nav-mobile {
      display: none;
    }

    .nav-center {
      display: flex;
    }

    .main.with-bottom-nav {
      padding-bottom: 2rem;
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
</style>
