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
      goto('/calendar');
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
      goto('/calendar');
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
      <button class="back-btn" onclick={() => goto('/calendar')} aria-label="Back to calendar">
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
        onCancel={() => goto('/calendar')}
      />
    </div>
  {:else}
    <div class="error-state">
      <p>Routine not found.</p>
      <a href="/calendar" class="btn btn-primary">Back to Calendar</a>
    </div>
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

  .form-card {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 2.5rem;
    max-width: 600px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
    position: relative;
    overflow: hidden;
  }

  .form-card::before {
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

  /* Nebula glow effect */
  .form-card::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -30%;
    width: 200px;
    height: 200%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.1) 0%, transparent 70%);
    pointer-events: none;
  }

  .error-state {
    text-align: center;
    padding: 5rem 2rem;
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    position: relative;
    overflow: hidden;
  }

  .error-state::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(108, 92, 231, 0.3), transparent);
  }

  .error-state p {
    color: var(--color-text-muted);
    margin-bottom: 2rem;
    font-size: 1.125rem;
    line-height: 1.6;
  }
</style>
