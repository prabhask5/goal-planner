<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { routineStore, dailyRoutinesStore } from '$lib/stores/data';
  import type { DailyRoutineGoal, GoalType } from '$lib/types';
  import RoutineForm from '$lib/components/RoutineForm.svelte';

  let routine = $state<DailyRoutineGoal | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);

  const routineId = $derived($page.params.id);

  // Subscribe to store
  $effect(() => {
    const unsubRoutine = routineStore.subscribe((value) => {
      routine = value;
    });
    const unsubLoading = routineStore.loading.subscribe((value) => {
      loading = value;
    });

    return () => {
      unsubRoutine();
      unsubLoading();
    };
  });

  onMount(async () => {
    await routineStore.load(routineId);
  });

  onDestroy(() => {
    routineStore.clear();
  });

  async function handleUpdateRoutine(data: {
    name: string;
    type: GoalType;
    targetValue: number | null;
    startDate: string;
    endDate: string | null;
  }) {
    if (!routine || saving) return;

    try {
      saving = true;
      await routineStore.update(routine.id, {
        name: data.name,
        type: data.type,
        target_value: data.targetValue,
        start_date: data.startDate,
        end_date: data.endDate
      });
      goto('/routines');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update routine';
      saving = false;
    }
  }

  async function handleDeleteRoutine() {
    if (!routine) return;
    if (!confirm('Delete this routine? All associated progress data will be lost.')) return;

    try {
      await dailyRoutinesStore.delete(routine.id);
      goto('/routines');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete routine';
    }
  }
</script>

<svelte:head>
  <title>Edit Routine - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <div class="header-left">
      <button class="back-btn" onclick={() => goto('/routines')} aria-label="Back to routines">
        ← Back
      </button>
      <h1>Edit Routine</h1>
    </div>
    <button class="btn btn-danger" onclick={handleDeleteRoutine}>
      Delete Routine
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
  {:else if routine}
    <div class="form-card">
      <RoutineForm
        name={routine.name}
        type={routine.type}
        targetValue={routine.target_value}
        startDate={routine.start_date}
        endDate={routine.end_date}
        submitLabel={saving ? 'Saving...' : 'Save Changes'}
        onSubmit={handleUpdateRoutine}
        onCancel={() => goto('/routines')}
      />
    </div>
  {:else}
    <div class="error-state">
      <p>Routine not found.</p>
      <a href="/routines" class="btn btn-primary">Back to Routines</a>
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

  .page-header h1 {
    font-size: 1.5rem;
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

  .form-card {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    max-width: 600px;
  }

  .error-state {
    text-align: center;
    padding: 3rem;
  }

  .error-state p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }
</style>
