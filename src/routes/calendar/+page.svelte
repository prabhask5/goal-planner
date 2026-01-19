<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getDailyRoutineGoals, getMonthProgress } from '$lib/supabase/database';
  import { formatDate, isDateInRange, isPastDay, isTodayDate } from '$lib/utils/dates';
  import { calculateGoalProgress } from '$lib/utils/colors';
  import type { DailyRoutineGoal, DailyGoalProgress, DayProgress } from '$lib/types';
  import Calendar from '$lib/components/Calendar.svelte';

  let currentDate = $state(new Date());
  let routineGoals = $state<DailyRoutineGoal[]>([]);
  let monthProgress = $state<DailyGoalProgress[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const dayProgressMap = $derived(() => {
    const map = new Map<string, DayProgress>();

    // Get all days that have active goals
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDate(date);

      // Only calculate for past days and today
      if (!isPastDay(date) && !isTodayDate(date)) continue;

      // Find active routine goals for this day
      const activeGoals = routineGoals.filter((goal) =>
        isDateInRange(date, goal.start_date, goal.end_date)
      );

      if (activeGoals.length === 0) continue;

      // Calculate progress for each active goal
      let totalProgress = 0;
      let totalGoals = activeGoals.length;
      let completedGoals = 0;

      for (const goal of activeGoals) {
        const progress = monthProgress.find(
          (p) => p.daily_routine_goal_id === goal.id && p.date === dateStr
        );

        const currentValue = progress?.current_value ?? 0;
        const completed = progress?.completed ?? false;

        const goalProgress = calculateGoalProgress(
          goal.type,
          completed,
          currentValue,
          goal.target_value
        );

        totalProgress += goalProgress;
        if (goalProgress === 100) completedGoals++;
      }

      map.set(dateStr, {
        date: dateStr,
        totalGoals,
        completedGoals,
        completionPercentage: Math.round(totalProgress / totalGoals)
      });
    }

    return map;
  });

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      loading = true;
      error = null;

      const [goals, progress] = await Promise.all([
        getDailyRoutineGoals(),
        getMonthProgress(currentDate.getFullYear(), currentDate.getMonth() + 1)
      ]);

      routineGoals = goals;
      monthProgress = progress;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    } finally {
      loading = false;
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
