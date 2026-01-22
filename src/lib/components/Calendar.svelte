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

  // Transition state for cinematic month changes
  let transitionDirection = $state<'left' | 'right' | null>(null);
  let isTransitioning = $state(false);

  function goToPreviousMonth() {
    if (isTransitioning) return;
    transitionDirection = 'right';
    isTransitioning = true;
    setTimeout(() => {
      onMonthChange(subMonths(currentDate, 1));
      setTimeout(() => {
        isTransitioning = false;
        transitionDirection = null;
      }, 50);
    }, 300);
  }

  function goToNextMonth() {
    if (isTransitioning) return;
    transitionDirection = 'left';
    isTransitioning = true;
    setTimeout(() => {
      onMonthChange(addMonths(currentDate, 1));
      setTimeout(() => {
        isTransitioning = false;
        transitionDirection = null;
      }, 50);
    }, 300);
  }

  function getDayProgress(date: Date): DayProgress | undefined {
    return dayProgressMap.get(formatDate(date));
  }

  function goToToday() {
    if (isTransitioning) return;
    const today = new Date();
    const isCurrentMonth = currentDate.getMonth() === today.getMonth() &&
                          currentDate.getFullYear() === today.getFullYear();
    if (isCurrentMonth) return;

    // Determine direction based on whether today is before or after current month
    const todayTime = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const currentTime = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
    transitionDirection = todayTime > currentTime ? 'left' : 'right';
    isTransitioning = true;
    setTimeout(() => {
      onMonthChange(today);
      setTimeout(() => {
        isTransitioning = false;
        transitionDirection = null;
      }, 50);
    }, 300);
  }

  const isViewingCurrentMonth = $derived(() => {
    const today = new Date();
    return currentDate.getMonth() === today.getMonth() &&
           currentDate.getFullYear() === today.getFullYear();
  });
</script>

