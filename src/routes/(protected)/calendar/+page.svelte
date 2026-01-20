<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { monthProgressStore, dailyRoutinesStore } from '$lib/stores/data';
  import { formatDate, formatDisplayDate, isPastDay, isTodayDate, isDateInRange } from '$lib/utils/dates';
  import type { DayProgress, DailyRoutineGoal, GoalType } from '$lib/types';
  import Calendar from '$lib/components/Calendar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import RoutineForm from '$lib/components/RoutineForm.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';

  let currentDate = $state(new Date());
  let loading = $state(true);
  let routinesLoading = $state(true);
  let error = $state<string | null>(null);
  let monthProgressData = $state<Map<string, DayProgress>>(new Map());
  let routines = $state<DailyRoutineGoal[]>([]);
  let showCreateModal = $state(false);

  const today = formatDate(new Date());

  // Derive dayProgressMap from store, filtering for past days and today only
  const dayProgressMap = $derived(() => {
    const filteredMap = new Map<string, DayProgress>();

    for (const [dateStr, progress] of monthProgressData) {
      const date = new Date(dateStr + 'T00:00:00');
      if (isPastDay(date) || isTodayDate(date)) {
        filteredMap.set(dateStr, progress);
      }
    }

    return filteredMap;
  });

  const activeRoutines = $derived(
    routines.filter((r) => isDateInRange(today, r.start_date, r.end_date))
  );
  const inactiveRoutines = $derived(
    routines.filter((r) => !isDateInRange(today, r.start_date, r.end_date))
  );

  // Subscribe to stores
  $effect(() => {
    const unsubStore = monthProgressStore.subscribe((value) => {
      if (value) {
        monthProgressData = value.dayProgress;
      }
    });
    const unsubLoading = monthProgressStore.loading.subscribe((value) => {
      loading = value;
    });

    return () => {
      unsubStore();
      unsubLoading();
    };
  });

  $effect(() => {
    const unsubRoutines = dailyRoutinesStore.subscribe((value) => {
      routines = value;
    });
    const unsubRoutinesLoading = dailyRoutinesStore.loading.subscribe((value) => {
      routinesLoading = value;
    });

    return () => {
      unsubRoutines();
      unsubRoutinesLoading();
    };
  });

  onMount(async () => {
    await Promise.all([loadCalendarData(), dailyRoutinesStore.load()]);
  });

  onDestroy(() => {
    monthProgressStore.clear();
  });

  async function loadCalendarData() {
    try {
      error = null;
      await monthProgressStore.load(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    }
  }

  async function handleMonthChange(newDate: Date) {
    currentDate = newDate;
    await loadCalendarData();
  }

  function handleDayClick(date: Date) {
    goto(`/calendar/${formatDate(date)}`);
  }

  async function handleCreateRoutine(data: {
    name: string;
    type: GoalType;
    targetValue: number | null;
    startDate: string;
    endDate: string | null;
  }) {
    try {
      const session = $page.data.session;
      if (!session?.user?.id) {
        error = 'Not authenticated';
        return;
      }
      await dailyRoutinesStore.create(
        data.name,
        data.type,
        data.targetValue,
        data.startDate,
        data.endDate,
        session.user.id
      );
      showCreateModal = false;
      // Refresh calendar data to show new routine
      await loadCalendarData();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create routine';
    }
  }

  async function handleDeleteRoutine(id: string) {
    if (!confirm('Delete this routine? All associated progress data will be lost.')) return;

    try {
      await dailyRoutinesStore.delete(id);
      // Refresh calendar data
      await loadCalendarData();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete routine';
    }
  }

  function navigateToEdit(id: string) {
    goto(`/routines/${id}`);
  }

  async function handleReorderRoutine(routineId: string, newOrder: number) {
    try {
      await dailyRoutinesStore.reorder(routineId, newOrder);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to reorder routine';
    }
  }
</script>

<svelte:head>
  <title>Calendar - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <h1>Daily Routines</h1>
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
  {:else}
    <Calendar
      {currentDate}
      dayProgressMap={dayProgressMap()}
      onDayClick={handleDayClick}
      onMonthChange={handleMonthChange}
    />

    <div class="legend">
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-red)"></span>
          <span>0%</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-yellow)"></span>
          <span>50%</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-green)"></span>
          <span>100%</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Routines Section -->
  <section class="routines-section">
    <h2>Manage Routines</h2>

    {#if routinesLoading}
      <div class="loading">Loading routines...</div>
    {:else if routines.length === 0}
      <div class="empty-routines">
        <p>No routines yet. Create your first daily routine to start tracking.</p>
        <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
          Create First Routine
        </button>
      </div>
    {:else}
      {#if activeRoutines.length > 0}
        <div class="routine-group">
          <h3>Active ({activeRoutines.length})</h3>
          <DraggableList items={activeRoutines} onReorder={handleReorderRoutine}>
            {#snippet renderItem({ item: routine, dragHandleProps })}
              <div class="routine-with-handle">
                <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
                  ⋮⋮
                </button>
                <div class="routine-card">
                  <div class="routine-info">
                    <h4>{routine.name}</h4>
                    <div class="routine-meta">
                      <span class="badge type-{routine.type}">
                        {routine.type === 'completion' ? '✓' : '↑'} {routine.type === 'incremental' ? routine.target_value + '/day' : 'Complete'}
                      </span>
                      <span class="date-range">
                        {formatDisplayDate(routine.start_date)} → {routine.end_date ? formatDisplayDate(routine.end_date) : '∞'}
                      </span>
                    </div>
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
              </div>
            {/snippet}
          </DraggableList>
        </div>
      {/if}

      {#if inactiveRoutines.length > 0}
        <div class="routine-group">
          <h3>Inactive ({inactiveRoutines.length})</h3>
          <DraggableList items={inactiveRoutines} onReorder={handleReorderRoutine}>
            {#snippet renderItem({ item: routine, dragHandleProps })}
              <div class="routine-with-handle">
                <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
                  ⋮⋮
                </button>
                <div class="routine-card inactive">
                  <div class="routine-info">
                    <h4>{routine.name}</h4>
                    <div class="routine-meta">
                      <span class="badge type-{routine.type}">
                        {routine.type === 'completion' ? '✓' : '↑'} {routine.type === 'incremental' ? routine.target_value + '/day' : 'Complete'}
                      </span>
                      <span class="date-range">
                        {formatDisplayDate(routine.start_date)} → {routine.end_date ? formatDisplayDate(routine.end_date) : '∞'}
                      </span>
                    </div>
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
              </div>
            {/snippet}
          </DraggableList>
        </div>
      {/if}
    {/if}
  </section>
</div>

<Modal open={showCreateModal} title="Create Daily Routine" onClose={() => (showCreateModal = false)}>
  <RoutineForm onSubmit={handleCreateRoutine} onCancel={() => (showCreateModal = false)} />
</Modal>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
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
    padding: 2rem;
    color: var(--color-text-muted);
  }

  .legend {
    margin-top: 1rem;
    display: flex;
    justify-content: center;
  }

  .legend-items {
    display: flex;
    gap: 1rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-sm);
  }

  /* Routines Section */
  .routines-section {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid var(--color-border);
  }

  .routines-section h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .empty-routines {
    text-align: center;
    padding: 2rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .empty-routines p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .routine-group {
    margin-bottom: 1.5rem;
  }

  .routine-group h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: 0.5rem;
  }

  .routine-with-handle {
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .routine-with-handle .drag-handle {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    font-size: 0.875rem;
    letter-spacing: 1px;
    color: var(--color-text-muted);
    min-width: 24px;
  }

  .routine-with-handle .routine-card {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    flex: 1;
    min-width: 0;
  }

  .routine-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-left-width: 3px;
    border-left-color: var(--color-green);
    border-radius: var(--radius-md);
  }

  .routine-card.inactive {
    border-left-color: var(--color-text-muted);
    opacity: 0.7;
  }

  .routine-info {
    flex: 1;
    min-width: 0;
  }

  .routine-info h4 {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .routine-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-tertiary);
  }

  .badge.type-completion {
    color: var(--color-green);
  }

  .badge.type-incremental {
    color: var(--color-primary);
  }

  .date-range {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .routine-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
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
