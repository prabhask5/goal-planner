<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  const navItems = [
    { href: '/lists', label: 'Goal Lists', icon: '☐' },
    { href: '/calendar', label: 'Calendar', icon: '📅' },
    { href: '/routines', label: 'Routines', icon: '🔄' }
  ];
</script>

<div class="app">
  <nav class="nav">
    <div class="nav-brand">
      <a href="/">Goal Planner</a>
    </div>
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
  }
</style>
