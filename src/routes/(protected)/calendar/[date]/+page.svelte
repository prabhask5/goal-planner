<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { dailyProgressStore } from '$lib/stores/data';
  import { formatDisplayDate, isPastDay, isTodayDate } from '$lib/utils/dates';
  import { calculateGoalProgress } from '$lib/utils/colors';
  import type { DailyRoutineGoal, DailyGoalProgress } from '$lib/types';
  import GoalItem from '$lib/components/GoalItem.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
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
    <a href="/routines" class="btn btn-secondary">Manage Routines</a>
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
      <a href="/routines" class="btn btn-primary">Create Routine</a>
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

    <div class="goals-list">
      {#each goalsWithProgress as goal (goal.id)}
        <GoalItem
          {goal}
          onToggleComplete={canEdit ? () => handleToggleComplete(goal) : undefined}
          onIncrement={canEdit ? () => handleIncrement(goal, 1) : undefined}
          onDecrement={canEdit ? () => handleIncrement(goal, -1) : undefined}
        />
      {/each}
    </div>
  {/if}
</div>

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

  .header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .page-header h1 {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
  }

  .badge.today {
    background-color: var(--color-primary);
    color: white;
  }

  .badge.past {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-muted);
  }

  .badge.future {
    background-color: var(--color-border);
    color: var(--color-text-muted);
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

  .info-banner {
    background-color: rgba(108, 92, 231, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .info-banner p {
    color: var(--color-text-muted);
    font-size: 0.875rem;
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
