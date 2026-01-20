<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/calendar', { replaceState: true });
  });
</script>

<div class="container">
  <p>Redirecting to calendar...</p>
</div>
