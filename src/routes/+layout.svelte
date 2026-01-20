<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { signOut, getUserProfile } from '$lib/supabase/auth';
  import { stopSyncEngine, clearLocalCache } from '$lib/sync/engine';
  import { syncStatusStore } from '$lib/stores/sync';
  import SyncStatus from '$lib/components/SyncStatus.svelte';
  import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
  import type { Session } from '@supabase/supabase-js';

  interface Props {
    children?: import('svelte').Snippet;
    data: { session: Session | null };
  }

  let { children, data }: Props = $props();

  // Get user's first name from profile
  const profile = $derived(getUserProfile(data.session?.user ?? null));
  const greeting = $derived(profile.firstName ? `Hi, ${profile.firstName}` : 'Hi there');

  const navItems = [
    { href: '/lists', label: 'Goal Lists', icon: '☐' },
    { href: '/calendar', label: 'Daily Routines', icon: '📅' }
  ];

  async function handleSignOut() {
    // Stop sync engine
    stopSyncEngine();
    // Clear local data on logout
    await clearLocalCache();
    // Clear sync timestamp
    localStorage.removeItem('lastSyncTimestamp');
    // Reset sync status
    syncStatusStore.reset();
    // Sign out from Supabase
    await signOut();
    goto('/login');
  }
</script>

<div class="app">
  <nav class="nav">
    <div class="nav-brand">
      <a href="/">Goal Planner</a>
    </div>
    {#if data.session}
      <div class="nav-links">
        {#each navItems as item}
          <a
            href={item.href}
            class="nav-link"
            class:active={$page.url.pathname.startsWith(item.href)}
          >
            <span class="nav-icon">{item.icon}</span>
            <span class="nav-label">{item.label}</span>
          </a>
        {/each}
      </div>
      <div class="nav-auth">
        <SyncStatus />
        <span class="user-greeting">{greeting}</span>
        <button class="btn btn-secondary btn-sm" onclick={handleSignOut}>Logout</button>
      </div>
    {:else}
      <div class="nav-auth">
        <a href="/login" class="btn btn-primary btn-sm">Login</a>
      </div>
    {/if}
  </nav>

  <main class="main">
    {@render children?.()}
  </main>

  <UpdatePrompt />
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .nav {
    background: linear-gradient(180deg,
      rgba(15, 15, 26, 0.98) 0%,
      rgba(10, 10, 20, 0.95) 100%);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    border-bottom: 1px solid rgba(108, 92, 231, 0.2);
    padding: 1rem 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow:
      0 4px 40px rgba(0, 0, 0, 0.4),
      0 0 80px rgba(108, 92, 231, 0.08),
      inset 0 -1px 0 rgba(255, 255, 255, 0.03);
  }

  /* Top edge glow line */
  .nav::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 20%,
      rgba(108, 92, 231, 0.8) 35%,
      rgba(255, 121, 198, 0.6) 50%,
      rgba(108, 92, 231, 0.8) 65%,
      rgba(108, 92, 231, 0.3) 80%,
      transparent 100%);
    animation: navGlow 4s ease-in-out infinite;
  }

  @keyframes navGlow {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  /* Subtle bottom stars */
  .nav::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.2),
      transparent);
  }

  .nav-brand a {
    font-size: 1.5rem;
    font-weight: 800;
    background: linear-gradient(135deg,
      var(--color-primary-light) 0%,
      var(--color-primary) 40%,
      var(--color-accent) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    transition: all 0.4s var(--ease-spring);
    position: relative;
    text-shadow: 0 0 40px var(--color-primary-glow);
  }

  .nav-brand a:hover {
    transform: scale(1.05);
    background-position: 100% center;
    filter: brightness(1.2);
  }

  .nav-links {
    display: flex;
    gap: 0.75rem;
    padding: 0.25rem;
    background: rgba(10, 10, 20, 0.5);
    border-radius: var(--radius-xl);
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-smooth);
    position: relative;
    overflow: hidden;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .nav-link::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(108, 92, 231, 0.3) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .nav-link:hover {
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.15);
  }

  .nav-link:hover::before {
    opacity: 1;
  }

  .nav-link.active {
    background: var(--gradient-primary);
    color: white;
    box-shadow:
      0 4px 20px var(--color-primary-glow),
      0 0 40px rgba(108, 92, 231, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .nav-link.active::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 10px white, 0 0 20px var(--color-primary);
  }

  .nav-link.active:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      0 8px 30px var(--color-primary-glow),
      0 0 60px rgba(108, 92, 231, 0.4);
  }

  .nav-icon {
    font-size: 1.25rem;
    transition: all 0.3s var(--ease-spring);
    filter: drop-shadow(0 0 4px currentColor);
  }

  .nav-link:hover .nav-icon {
    transform: scale(1.2) rotate(-5deg);
  }

  .nav-link.active .nav-icon {
    animation: iconPulse 2s ease-in-out infinite;
  }

  @keyframes iconPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  .nav-label {
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .main {
    flex: 1;
    padding: 2rem;
    animation: fadeInUp 0.5s var(--ease-out);
    position: relative;
  }

  .nav-auth {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }

  .user-greeting {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    white-space: nowrap;
    padding: 0.625rem 1.25rem;
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.05) 100%);
    border-radius: var(--radius-full);
    border: 1px solid rgba(108, 92, 231, 0.25);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  @media (max-width: 640px) {
    .nav {
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
    }

    .nav-links {
      width: 100%;
      justify-content: center;
      padding: 0.375rem;
    }

    .nav-label {
      display: none;
    }

    .nav-link {
      padding: 0.75rem 1.25rem;
    }

    .nav-auth {
      width: 100%;
      justify-content: center;
    }

    .user-greeting {
      display: none;
    }

    .main {
      padding: 1.25rem;
    }
  }
</style>
