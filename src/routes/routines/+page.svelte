<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    getDailyRoutineGoals,
    createDailyRoutineGoal,
    deleteDailyRoutineGoal
  } from '$lib/supabase/database';
  import { formatDisplayDate, isDateInRange, formatDate } from '$lib/utils/dates';
  import type { DailyRoutineGoal, GoalType } from '$lib/types';
  import Modal from '$lib/components/Modal.svelte';
  import RoutineForm from '$lib/components/RoutineForm.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let routines = $state<DailyRoutineGoal[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showCreateModal = $state(false);

  const today = formatDate(new Date());

  const activeRoutines = $derived(
    routines.filter((r) => isDateInRange(today, r.start_date, r.end_date))
  );
  const inactiveRoutines = $derived(
    routines.filter((r) => !isDateInRange(today, r.start_date, r.end_date))
  );

  onMount(async () => {
    await loadRoutines();
  });

  async function loadRoutines() {
    try {
      loading = true;
      error = null;
      routines = await getDailyRoutineGoals();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load routines';
    } finally {
      loading = false;
    }
  }

  async function handleCreateRoutine(data: {
    name: string;
    type: GoalType;
    targetValue: number | null;
    startDate: string;
    endDate: string | null;
  }) {
    try {
      const newRoutine = await createDailyRoutineGoal(
        data.name,
        data.type,
        data.targetValue,
        data.startDate,
        data.endDate
      );
      routines = [newRoutine, ...routines];
      showCreateModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create routine';
    }
  }

  async function handleDeleteRoutine(id: string) {
    if (!confirm('Delete this routine? All associated progress data will be lost.')) return;

    try {
      await deleteDailyRoutineGoal(id);
      routines = routines.filter((r) => r.id !== id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete routine';
    }
  }

  function navigateToEdit(id: string) {
    goto(`/routines/${id}`);
  }
</script>

<svelte:head>
  <title>Daily Routines - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <div>
      <h1>Daily Routines</h1>
      <p class="subtitle">Manage your recurring daily goals</p>
    </div>
    <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
      + New Routine
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
  {:else if routines.length === 0}
    <EmptyState
      icon="🔄"
      title="No routines yet"
      description="Create daily routines to track recurring goals. Each routine can have a date range when it's active."
    >
      <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
        Create First Routine
      </button>
    </EmptyState>
  {:else}
    {#if activeRoutines.length > 0}
      <section class="routine-section">
        <h2>Active Routines ({activeRoutines.length})</h2>
        <div class="routines-list">
          {#each activeRoutines as routine (routine.id)}
            <div class="routine-card">
              <div class="routine-info">
                <h3>{routine.name}</h3>
                <div class="routine-meta">
                  <span class="badge type-{routine.type}">
                    {routine.type === 'completion' ? '✓ Completion' : '↑ Incremental'}
                  </span>
                  {#if routine.type === 'incremental'}
                    <span class="target">Target: {routine.target_value}/day</span>
                  {/if}
                </div>
                <p class="date-range">
                  {formatDisplayDate(routine.start_date)} →
                  {routine.end_date ? formatDisplayDate(routine.end_date) : 'No end date'}
                </p>
              </div>
              <div class="routine-actions">
                <button
                  class="action-btn"
                  onclick={() => navigateToEdit(routine.id)}
                  aria-label="Edit routine"
                >
                  ✎
                </button>
                <button
                  class="action-btn delete"
                  onclick={() => handleDeleteRoutine(routine.id)}
                  aria-label="Delete routine"
                >
                  ×
                </button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if inactiveRoutines.length > 0}
      <section class="routine-section">
        <h2>Inactive Routines ({inactiveRoutines.length})</h2>
        <p class="section-description">These routines are outside their active date range.</p>
        <div class="routines-list">
          {#each inactiveRoutines as routine (routine.id)}
            <div class="routine-card inactive">
              <div class="routine-info">
                <h3>{routine.name}</h3>
                <div class="routine-meta">
                  <span class="badge type-{routine.type}">
                    {routine.type === 'completion' ? '✓ Completion' : '↑ Incremental'}
                  </span>
                  {#if routine.type === 'incremental'}
                    <span class="target">Target: {routine.target_value}/day</span>
                  {/if}
                </div>
                <p class="date-range">
                  {formatDisplayDate(routine.start_date)} →
                  {routine.end_date ? formatDisplayDate(routine.end_date) : 'No end date'}
                </p>
              </div>
              <div class="routine-actions">
                <button
                  class="action-btn"
                  onclick={() => navigateToEdit(routine.id)}
                  aria-label="Edit routine"
                >
                  ✎
                </button>
                <button
                  class="action-btn delete"
                  onclick={() => handleDeleteRoutine(routine.id)}
                  aria-label="Delete routine"
                >
                  ×
                </button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<Modal open={showCreateModal} title="Create Daily Routine" onClose={() => (showCreateModal = false)}>
  <RoutineForm onSubmit={handleCreateRoutine} onCancel={() => (showCreateModal = false)} />
</Modal>

<style>
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .page-header h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.875rem;
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

  .routine-section {
    margin-bottom: 2rem;
  }

  .routine-section h2 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .section-description {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .routines-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .routine-card {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-left-width: 4px;
    border-left-color: var(--color-green);
    border-radius: var(--radius-lg);
  }

  .routine-card.inactive {
    border-left-color: var(--color-text-muted);
    opacity: 0.7;
  }

  .routine-info {
    flex: 1;
    min-width: 0;
  }

  .routine-info h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .routine-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-tertiary);
  }

  .badge.type-completion {
    color: var(--color-green);
  }

  .badge.type-incremental {
    color: var(--color-primary);
  }

  .target {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .date-range {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .routine-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    opacity: 0.6;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    opacity: 1;
    background-color: var(--color-bg-tertiary);
  }

  .action-btn.delete:hover {
    background-color: var(--color-red);
    color: white;
  }
</style>
