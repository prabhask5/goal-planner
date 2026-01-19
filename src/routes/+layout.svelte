<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { signOut } from '$lib/supabase/auth';
  import { stopSyncEngine, clearLocalCache } from '$lib/sync/engine';
  import { syncStatusStore } from '$lib/stores/sync';
  import SyncStatus from '$lib/components/SyncStatus.svelte';
  import type { Session } from '@supabase/supabase-js';

  interface Props {
    children?: import('svelte').Snippet;
    data: { session: Session | null };
  }

  let { children, data }: Props = $props();

  const navItems = [
    { href: '/lists', label: 'Goal Lists', icon: '☐' },
    { href: '/calendar', label: 'Calendar', icon: '📅' },
    { href: '/routines', label: 'Routines', icon: '🔄' }
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
        <span class="user-email">{data.session.user.email}</span>
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
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .nav {
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-brand a {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary);
  }

  .nav-links {
    display: flex;
    gap: 0.5rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    transition: background-color 0.2s;
  }

  .nav-link:hover {
    background-color: var(--color-bg-tertiary);
  }

  .nav-link.active {
    background-color: var(--color-primary);
    color: white;
  }

  .nav-icon {
    font-size: 1rem;
  }

  .main {
    flex: 1;
    padding: 1rem;
  }

  .nav-auth {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-email {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .nav {
      flex-direction: column;
      gap: 0.5rem;
    }

    .nav-links {
      width: 100%;
      justify-content: center;
    }

    .nav-label {
      display: none;
    }

    .nav-link {
      padding: 0.5rem 0.75rem;
    }

    .nav-auth {
      width: 100%;
      justify-content: center;
    }

    .user-email {
      display: none;
    }
  }
</style>
