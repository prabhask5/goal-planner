<script lang="ts">
  interface Props {
    icon?: string;
    title: string;
    description?: string;
    children?: import('svelte').Snippet;
  }

  let { icon = '📋', title, description, children }: Props = $props();
</script>

<div class="empty-state">
  <span class="empty-icon">{icon}</span>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-description">{description}</p>
  {/if}
  {#if children}
    <div class="empty-actions">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .empty-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .empty-description {
    color: var(--color-text-muted);
    max-width: 300px;
    margin-bottom: 1.5rem;
  }

  .empty-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
