<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { monthProgressStore } from '$lib/stores/data';
  import { formatDate, isPastDay, isTodayDate } from '$lib/utils/dates';
  import type { DayProgress } from '$lib/types';
  import Calendar from '$lib/components/Calendar.svelte';

  let currentDate = $state(new Date());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let monthProgressData = $state<Map<string, DayProgress>>(new Map());

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

  // Subscribe to store
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

  onMount(async () => {
    await loadData();
  });

  onDestroy(() => {
    monthProgressStore.clear();
  });

  async function loadData() {
    try {
      error = null;
      await monthProgressStore.load(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    }
  }

  async function handleMonthChange(newDate: Date) {
    currentDate = newDate;
    await loadData();
  }

  function handleDayClick(date: Date) {
    goto(`/calendar/${formatDate(date)}`);
  }
</script>

<svelte:head>
  <title>Calendar - Goal Planner</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <h1>Daily Routine Calendar</h1>
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
  {:else}
    <Calendar
      {currentDate}
      dayProgressMap={dayProgressMap()}
      onDayClick={handleDayClick}
      onMonthChange={handleMonthChange}
    />

    <div class="legend">
      <h3>Legend</h3>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-red)"></span>
          <span>0% complete</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-yellow)"></span>
          <span>50% complete</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-green)"></span>
          <span>100% complete</span>
        </div>
      </div>
    </div>
  {/if}
</div>

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
    padding: 3rem;
    color: var(--color-text-muted);
  }

  .legend {
    margin-top: 1.5rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1rem;
  }

  .legend h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: 0.75rem;
  }

  .legend-items {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .legend-color {
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
  }
</style>
