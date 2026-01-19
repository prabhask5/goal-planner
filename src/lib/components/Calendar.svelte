<script lang="ts">
  import {
    getDaysInMonth,
    getWeekdayNames,
    getFirstDayOfMonthWeekday,
    formatDate,
    formatMonthYear,
    isPastDay,
    isTodayDate
  } from '$lib/utils/dates';
  import { getProgressColor } from '$lib/utils/colors';
  import { addMonths, subMonths } from 'date-fns';
  import type { DayProgress } from '$lib/types';

  interface Props {
    currentDate: Date;
    dayProgressMap: Map<string, DayProgress>;
    onDayClick: (date: Date) => void;
    onMonthChange: (date: Date) => void;
  }

  let { currentDate, dayProgressMap, onDayClick, onMonthChange }: Props = $props();

  const weekdays = getWeekdayNames();
  const days = $derived(getDaysInMonth(currentDate));
  const firstDayOffset = $derived(getFirstDayOfMonthWeekday(currentDate));

  function goToPreviousMonth() {
    onMonthChange(subMonths(currentDate, 1));
  }

  function goToNextMonth() {
    onMonthChange(addMonths(currentDate, 1));
  }

  function getDayProgress(date: Date): DayProgress | undefined {
    return dayProgressMap.get(formatDate(date));
  }
</script>

<div class="calendar">
  <div class="calendar-header">
    <button class="nav-btn" onclick={goToPreviousMonth} aria-label="Previous month">
      ←
    </button>
    <h2 class="month-title">{formatMonthYear(currentDate)}</h2>
    <button class="nav-btn" onclick={goToNextMonth} aria-label="Next month">
      →
    </button>
  </div>

  <div class="calendar-weekdays">
    {#each weekdays as day}
      <div class="weekday">{day}</div>
    {/each}
  </div>

  <div class="calendar-grid">
    {#each Array(firstDayOffset) as _, i}
      <div class="day-cell empty" aria-hidden="true"></div>
    {/each}

    {#each days as day}
      {@const dateStr = formatDate(day)}
      {@const progress = getDayProgress(day)}
      {@const isPast = isPastDay(day)}
      {@const isToday = isTodayDate(day)}
      {@const hasGoals = progress && progress.totalGoals > 0}
      {@const percentage = progress?.completionPercentage ?? 0}
      {@const bgColor = isPast && hasGoals ? getProgressColor(percentage) : 'transparent'}

      <button
        class="day-cell"
        class:past={isPast}
        class:today={isToday}
        class:has-goals={hasGoals}
        style="--day-bg: {bgColor}"
        onclick={() => onDayClick(day)}
        aria-label="{dateStr}{hasGoals ? `, ${percentage}% complete` : ''}"
      >
        <span class="day-number">{day.getDate()}</span>
        {#if isPast && hasGoals}
          <span class="day-progress">{percentage}%</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .calendar {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .nav-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
  }

  .nav-btn:hover {
    background-color: var(--color-bg-tertiary);
  }

  .month-title {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .calendar-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid var(--color-border);
  }

  .weekday {
    padding: 0.75rem;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    background-color: var(--color-border);
  }

  .day-cell {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    background-color: var(--color-bg-secondary);
    position: relative;
    transition: all 0.2s ease;
    min-height: 60px;
  }

  .day-cell.empty {
    background-color: var(--color-bg);
  }

  .day-cell:not(.empty):hover {
    background-color: var(--color-bg-tertiary);
  }

  .day-cell.today {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .day-cell.past.has-goals {
    background-color: var(--day-bg);
  }

  .day-cell.past.has-goals .day-number {
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .day-number {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .day-progress {
    font-size: 0.625rem;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 640px) {
    .day-cell {
      min-height: 50px;
    }

    .day-number {
      font-size: 0.75rem;
    }

    .day-progress {
      font-size: 0.5rem;
    }

    .weekday {
      font-size: 0.625rem;
      padding: 0.5rem;
    }
  }
</style>
