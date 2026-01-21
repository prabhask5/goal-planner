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

  // Focus action for accessibility (replaces autofocus attribute)
  function focus(node: HTMLElement) {
    node.focus();
  }

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
  <title>{list?.name ?? 'Goal List'} - Stellar</title>
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
            use:focus
          />
          <button type="submit" class="btn btn-sm btn-primary">Save</button>
          <button type="button" class="btn btn-sm btn-secondary" onclick={() => { editingListName = false; newListName = list?.name ?? ''; }}>
            Cancel
          </button>
        </form>
      {:else}
        {#if loading}
          <div class="title-skeleton"></div>
        {:else}
          <button class="title-edit-btn" onclick={() => (editingListName = true)} title="Click to edit list name">
            <h1>{list?.name ?? 'List'}</h1>
          </button>
        {/if}
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
    <!-- List Detail Skeleton -->
    <div class="skeleton-progress-section">
      <div class="skeleton-progress-bar"></div>
      <div class="skeleton-shimmer"></div>
    </div>
    <div class="goals-skeleton">
      {#each Array(4) as _, i}
        <div class="goal-skeleton-card" style="--delay: {i * 0.1}s">
          <div class="goal-skeleton-handle"></div>
          <div class="goal-skeleton-content">
            <div class="goal-skeleton-header">
              <div class="goal-skeleton-checkbox"></div>
              <div class="goal-skeleton-info">
                <div class="goal-skeleton-title"></div>
                <div class="goal-skeleton-subtitle"></div>
              </div>
            </div>
            <div class="goal-skeleton-progress-container">
              <div class="goal-skeleton-progress"></div>
            </div>
            <div class="goal-skeleton-actions">
              <div class="goal-skeleton-btn"></div>
              <div class="goal-skeleton-btn"></div>
            </div>
          </div>
          <div class="skeleton-shimmer"></div>
        </div>
      {/each}
    </div>
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

  .title-edit-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    text-align: left;
  }

  .title-edit-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 4px;
    border-radius: var(--radius-lg);
  }

  .page-header h1,
  .title-edit-btn h1 {
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

  .page-header h1:hover,
  .title-edit-btn:hover h1 {
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SKELETON LOADING STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .skeleton-progress-section {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.5rem 1.75rem;
    margin-bottom: 2.5rem;
    position: relative;
    overflow: hidden;
  }

  .skeleton-progress-bar {
    height: 8px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-full);
  }

  .goals-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .goal-skeleton-card {
    display: flex;
    align-items: stretch;
    gap: 0;
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .goal-skeleton-handle {
    width: 32px;
    min-height: 100px;
    background: linear-gradient(135deg,
      rgba(37, 37, 61, 0.9) 0%,
      rgba(26, 26, 46, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-right: none;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
  }

  .goal-skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-left: none;
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
    position: relative;
  }

  .goal-skeleton-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .goal-skeleton-checkbox {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: rgba(108, 92, 231, 0.15);
    flex-shrink: 0;
  }

  .goal-skeleton-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .goal-skeleton-title {
    width: 60%;
    height: 1.125rem;
    background: linear-gradient(90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%);
    border-radius: var(--radius-md);
  }

  .goal-skeleton-subtitle {
    width: 40%;
    height: 0.875rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-sm);
  }

  .goal-skeleton-progress-container {
    padding-left: 2.75rem;
  }

  .goal-skeleton-progress {
    height: 6px;
    width: 80%;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-full);
  }

  .goal-skeleton-actions {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    gap: 0.5rem;
  }

  .goal-skeleton-btn {
    width: 36px;
    height: 36px;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-lg);
  }

  .skeleton-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.08) 20%,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(108, 92, 231, 0.08) 60%,
      transparent 100%
    );
    animation: shimmer 2.5s ease-in-out infinite;
  }

  @keyframes skeletonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 200%; }
  }

  .title-skeleton {
    width: 200px;
    height: 2rem;
    background: linear-gradient(90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%);
    border-radius: var(--radius-lg);
    animation: skeletonPulse 2s ease-in-out infinite;
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE RESPONSIVE STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .header-left {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .back-btn {
      width: 100%;
      justify-content: center;
      padding: 0.875rem;
    }

    .back-btn:hover {
      transform: none;
    }

    .back-btn:active {
      transform: scale(0.98);
    }

    .page-header h1 {
      font-size: 1.5rem;
      text-align: center;
      padding: 0.5rem;
      margin: 0;
    }

    .page-header h1:hover {
      filter: none;
    }

    .page-header .btn {
      width: 100%;
      justify-content: center;
      padding: 1rem;
    }

    .edit-name-form {
      flex-direction: column;
      width: 100%;
      gap: 0.75rem;
    }

    .edit-name-form input {
      width: 100%;
      font-size: 1.125rem;
    }

    .edit-name-form .btn {
      width: 100%;
    }

    .progress-section {
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      border-radius: var(--radius-xl);
    }

    .error-banner {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }

    .error-banner button {
      width: 100%;
    }

    .loading {
      padding: 3rem;
    }

    .goal-with-handle .drag-handle {
      min-width: 44px;
      font-size: 1rem;
    }
  }

  /* iPhone 14/15/16 Pro Max specific (430px) */
  @media (min-width: 430px) and (max-width: 640px) {
    .page-header h1 {
      font-size: 1.75rem;
    }

    .progress-section {
      padding: 1.5rem;
    }

    .edit-name-form input {
      font-size: 1.25rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .page-header h1 {
      font-size: 1.25rem;
    }

    .progress-section {
      padding: 1rem;
    }

    .edit-name-form input {
      font-size: 1rem;
    }
  }
</style>
