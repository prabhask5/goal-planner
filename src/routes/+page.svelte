<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getSession } from '$lib/supabase/auth';

  onMount(async () => {
    const session = await getSession();
    if (session) {
      goto('/lists');
    } else {
      goto('/login');
    }
  });
</script>

<div class="loading">
  <p>Redirecting...</p>
</div>

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    color: var(--color-text-muted);
    font-size: 1.125rem;
    font-weight: 500;
    position: relative;
  }

  .loading::before {
    content: '';
    position: absolute;
    width: 200px;
    height: 200px;
    background: var(--gradient-glow);
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.5;
    animation: pulse 2s var(--ease-smooth) infinite;
  }

  .loading p {
    position: relative;
    z-index: 1;
    animation: fadeIn 0.5s var(--ease-smooth);
  }
</style>