<div class="calendar">
  <div class="calendar-header">
    <button class="nav-btn" onclick={goToPreviousMonth} aria-label="Previous month" disabled={isTransitioning}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <div class="month-title-wrapper">
      <h2
        class="month-title"
        class:slide-out-left={transitionDirection === 'left' && isTransitioning}
        class:slide-out-right={transitionDirection === 'right' && isTransitioning}
      >
        {formatMonthYear(currentDate)}
      </h2>
      {#if !isViewingCurrentMonth()}
        <button class="today-btn" onclick={goToToday} disabled={isTransitioning}>
          Today
        </button>
      {/if}
    </div>
    <button class="nav-btn" onclick={goToNextMonth} aria-label="Next month" disabled={isTransitioning}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>

  <div class="calendar-weekdays">
    {#each weekdays as day}
      <div class="weekday">{day}</div>
    {/each}
  </div>

  <div
    class="calendar-grid"
    class:transitioning={isTransitioning}
    class:slide-left={transitionDirection === 'left'}
    class:slide-right={transitionDirection === 'right'}
  >
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
      {@const bgColor = (isPast || isToday) && hasGoals ? getProgressColor(percentage) : 'transparent'}

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
        {#if (isPast || isToday) && hasGoals}
          <span class="day-progress">{percentage}%</span>
        {/if}
      </button>
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
    perspective: 1000px;
  }

  /* Top glow line */
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
      rgba(38, 222, 129, 0.3),
      transparent);
    animation: calendarGlow 4s ease-in-out infinite;
  }

  @keyframes calendarGlow {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  /* Nebula background effect */
  .calendar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(ellipse at 20% 0%, rgba(108, 92, 231, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(38, 222, 129, 0.05) 0%, transparent 40%);
    pointer-events: none;
    z-index: 0;
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
    background: linear-gradient(180deg, rgba(108, 92, 231, 0.1) 0%, transparent 100%);
    position: relative;
    z-index: 1;
  }

  .nav-btn {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    font-size: 1.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid rgba(108, 92, 231, 0.2);
    background: rgba(30, 30, 55, 0.6);
    color: var(--color-text-muted);
  }

  .nav-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    transform: scale(1.1);
    box-shadow: 0 0 30px var(--color-primary-glow);
    color: white;
  }

  .nav-btn:active {
    transform: scale(0.95);
  }

  .nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .nav-btn:disabled:hover {
    background: rgba(30, 30, 55, 0.6);
    border-color: rgba(108, 92, 231, 0.2);
    transform: none;
    box-shadow: none;
    color: var(--color-text-muted);
  }

  .month-title-wrapper {
    overflow: visible;
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .today-btn {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.3rem 0.75rem;
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-full);
    color: var(--color-primary-light);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .today-btn:hover:not(:disabled) {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    transform: scale(1.05);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .today-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .month-title {
    font-size: 1.75rem;
    font-weight: 800;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    animation: textShimmer 8s linear infinite;
    transition: all 0.3s var(--ease-out);
  }

  .month-title.slide-out-left {
    animation: slideOutLeft 0.3s var(--ease-out) forwards;
  }

  .month-title.slide-out-right {
    animation: slideOutRight 0.3s var(--ease-out) forwards;
  }

  @keyframes slideOutLeft {
    0% {
      opacity: 1;
      transform: translateX(0) scale(1);
      filter: blur(0);
    }
    100% {
      opacity: 0;
      transform: translateX(-60px) scale(0.9);
      filter: blur(4px);
    }
  }

  @keyframes slideOutRight {
    0% {
      opacity: 1;
      transform: translateX(0) scale(1);
      filter: blur(0);
    }
    100% {
      opacity: 0;
      transform: translateX(60px) scale(0.9);
      filter: blur(4px);
    }
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
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
    padding: 1rem;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.15em;
    text-shadow: 0 0 20px var(--color-primary-glow);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    background: rgba(108, 92, 231, 0.03);
    padding: 6px;
    position: relative;
    z-index: 1;
    transition: all 0.3s var(--ease-out);
  }

  .calendar-grid.transitioning {
    pointer-events: none;
  }

  .calendar-grid.transitioning.slide-left {
    animation: gridSlideLeft 0.3s var(--ease-out) forwards;
  }

  .calendar-grid.transitioning.slide-right {
    animation: gridSlideRight 0.3s var(--ease-out) forwards;
  }

  @keyframes gridSlideLeft {
    0% {
      opacity: 1;
      transform: translateX(0) scale(1) rotateY(0);
    }
    50% {
      opacity: 0.3;
      transform: translateX(-30px) scale(0.95) rotateY(-5deg);
    }
    100% {
      opacity: 0;
      transform: translateX(-60px) scale(0.9) rotateY(-10deg);
    }
  }

  @keyframes gridSlideRight {
    0% {
      opacity: 1;
      transform: translateX(0) scale(1) rotateY(0);
    }
    50% {
      opacity: 0.3;
      transform: translateX(30px) scale(0.95) rotateY(5deg);
    }
    100% {
      opacity: 0;
      transform: translateX(60px) scale(0.9) rotateY(10deg);
    }
  }

  .day-cell {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    background: linear-gradient(145deg,
      rgba(20, 20, 40, 0.95) 0%,
      rgba(15, 15, 32, 0.9) 100%);
    position: relative;
    transition: all 0.35s var(--ease-out);
    min-height: 70px;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid transparent;
  }

  /* Subtle star effect on hover */
  .day-cell::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(108, 92, 231, 0.2) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .day-cell.empty {
    background: rgba(10, 10, 22, 0.6);
    border-color: transparent;
  }

  .day-cell:not(.empty):hover {
    transform: scale(1.08);
    z-index: 10;
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.5),
      0 0 50px rgba(108, 92, 231, 0.25);
  }

  .day-cell:not(.empty):hover::before {
    opacity: 1;
  }

  /* Today - glowing star */
  .day-cell.today {
    border-color: var(--color-primary);
    box-shadow:
      0 0 0 2px rgba(108, 92, 231, 0.3),
      0 0 30px var(--color-primary-glow),
      inset 0 0 20px rgba(108, 92, 231, 0.1);
    animation: todayPulse 3s ease-in-out infinite;
  }

  @keyframes todayPulse {
    0%, 100% {
      box-shadow:
        0 0 0 2px rgba(108, 92, 231, 0.3),
        0 0 30px var(--color-primary-glow),
        inset 0 0 20px rgba(108, 92, 231, 0.1);
    }
    50% {
      box-shadow:
        0 0 0 3px rgba(108, 92, 231, 0.5),
        0 0 50px var(--color-primary-glow),
        inset 0 0 30px rgba(108, 92, 231, 0.15);
    }
  }

  .day-cell.today::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--gradient-primary);
    opacity: 0.1;
  }

  /* Past days and today with goals - ignited stars */
  .day-cell.past.has-goals,
  .day-cell.today.has-goals {
    background: linear-gradient(145deg,
      color-mix(in srgb, var(--day-bg) 90%, white) 0%,
      var(--day-bg) 50%,
      color-mix(in srgb, var(--day-bg) 70%, black) 100%);
    border-color: color-mix(in srgb, var(--day-bg) 60%, transparent);
    box-shadow: 0 0 20px color-mix(in srgb, var(--day-bg) 40%, transparent);
  }

  .day-cell.past.has-goals::before,
  .day-cell.today.has-goals::before {
    background: linear-gradient(180deg,
      rgba(255, 255, 255, 0.2) 0%,
      rgba(255, 255, 255, 0.05) 30%,
      transparent 60%);
    opacity: 1;
  }

  .day-cell.past.has-goals .day-number,
  .day-cell.today.has-goals .day-number {
    color: white;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    font-weight: 800;
  }

  .day-number {
    font-weight: 600;
    font-size: 1rem;
    position: relative;
    z-index: 1;
    transition: all 0.3s;
  }

  .day-progress {
    font-size: 0.7rem;
    font-weight: 800;
    color: white;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    position: relative;
    z-index: 1;
    padding: 0.2rem 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    letter-spacing: 0.02em;
  }

  @media (max-width: 640px) {
    .calendar {
      border-radius: var(--radius-xl);
    }

    .calendar-header {
      padding: 1.25rem 1.5rem;
    }

    .day-cell {
      min-height: 55px;
      border-radius: var(--radius-sm);
    }

    .day-number {
      font-size: 0.875rem;
    }

    .day-progress {
      font-size: 0.6rem;
      padding: 0.125rem 0.375rem;
    }

    .weekday {
      font-size: 0.65rem;
      padding: 0.75rem 0.5rem;
    }

    .month-title {
      font-size: 1.375rem;
    }

    .nav-btn {
      width: 40px;
      height: 40px;
      font-size: 1.125rem;
    }

    .calendar-grid {
      gap: 2px;
      padding: 4px;
    }
  }
</style>
