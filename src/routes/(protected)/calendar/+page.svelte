<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { monthProgressStore, dailyRoutinesStore } from '$lib/stores/data';
  import {
    formatDate,
    formatDisplayDate,
    isPastDay,
    isTodayDate,
    isRoutineActiveOnDate
  } from '$lib/utils/dates';
  import type { DayProgress, DailyRoutineGoal, GoalType, DayOfWeek } from '$lib/types';
  import Calendar from '$lib/components/Calendar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import RoutineForm from '$lib/components/RoutineForm.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { remoteChangeAnimation } from '$lib/actions/remoteChange';

  let currentDate = $state(new Date());
  let loading = $state(true);
  let routinesLoading = $state(true);
  let error = $state<string | null>(null);
  let monthProgressData = $state<Map<string, DayProgress>>(new Map());
  let routines = $state<DailyRoutineGoal[]>([]);
  let showCreateModal = $state(false);

  const today = formatDate(new Date());

  // Helper to display active days as a short string
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  function getActiveDaysDisplay(activeDays: DayOfWeek[] | null | undefined): string {
    // null or undefined means all days (backwards compatible with existing routines)
    if (activeDays == null || activeDays.length === 0) return 'Every day';
    if (activeDays.length === 7) return 'Every day';
    if (activeDays.length === 5 && !activeDays.includes(0) && !activeDays.includes(6)) {
      return 'Weekdays';
    }
    if (activeDays.length === 2 && activeDays.includes(0) && activeDays.includes(6)) {
      return 'Weekends';
    }
    return [...activeDays]
      .sort((a, b) => a - b)
      .map((d) => dayLabels[d])
      .join(' ');
  }

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

  const activeRoutines = $derived(routines.filter((r) => isRoutineActiveOnDate(r, today)));
  const inactiveRoutines = $derived(routines.filter((r) => !isRoutineActiveOnDate(r, today)));

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

    // If we arrived via hash (from edit page), clear it from URL so it doesn't persist
    // The browser already scrolled to the element, we just clean up the URL
    if (window.location.hash === '#manage-routines') {
      history.replaceState(null, '', window.location.pathname);
    }
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
    activeDays: DayOfWeek[] | null;
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
        session.user.id,
        data.activeDays
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
  <title>Calendar - Stellar</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <h1>Daily Routines</h1>
    <div class="header-actions">
      <button class="btn btn-secondary btn-sm" onclick={() => goto(`/calendar/${today}`)}>
        Today's Goals
      </button>
      <button class="btn btn-primary btn-sm" onclick={() => (showCreateModal = true)}>
        + New Routine
      </button>
    </div>
  </header>

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <!-- Calendar Skeleton -->
    <div class="calendar-skeleton">
      <div class="skeleton-header">
        <div class="skeleton-nav-btn"></div>
        <div class="skeleton-month-title"></div>
        <div class="skeleton-nav-btn"></div>
      </div>
      <div class="skeleton-weekdays">
        {#each Array(7) as _}
          <div class="skeleton-weekday"></div>
        {/each}
      </div>
      <div class="skeleton-grid">
        {#each Array(35) as _, i}
          <div class="skeleton-day" style="--delay: {(i % 7) * 0.05}s"></div>
        {/each}
      </div>
      <div class="skeleton-shimmer"></div>
    </div>
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
  <section id="manage-routines" class="routines-section">
    <h2>Manage Routines</h2>

    {#if routinesLoading}
      <!-- Routines Skeleton -->
      <div class="routines-skeleton">
        {#each Array(3) as _, i}
          <div class="routine-skeleton-card" style="--delay: {i * 0.1}s">
            <div class="routine-skeleton-handle"></div>
            <div class="routine-skeleton-content">
              <div class="routine-skeleton-title"></div>
              <div class="routine-skeleton-meta">
                <div class="routine-skeleton-badge"></div>
                <div class="routine-skeleton-badge days"></div>
                <div class="routine-skeleton-date"></div>
              </div>
            </div>
            <div class="routine-skeleton-actions">
              <div class="routine-skeleton-btn"></div>
              <div class="routine-skeleton-btn"></div>
            </div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
    {:else if routines.length === 0}
      <EmptyState
        icon="🔄"
        title="No routines yet"
        description="Create your first daily routine to start tracking."
      >
        <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>
          Create First Routine
        </button>
      </EmptyState>
    {:else}
      {#if activeRoutines.length > 0}
        <div class="routine-group">
          <h3>Active ({activeRoutines.length})</h3>
          <DraggableList items={activeRoutines} onReorder={handleReorderRoutine}>
            {#snippet renderItem({ item: routine, dragHandleProps })}
              <div
                class="routine-with-handle"
                use:remoteChangeAnimation={{
                  entityId: routine.id,
                  entityType: 'daily_routine_goals'
                }}
              >
                <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
                  ⋮⋮
                </button>
                <div class="routine-card">
                  <div class="routine-info">
                    <h4>{routine.name}</h4>
                    <div class="routine-meta">
                      <span class="badge type-{routine.type}">
                        {routine.type === 'completion' ? '✓' : '↑'}
                        {routine.type === 'incremental'
                          ? routine.target_value + '/day'
                          : 'Complete'}
                      </span>
                      <span class="badge days-badge">
                        {getActiveDaysDisplay(routine.active_days)}
                      </span>
                      <span class="date-range">
                        {formatDisplayDate(routine.start_date)} → {routine.end_date
                          ? formatDisplayDate(routine.end_date)
                          : '∞'}
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
              <div
                class="routine-with-handle"
                use:remoteChangeAnimation={{
                  entityId: routine.id,
                  entityType: 'daily_routine_goals'
                }}
              >
                <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
                  ⋮⋮
                </button>
                <div class="routine-card inactive">
                  <div class="routine-info">
                    <h4>{routine.name}</h4>
                    <div class="routine-meta">
                      <span class="badge type-{routine.type}">
                        {routine.type === 'completion' ? '✓' : '↑'}
                        {routine.type === 'incremental'
                          ? routine.target_value + '/day'
                          : 'Complete'}
                      </span>
                      <span class="badge days-badge">
                        {getActiveDaysDisplay(routine.active_days)}
                      </span>
                      <span class="date-range">
                        {formatDisplayDate(routine.start_date)} → {routine.end_date
                          ? formatDisplayDate(routine.end_date)
                          : '∞'}
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

<Modal
  open={showCreateModal}
  title="Create Daily Routine"
  onClose={() => (showCreateModal = false)}
>
  <RoutineForm onSubmit={handleCreateRoutine} onCancel={() => (showCreateModal = false)} />
</Modal>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .page-header h1 {
    font-size: 2.25rem;
    font-weight: 800;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    animation: textShimmer 8s linear infinite;
  }

  @keyframes textShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  .error-banner {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.18) 0%,
      rgba(255, 107, 107, 0.06) 100%
    );
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

  .calendar-skeleton {
    background: linear-gradient(
      165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(10, 10, 22, 0.98) 50%,
      rgba(15, 15, 30, 0.95) 100%
    );
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    overflow: hidden;
    position: relative;
  }

  .skeleton-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
  }

  .skeleton-nav-btn {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    background: rgba(108, 92, 231, 0.1);
  }

  .skeleton-month-title {
    width: 180px;
    height: 1.75rem;
    border-radius: var(--radius-md);
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%
    );
  }

  .skeleton-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
    padding: 1rem;
    gap: 0.5rem;
  }

  .skeleton-weekday {
    height: 0.75rem;
    border-radius: var(--radius-sm);
    background: rgba(108, 92, 231, 0.1);
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    padding: 6px;
  }

  .skeleton-day {
    aspect-ratio: 1;
    min-height: 70px;
    border-radius: var(--radius-md);
    background: linear-gradient(145deg, rgba(20, 20, 40, 0.95) 0%, rgba(15, 15, 32, 0.9) 100%);
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  /* Routines Skeleton */
  .routines-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .routine-skeleton-card {
    display: flex;
    align-items: center;
    gap: 0;
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .routine-skeleton-handle {
    width: 32px;
    min-height: 80px;
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.9) 0%, rgba(26, 26, 46, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-right: none;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
  }

  .routine-skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-left: 4px solid rgba(108, 92, 231, 0.3);
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
  }

  .routine-skeleton-title {
    width: 60%;
    height: 1.125rem;
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%
    );
    border-radius: var(--radius-md);
  }

  .routine-skeleton-meta {
    display: flex;
    gap: 0.75rem;
  }

  .routine-skeleton-badge {
    width: 80px;
    height: 1.5rem;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-lg);
  }

  .routine-skeleton-badge.days {
    width: 70px;
    background: rgba(255, 255, 255, 0.05);
  }

  .routine-skeleton-date {
    width: 140px;
    height: 0.875rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-sm);
    align-self: center;
  }

  .routine-skeleton-actions {
    display: flex;
    gap: 0.5rem;
    padding-right: 1rem;
  }

  .routine-skeleton-btn {
    width: 36px;
    height: 36px;
    background: rgba(108, 92, 231, 0.1);
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
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  @keyframes shimmer {
    0% {
      left: -100%;
    }
    100% {
      left: 200%;
    }
  }

  .legend {
    margin-top: 2rem;
    display: flex;
    justify-content: center;
  }

  .legend-items {
    display: flex;
    gap: 2rem;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.9) 0%, rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-full);
    backdrop-filter: blur(16px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }

  .legend-color {
    width: 18px;
    height: 18px;
    border-radius: var(--radius-md);
    box-shadow: 0 0 15px currentColor;
    animation: legendPulse 3s ease-in-out infinite;
  }

  .legend-item:nth-child(1) .legend-color {
    animation-delay: 0s;
  }
  .legend-item:nth-child(2) .legend-color {
    animation-delay: 1s;
  }
  .legend-item:nth-child(3) .legend-color {
    animation-delay: 2s;
  }

  @keyframes legendPulse {
    0%,
    100% {
      box-shadow: 0 0 10px currentColor;
    }
    50% {
      box-shadow:
        0 0 20px currentColor,
        0 0 30px currentColor;
    }
  }

  /* Routines Section */
  .routines-section {
    margin-top: 4rem;
    padding-top: 3rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
    position: relative;
  }

  .routines-section::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 50%;
    transform: translateX(-50%);
    width: 120px;
    height: 4px;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .routines-section h2 {
    font-size: 1.625rem;
    font-weight: 700;
    margin-bottom: 2rem;
    background: linear-gradient(135deg, var(--color-text) 0%, var(--color-primary-light) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .routine-group {
    margin-bottom: 2.5rem;
  }

  .routine-group h3 {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .routine-with-handle {
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .routine-with-handle .drag-handle {
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.9) 0%, rgba(26, 26, 46, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-right: none;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
    font-size: 0.875rem;
    letter-spacing: 1px;
    color: var(--color-text-muted);
    min-width: 32px;
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
    gap: 1.25rem;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-left-width: 4px;
    border-left-color: var(--color-green);
    border-radius: var(--radius-xl);
    transition: all 0.35s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .routine-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  }

  .routine-card:hover {
    transform: translateX(6px);
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(108, 92, 231, 0.15);
  }

  .routine-card.inactive {
    border-left-color: var(--color-text-muted);
    opacity: 0.5;
  }

  .routine-card.inactive:hover {
    opacity: 0.7;
  }

  .routine-info {
    flex: 1;
    min-width: 0;
  }

  .routine-info h4 {
    font-size: 1.0625rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .routine-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.25rem 0.625rem;
    border-radius: var(--radius-lg);
    background: rgba(37, 37, 61, 0.9);
    border: 1px solid rgba(108, 92, 231, 0.2);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .badge.type-completion {
    color: var(--color-green);
    border-color: rgba(38, 222, 129, 0.3);
    box-shadow: 0 0 10px rgba(38, 222, 129, 0.1);
  }

  .badge.type-incremental {
    color: var(--color-primary-light);
    border-color: rgba(108, 92, 231, 0.3);
    box-shadow: 0 0 10px var(--color-primary-glow);
  }

  .badge.days-badge {
    color: var(--color-text-muted);
    border-color: rgba(255, 255, 255, 0.1);
    font-family: var(--font-mono);
    letter-spacing: 0.1em;
  }

  .date-range {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 500;
    font-family: var(--font-mono);
  }

  .routine-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.125rem;
    opacity: 0.4;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
  }

  .action-btn:hover {
    opacity: 1;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.25) 0%, rgba(108, 92, 231, 0.1) 100%);
    border-color: rgba(108, 92, 231, 0.4);
    transform: scale(1.15);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .action-btn.delete:hover {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.3) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--color-red);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
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

    .page-header h1 {
      font-size: 1.75rem;
      text-align: center;
    }

    .header-actions {
      justify-content: center;
      gap: 0.625rem;
    }

    .header-actions .btn {
      flex: 1;
      max-width: 160px;
      justify-content: center;
    }

    .legend {
      margin-top: 1.25rem;
    }

    .legend-items {
      gap: 1rem;
      padding: 0.75rem 1.25rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .legend-item {
      font-size: 0.75rem;
    }

    .legend-color {
      width: 14px;
      height: 14px;
    }

    .routines-section {
      margin-top: 2.5rem;
      padding-top: 2rem;
    }

    .routines-section h2 {
      font-size: 1.375rem;
      text-align: center;
    }

    .routine-card {
      padding: 1rem 1.25rem;
      gap: 0.75rem;
    }

    .routine-card:hover {
      transform: none;
    }

    .routine-card:active {
      transform: scale(0.98);
    }

    .routine-info h4 {
      font-size: 1rem;
    }

    .routine-meta {
      gap: 0.5rem;
    }

    .date-range {
      font-size: 0.6875rem;
    }

    .action-btn {
      width: 44px;
      height: 44px;
      opacity: 0.5;
    }

    .routine-with-handle .drag-handle {
      min-width: 36px;
    }

    .error-banner {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }

    .loading {
      padding: 3rem;
    }
  }

  /* Medium phones (400-430px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .header-actions .btn {
      padding: 0.5rem 1rem;
    }
  }

  /* iPhone 14/15/16 Pro Max specific */
  @media (min-width: 430px) and (max-width: 640px) {
    .page-header h1 {
      font-size: 2rem;
    }

    .page-header {
      flex-direction: row;
      align-items: center;
    }

    .header-actions {
      justify-content: flex-end;
    }

    .routine-card {
      padding: 1.25rem 1.5rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .page-header h1 {
      font-size: 1.5rem;
    }

    .header-actions .btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
    }

    .routine-info h4 {
      font-size: 0.9375rem;
    }

    .badge {
      font-size: 0.625rem;
      padding: 0.2rem 0.5rem;
    }
  }
</style>
