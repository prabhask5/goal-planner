<script lang="ts">
  import { page } from '$app/stores';
  import PageStarfield from '$lib/components/PageStarfield.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  // Don't show starfield on home page (it has its own elaborate one)
  const showStarfield = $derived($page.url.pathname !== '/');
</script>

{#if showStarfield}
  <PageStarfield />
{/if}

{@render children?.()}
