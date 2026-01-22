<script lang="ts">
  import {
    getDaysInMonth,
    getWeekdayNames,
    getFirstDayOfMonthWeekday,
    formatDate,
    formatMonthYear,
    isTodayDate,
    parseDateString
  } from '$lib/utils/dates';
  import { addMonths, subMonths } from 'date-fns';
  import type { LongTermTaskWithCategory } from '$lib/types';

  interface Props {
    currentDate: Date;
    tasks: LongTermTaskWithCategory[];
    onDayClick: (date: Date) => void;
    onTaskClick: (task: LongTermTaskWithCategory) => void;
    onMonthChange: (date: Date) => void;
  }

  let { currentDate, tasks, onDayClick, onTaskClick, onMonthChange }: Props = $props();

  const weekdays = getWeekdayNames();
  const days = $derived(getDaysInMonth(currentDate));
  const firstDayOffset = $derived(getFirstDayOfMonthWeekday(currentDate));

  function goToPreviousMonth() {
    onMonthChange(subMonths(currentDate, 1));
  }

  function goToNextMonth() {
    onMonthChange(addMonths(currentDate, 1));
  }

  function goToToday() {
    onMonthChange(new Date());
  }

  const isViewingCurrentMonth = $derived(() => {
    const today = new Date();
    return currentDate.getMonth() === today.getMonth() &&
           currentDate.getFullYear() === today.getFullYear();
  });

  function getTasksForDate(date: Date): LongTermTaskWithCategory[] {
    const dateStr = formatDate(date);
    return tasks.filter(t => t.due_date === dateStr && !t.completed);
  }

  function isOverdue(task: LongTermTaskWithCategory): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseDateString(task.due_date);
    return taskDueDate < today && !task.completed;
  }
</script>

<div class="calendar">
  <div class="calendar-header">
    <button class="nav-btn" onclick={goToPreviousMonth} aria-label="Previous month">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <div class="month-title-wrapper">
      <h2 class="month-title">{formatMonthYear(currentDate)}</h2>
      {#if !isViewingCurrentMonth()}
        <button class="today-btn" onclick={goToToday}>
          Today
        </button>
      {/if}
    </div>
    <button class="nav-btn" onclick={goToNextMonth} aria-label="Next month">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>

  <div class="calendar-weekdays">
    {#each weekdays as day}
      <div class="weekday">{day}</div>
    {/each}
  </div>

  <div class="calendar-grid">
    {#each Array(firstDayOffset) as _}
      <div class="day-cell empty" aria-hidden="true"></div>
    {/each}

    {#each days as day}
      {@const isToday = isTodayDate(day)}
      {@const dayTasks = getTasksForDate(day)}
      {@const hasTasksDue = dayTasks.length > 0}

      <div
        class="day-cell"
        class:today={isToday}
        class:has-tasks={hasTasksDue}
        onclick={() => onDayClick(day)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onDayClick(day)}
        role="button"
        tabindex="0"
        aria-label="{formatDate(day)}{hasTasksDue ? `, ${dayTasks.length} task(s) due` : ''}"
      >
        <span class="day-number">{day.getDate()}</span>
        {#if hasTasksDue}
          <div class="task-chips">
            {#each dayTasks.slice(0, 2) as task}
              <button
                class="task-chip"
                class:overdue={isOverdue(task)}
                style="--chip-color: {task.category?.color || '#6c5ce7'}"
                onclick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                title={task.name}
              >
                {task.name}
              </button>
            {/each}
            {#if dayTasks.length > 2}
              <span class="more-tasks">+{dayTasks.length - 2}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .calendar {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(10, 10, 22, 0.98) 50%,
      rgba(15, 15, 30, 0.95) 100%);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl);
    overflow: hidden;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 16px 48px rgba(0, 0, 0, 0.5),
      0 0 100px rgba(108, 92, 231, 0.1);
    position: relative;
  }

  .calendar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 255, 255, 0.3),
      rgba(255, 121, 198, 0.4),
      transparent);
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
    background: linear-gradient(180deg, rgba(108, 92, 231, 0.1) 0%, transparent 100%);
    position: relative;
    z-index: 1;
  }

  .nav-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid rgba(108, 92, 231, 0.2);
    background: rgba(30, 30, 55, 0.6);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .nav-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    transform: scale(1.1);
    box-shadow: 0 0 25px var(--color-primary-glow);
    color: white;
  }

  .month-title-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
  }

  .month-title {
    font-size: 1.375rem;
    font-weight: 700;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
  }

  .today-btn {
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.25rem 0.625rem;
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-full);
    color: var(--color-primary-light);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .today-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    transform: scale(1.05);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .calendar-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
    background: rgba(10, 10, 22, 0.5);
    position: relative;
    z-index: 1;
  }

  .weekday {
    padding: 0.75rem;
    text-align: center;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    background: rgba(108, 92, 231, 0.03);
    padding: 4px;
    position: relative;
    z-index: 1;
  }

  .day-cell {
    min-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.5rem;
    background: linear-gradient(145deg,
      rgba(20, 20, 40, 0.95) 0%,
      rgba(15, 15, 32, 0.9) 100%);
    position: relative;
    transition: all 0.3s var(--ease-out);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .day-cell.empty {
    background: rgba(10, 10, 22, 0.6);
    cursor: default;
  }

  .day-cell:not(.empty):hover {
    transform: scale(1.02);
    z-index: 10;
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .day-cell.today {
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .day-number {
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 0.25rem;
  }

  .day-cell.today .day-number {
    color: var(--color-primary-light);
    font-weight: 700;
  }

  .task-chips {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    overflow: hidden;
  }

  .task-chip {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.2rem 0.4rem;
    border-radius: var(--radius-sm);
    background: var(--chip-color);
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: none;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: left;
    width: 100%;
    max-width: 100%;
  }

  .task-chip:hover {
    transform: scale(1.02);
    box-shadow: 0 0 12px var(--chip-color);
  }

  .task-chip.overdue {
    animation: overdueGlow 2s ease-in-out infinite;
  }

  @keyframes overdueGlow {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 107, 107, 0.5); }
    50% { box-shadow: 0 0 15px rgba(255, 107, 107, 0.8); }
  }

  .more-tasks {
    font-size: 0.5625rem;
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 0.125rem 0.25rem;
  }

  @media (max-width: 640px) {
    .calendar {
      border-radius: var(--radius-xl);
    }

    .calendar-header {
      padding: 1rem 1.25rem;
    }

    .month-title {
      font-size: 1.125rem;
    }

    .nav-btn {
      width: 36px;
      height: 36px;
    }

    .day-cell {
      min-height: 60px;
      padding: 0.375rem;
    }

    .day-number {
      font-size: 0.75rem;
    }

    .task-chip {
      font-size: 0.5625rem;
      padding: 0.15rem 0.3rem;
    }

    .weekday {
      font-size: 0.5625rem;
      padding: 0.5rem;
    }
  }
</style>
