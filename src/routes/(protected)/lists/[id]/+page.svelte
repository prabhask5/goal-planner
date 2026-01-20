<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { goalListStore } from '$lib/stores/data';
  import type { GoalList, Goal, GoalType } from '$lib/types';
  import { calculateGoalProgress } from '$lib/utils/colors';
  import GoalItem from '$lib/components/GoalItem.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import GoalForm from '$lib/components/GoalForm.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';

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

  // Subscribe to store
  $effect(() => {
    const unsubList = goalListStore.subscribe((value) => {
      list = value;
      if (value) newListName = value.name;
    });
    const unsubLoading = goalListStore.loading.subscribe((value) => {
      loading = value;
    });

    return () => {
      unsubList();
      unsubLoading();
    };
  });

  onMount(async () => {
    await goalListStore.load(listId);
  });

  onDestroy(() => {
    goalListStore.clear();
  });

  async function handleAddGoal(data: { name: string; type: GoalType; targetValue: number | null }) {
    if (!list) return;

    try {
      await goalListStore.addGoal(list.id, data.name, data.type, data.targetValue);
      showAddModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create goal';
    }
  }

  async function handleUpdateGoal(data: { name: string; type: GoalType; targetValue: number | null }) {
    if (!editingGoal || !list) return;

    try {
      const typeChanged = editingGoal.type !== data.type;

      // Calculate updates
      const updates: Partial<Goal> = {
        name: data.name,
        type: data.type,
        target_value: data.targetValue
      };

      if (typeChanged) {
        // Reset progress when changing type
        updates.current_value = 0;
        updates.completed = false;
      } else if (data.type === 'incremental' && data.targetValue !== null) {
        // Cap current_value if new target is lower
        if (editingGoal.current_value > data.targetValue) {
          updates.current_value = data.targetValue;
          updates.completed = true;
        }
      }

      await goalListStore.updateGoal(editingGoal.id, updates);
      editingGoal = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleToggleComplete(goal: Goal) {
    if (!list) return;

    try {
      await goalListStore.updateGoal(goal.id, { completed: !goal.completed });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleIncrement(goal: Goal, amount: number = 1) {
    if (!list || goal.type !== 'incremental') return;

    try {
      if (amount > 0) {
        await goalListStore.incrementGoal(goal.id, amount);
      } else {
        const newValue = Math.max(0, goal.current_value + amount);
        const completed = goal.target_value ? newValue >= goal.target_value : false;
        await goalListStore.updateGoal(goal.id, { current_value: newValue, completed });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleSetValue(goal: Goal, value: number) {
    if (!list || goal.type !== 'incremental') return;

    try {
      const clamped = Math.max(0, Math.min(value, goal.target_value ?? Infinity));
      const completed = goal.target_value ? clamped >= goal.target_value : false;
      await goalListStore.updateGoal(goal.id, { current_value: clamped, completed });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  async function handleDeleteGoal(goal: Goal) {
    if (!list || !confirm('Delete this goal?')) return;

    try {
      await goalListStore.deleteGoal(goal.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete goal';
    }
  }

  async function handleUpdateListName() {
    if (!list || !newListName.trim()) return;

    try {
      await goalListStore.updateName(list.id, newListName.trim());
      editingListName = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update list name';
    }
  }

  async function handleReorderGoal(goalId: string, newOrder: number) {
    try {
      await goalListStore.reorderGoal(goalId, newOrder);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to reorder goal';
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
      <DraggableList items={list.goals} onReorder={handleReorderGoal}>
        {#snippet renderItem({ item: goal, dragHandleProps })}
          <div class="goal-with-handle">
            <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
              ⋮⋮
            </button>
            <div class="goal-item-wrapper">
              <GoalItem
                {goal}
                onToggleComplete={() => handleToggleComplete(goal)}
                onIncrement={() => handleIncrement(goal, 1)}
                onDecrement={() => handleIncrement(goal, -1)}
                onSetValue={(value) => handleSetValue(goal, value)}
                onEdit={() => (editingGoal = goal)}
                onDelete={() => handleDeleteGoal(goal)}
              />
            </div>
          </div>
        {/snippet}
      </DraggableList>
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
    margin-bottom: 2.5rem;
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
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius-xl);
    color: var(--color-text-muted);
    transition: all 0.35s var(--ease-spring);
    white-space: nowrap;
    border: 1px solid rgba(108, 92, 231, 0.15);
    font-weight: 600;
    background: linear-gradient(135deg,
      rgba(15, 15, 30, 0.8) 0%,
      rgba(20, 20, 40, 0.7) 100%);
  }

  .back-btn:hover {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(108, 92, 231, 0.1) 100%);
    border-color: rgba(108, 92, 231, 0.4);
    color: var(--color-text);
    transform: translateX(-6px);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 800;
    cursor: pointer;
    padding: 0.5rem 1rem;
    margin: -0.5rem -1rem;
    border-radius: var(--radius-xl);
    transition: all 0.35s var(--ease-out);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    animation: textShimmer 8s linear infinite;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .page-header h1:hover {
    background: linear-gradient(135deg,
      var(--color-primary-light) 0%,
      var(--color-accent) 50%,
      var(--color-primary-light) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    filter: drop-shadow(0 0 30px var(--color-primary-glow));
    animation: textShimmer 4s linear infinite;
  }

  .edit-name-form {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .edit-name-form input {
    font-size: 1.375rem;
    font-weight: 700;
    padding: 0.625rem 1rem;
    width: 250px;
    background: rgba(108, 92, 231, 0.15);
    border: 2px solid var(--color-primary);
    box-shadow: 0 0 30px var(--color-primary-glow);
    letter-spacing: -0.01em;
  }

  .error-banner {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.18) 0%, rgba(255, 107, 107, 0.06) 100%);
    border: 1px solid rgba(255, 107, 107, 0.4);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(16px);
    box-shadow: 0 0 30px rgba(255, 107, 107, 0.1);
  }

  .error-banner button {
    color: var(--color-red);
    font-weight: 600;
    padding: 0.375rem 1rem;
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-spring);
  }

  .error-banner button:hover {
    background: rgba(255, 107, 107, 0.25);
    transform: scale(1.05);
  }

  .loading {
    text-align: center;
    padding: 5rem;
    color: var(--color-text-muted);
    font-size: 1.25rem;
    font-weight: 500;
  }

  .progress-section {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.5rem 1.75rem;
    margin-bottom: 2.5rem;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    position: relative;
    overflow: hidden;
  }

  .progress-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.4),
      rgba(255, 255, 255, 0.2),
      rgba(108, 92, 231, 0.4),
      transparent);
  }

  .goal-with-handle {
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .goal-item-wrapper {
    flex: 1;
    min-width: 0;
  }

  .goal-item-wrapper :global(.goal-item) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: none;
  }

  .goal-with-handle .drag-handle {
    background: linear-gradient(135deg,
      rgba(37, 37, 61, 0.9) 0%,
      rgba(26, 26, 46, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-right: none;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
    font-size: 0.875rem;
    letter-spacing: 1px;
    color: var(--color-text-muted);
    min-width: 32px;
  }
</style>
