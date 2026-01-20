<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { dailyProgressStore, dailyRoutinesStore } from '$lib/stores/data';
  import { formatDisplayDate, isPastDay, isTodayDate } from '$lib/utils/dates';
  import { calculateGoalProgress } from '$lib/utils/colors';
  import type { DailyRoutineGoal, DailyGoalProgress } from '$lib/types';
  import GoalItem from '$lib/components/GoalItem.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import { parseISO } from 'date-fns';

  interface GoalWithProgress extends DailyRoutineGoal {
    progress?: DailyGoalProgress;
  }

  let routines = $state<DailyRoutineGoal[]>([]);
  let progressMap = $state<Map<string, DailyGoalProgress>>(new Map());
  let loading = $state(true);
  let error = $state<string | null>(null);

  const dateStr = $derived($page.params.date);
  const date = $derived(parseISO(dateStr));
  const displayDate = $derived(formatDisplayDate(dateStr));
  const canEdit = $derived(isPastDay(date) || isTodayDate(date));

  // Derive goals with their progress attached
  const goalsWithProgress = $derived<GoalWithProgress[]>(
    routines.map((routine) => ({
      ...routine,
      progress: progressMap.get(routine.id)
    }))
  );

  const totalProgress = $derived(() => {
    if (goalsWithProgress.length === 0) return 0;
    const total = goalsWithProgress.reduce((sum, goal) => {
      const currentValue = goal.progress?.current_value ?? 0;
      const completed = goal.progress?.completed ?? false;
      return sum + calculateGoalProgress(goal.type, completed, currentValue, goal.target_value);
    }, 0);
    return Math.round(total / goalsWithProgress.length);
  });

  // Subscribe to store
  $effect(() => {
    const unsubStore = dailyProgressStore.subscribe((value) => {
      if (value) {
        routines = value.routines;
        progressMap = value.progress;
      }
    });
    const unsubLoading = dailyProgressStore.loading.subscribe((value) => {
      loading = value;
    });

    return () => {
      unsubStore();
      unsubLoading();
    };
  });

  onMount(async () => {
    await loadData();
  });

  onDestroy(() => {
    dailyProgressStore.clear();
  });

  async function loadData() {
    try {
      error = null;
      await dailyProgressStore.load(dateStr);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    }
  }

  async function handleToggleComplete(goal: GoalWithProgress) {
    if (!canEdit) return;

    try {
      await dailyProgressStore.toggleComplete(goal.id, dateStr);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update progress';
    }
  }

  async function handleIncrement(goal: GoalWithProgress, amount: number) {
    if (!canEdit || goal.type !== 'incremental') return;

    try {
      await dailyProgressStore.increment(goal.id, dateStr, goal.target_value ?? 1, amount);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update progress';
    }
  }

  async function handleSetValue(goal: GoalWithProgress, value: number) {
    if (!canEdit || goal.type !== 'incremental') return;

    try {
      await dailyProgressStore.setValue(goal.id, dateStr, goal.target_value ?? 1, value);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update progress';
    }
  }

  async function handleReorderGoal(goalId: string, newOrder: number) {
    try {
      await dailyRoutinesStore.reorder(goalId, newOrder);
      // Reload the daily progress to get the updated order
      await dailyProgressStore.load(dateStr);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to reorder goal';
    }
  }
</script>

<svelte:head>
  <title>{displayDate} - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <div class="header-left">
      <button class="back-btn" onclick={() => goto('/calendar')} aria-label="Back to calendar">
        ← Back
      </button>
      <div class="header-info">
        <h1>{displayDate}</h1>
        {#if isTodayDate(date)}
          <span class="badge today">Today</span>
        {:else if isPastDay(date)}
          <span class="badge past">Past</span>
        {:else}
          <span class="badge future">Future</span>
        {/if}
      </div>
    </div>
    <a href="/calendar" class="btn btn-secondary">Manage Routines</a>
  </header>

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if goalsWithProgress.length === 0}
    <EmptyState
      icon="📅"
      title="No routines for this day"
      description="No daily routine goals are active on this date. Create routines with date ranges that include this day."
    >
      <a href="/calendar" class="btn btn-primary">Create Routine</a>
    </EmptyState>
  {:else}
    {#if canEdit}
      <div class="progress-section">
        <ProgressBar percentage={totalProgress()} />
      </div>
    {:else}
      <div class="info-banner">
        <p>This is a future date. Progress can only be tracked for past days and today.</p>
      </div>
    {/if}

    <DraggableList items={goalsWithProgress} onReorder={handleReorderGoal} disabled={!canEdit}>
      {#snippet renderItem({ item: goal, dragHandleProps })}
        <div class="goal-with-handle">
          {#if canEdit}
            <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
              ⋮⋮
            </button>
          {/if}
          <div class="goal-item-wrapper" class:no-handle={!canEdit}>
            <GoalItem
              {goal}
              onToggleComplete={canEdit ? () => handleToggleComplete(goal) : undefined}
              onIncrement={canEdit ? () => handleIncrement(goal, 1) : undefined}
              onDecrement={canEdit ? () => handleIncrement(goal, -1) : undefined}
              onSetValue={canEdit ? (value) => handleSetValue(goal, value) : undefined}
            />
          </div>
        </div>
      {/snippet}
    </DraggableList>
  {/if}
</div>

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

  .header-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 800;
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

  .badge {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.4rem 0.875rem;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid transparent;
  }

  .badge.today {
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 0 25px var(--color-primary-glow);
    animation: todayPulse 2s var(--ease-smooth) infinite;
  }

  @keyframes todayPulse {
    0%, 100% { box-shadow: 0 0 20px var(--color-primary-glow); }
    50% { box-shadow: 0 0 35px var(--color-primary-glow), 0 0 50px rgba(108, 92, 231, 0.3); }
  }

  .badge.past {
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.9) 0%, rgba(26, 26, 46, 0.8) 100%);
    color: var(--color-text-muted);
    border-color: rgba(108, 92, 231, 0.2);
  }

  .badge.future {
    background: rgba(37, 37, 61, 0.4);
    color: var(--color-text-muted);
    border-color: rgba(58, 58, 92, 0.3);
    opacity: 0.7;
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

  .info-banner {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.15) 0%, rgba(108, 92, 231, 0.05) 100%);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    backdrop-filter: blur(16px);
    position: relative;
    overflow: hidden;
  }

  .info-banner::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(108, 92, 231, 0.3), transparent);
  }

  .info-banner p {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.6;
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

  .goal-item-wrapper:not(.no-handle) :global(.goal-item) {
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
