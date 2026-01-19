<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getGoalLists, createGoalList, deleteGoalList } from '$lib/supabase/database';
  import type { GoalListWithProgress } from '$lib/types';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let lists = $state<GoalListWithProgress[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showCreateModal = $state(false);
  let newListName = $state('');
  let creating = $state(false);

  onMount(async () => {
    await loadLists();
  });

  async function loadLists() {
    try {
      loading = true;
      error = null;
      lists = await getGoalLists();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load lists';
    } finally {
      loading = false;
    }
  }

  async function handleCreateList(event: Event) {
    event.preventDefault();
    if (!newListName.trim() || creating) return;

    try {
      creating = true;
      const newList = await createGoalList(newListName.trim());
      lists = [{ ...newList, totalGoals: 0, completedGoals: 0, completionPercentage: 0 }, ...lists];
      newListName = '';
      showCreateModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create list';
    } finally {
      creating = false;
    }
  }

  async function handleDeleteList(id: string) {
    if (!confirm('Are you sure you want to delete this list and all its goals?')) return;

    try {
      await deleteGoalList(id);
      lists = lists.filter((l) => l.id !== id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete list';
    }
  }

  function navigateToList(id: string) {
    goto(`/lists/${id}`);
  }
</script>

<svelte:head>
  <title>Goal Lists - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <h1>Goal Lists</h1>
    <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
      + New List
    </button>
  </header>

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if lists.length === 0}
    <EmptyState
      icon="📝"
      title="No goal lists yet"
      description="Create your first goal list to start tracking your goals"
    >
      <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
        Create First List
      </button>
    </EmptyState>
  {:else}
    <div class="lists-grid">
      {#each lists as list}
        <div class="list-card" role="button" tabindex="0" onclick={() => navigateToList(list.id)} onkeypress={(e) => e.key === 'Enter' && navigateToList(list.id)}>
          <div class="list-header">
            <h3 class="list-name">{list.name}</h3>
            <button
              class="delete-btn"
              onclick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
              aria-label="Delete list"
            >
              ×
            </button>
          </div>
          <div class="list-stats">
            <span class="stat-text">
              {list.completedGoals} / {list.totalGoals} goals
            </span>
          </div>
          <ProgressBar percentage={list.completionPercentage} />
        </div>
      {/each}
    </div>
  {/if}
</div>

<Modal open={showCreateModal} title="Create New List" onClose={() => (showCreateModal = false)}>
  <form class="create-form" onsubmit={handleCreateList}>
    <div class="form-group">
      <label for="list-name">List Name</label>
      <input
        id="list-name"
        type="text"
        bind:value={newListName}
        placeholder="Enter list name..."
        required
        autofocus
      />
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)}>
        Cancel
      </button>
      <button type="submit" class="btn btn-primary" disabled={creating}>
        {creating ? 'Creating...' : 'Create List'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    font-weight: 700;
  }

  .error-banner {
    background-color: rgba(255, 107, 107, 0.1);
    border: 1px solid var(--color-red);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .error-banner button {
    color: var(--color-red);
    font-weight: 500;
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: var(--color-text-muted);
  }

  .lists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .list-card {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .list-card:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
  }

  .list-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .list-name {
    font-size: 1.125rem;
    font-weight: 600;
    flex: 1;
    margin-right: 0.5rem;
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: all 0.2s ease;
  }

  .delete-btn:hover {
    opacity: 1;
    background-color: var(--color-red);
    color: white;
  }

  .list-stats {
    margin-bottom: 0.75rem;
  }

  .stat-text {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>
