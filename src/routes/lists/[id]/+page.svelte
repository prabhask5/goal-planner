<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    getGoalList,
    updateGoalList,
    createGoal,
    updateGoal,
    deleteGoal,
    incrementGoal
  } from '$lib/supabase/database';
  import type { GoalList, Goal, GoalType } from '$lib/types';
  import { calculateGoalProgress } from '$lib/utils/colors';
  import GoalItem from '$lib/components/GoalItem.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import GoalForm from '$lib/components/GoalForm.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let list = $state<(GoalList & { goals: Goal[] }) | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showAddModal = $state(false);
  let editingGoal = $state<Goal | null>(null);
  let editingListName = $state(false);
  let newListName = $state('');

  const listId = $derived($page.params.id);

  const totalProgress = $derived(() => {
    if (!list?.goals || list.goals.length === 0) return 0;
    const total = list.goals.reduce((sum, goal) => {
      return sum + calculateGoalProgress(goal.type, goal.completed, goal.current_value, goal.target_value);
    }, 0);
    return Math.round(total / list.goals.length);
  });

  onMount(async () => {
    await loadList();
  });

  async function loadList() {
    try {
      loading = true;
      error = null;
      list = await getGoalList(listId);
      newListName = list.name;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load list';
    } finally {
      loading = false;
    }
  }

  async function handleAddGoal(data: { name: string; type: GoalType; targetValue: number | null }) {
    if (!list) return;

    try {
      const newGoal = await createGoal(list.id, data.name, data.type, data.targetValue);
      list.goals = [...list.goals, newGoal];
      showAddModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create goal';
    }
  }

  async function handleUpdateGoal(data: { name: string; type: GoalType; targetValue: number | null }) {
    if (!editingGoal || !list) return;

    try {
      const updated = await updateGoal(editingGoal.id, {
        name: data.name,
        target_value: data.targetValue
      });
      list.goals = list.goals.map((g) => (g.id === updated.id ? updated : g));
      editingGoal = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleToggleComplete(goal: Goal) {
    if (!list) return;

    try {
      const updated = await updateGoal(goal.id, { completed: !goal.completed });
      list.goals = list.goals.map((g) => (g.id === updated.id ? updated : g));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleIncrement(goal: Goal, amount: number = 1) {
    if (!list || goal.type !== 'incremental') return;

    try {
      if (amount > 0) {
        const updated = await incrementGoal(goal.id, amount);
        list.goals = list.goals.map((g) => (g.id === updated.id ? updated : g));
      } else {
        const newValue = Math.max(0, goal.current_value + amount);
        const completed = goal.target_value ? newValue >= goal.target_value : false;
        const updated = await updateGoal(goal.id, { current_value: newValue, completed });
        list.goals = list.goals.map((g) => (g.id === updated.id ? updated : g));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleDeleteGoal(goal: Goal) {
    if (!list || !confirm('Delete this goal?')) return;

    try {
      await deleteGoal(goal.id);
      list.goals = list.goals.filter((g) => g.id !== goal.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete goal';
    }
  }

  async function handleUpdateListName() {
    if (!list || !newListName.trim()) return;

    try {
      await updateGoalList(list.id, newListName.trim());
      list.name = newListName.trim();
      editingListName = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update list name';
    }
  }
</script>

<svelte:head>
  <title>{list?.name ?? 'Loading...'} - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <div class="header-left">
      <button class="back-btn" onclick={() => goto('/lists')} aria-label="Back to lists">
        ← Back
      </button>
      {#if editingListName}
        <form class="edit-name-form" onsubmit={(e) => { e.preventDefault(); handleUpdateListName(); }}>
          <input
            type="text"
            bind:value={newListName}
            autofocus
          />
          <button type="submit" class="btn btn-sm btn-primary">Save</button>
          <button type="button" class="btn btn-sm btn-secondary" onclick={() => { editingListName = false; newListName = list?.name ?? ''; }}>
            Cancel
          </button>
        </form>
      {:else}
        <h1 onclick={() => (editingListName = true)} title="Click to edit">
          {list?.name ?? 'Loading...'}
        </h1>
      {/if}
    </div>
    <button class="btn btn-primary" onclick={() => (showAddModal = true)}>
      + Add Goal
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
  {:else if list}
    <div class="progress-section">
      <ProgressBar percentage={totalProgress()} />
    </div>

    {#if list.goals.length === 0}
      <EmptyState
        icon="🎯"
        title="No goals yet"
        description="Add your first goal to start tracking progress"
      >
        <button class="btn btn-primary" onclick={() => (showAddModal = true)}>
          Add First Goal
        </button>
      </EmptyState>
    {:else}
      <div class="goals-list">
        {#each list.goals as goal (goal.id)}
          <GoalItem
            {goal}
            onToggleComplete={() => handleToggleComplete(goal)}
            onIncrement={() => handleIncrement(goal, 1)}
            onDecrement={() => handleIncrement(goal, -1)}
            onEdit={() => (editingGoal = goal)}
            onDelete={() => handleDeleteGoal(goal)}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>

<Modal open={showAddModal} title="Add Goal" onClose={() => (showAddModal = false)}>
  <GoalForm onSubmit={handleAddGoal} onCancel={() => (showAddModal = false)} />
</Modal>

<Modal open={editingGoal !== null} title="Edit Goal" onClose={() => (editingGoal = null)}>
  {#if editingGoal}
    <GoalForm
      name={editingGoal.name}
      type={editingGoal.type}
      targetValue={editingGoal.target_value}
      submitLabel="Save Changes"
      onSubmit={handleUpdateGoal}
      onCancel={() => (editingGoal = null)}
    />
  {/if}
</Modal>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .back-btn {
    padding: 0.5rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    transition: all 0.2s;
    white-space: nowrap;
  }

  .back-btn:hover {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  .page-header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
    border-radius: var(--radius-sm);
    transition: background-color 0.2s;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-header h1:hover {
    background-color: var(--color-bg-tertiary);
  }

  .edit-name-form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .edit-name-form input {
    font-size: 1.25rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    width: 200px;
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

  .progress-section {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .goals-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
