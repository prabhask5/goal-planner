<script lang="ts">
  import type { FocusSession, FocusSettings } from '$lib/types';
  import { generateSchedule, type SchedulePhase } from '$lib/utils/focus';

  interface Props {
    session: FocusSession | null;
    settings: FocusSettings | null;
  }

  let { session, settings }: Props = $props();

  const schedule = $derived(() => {
    if (!settings) return [];
    return generateSchedule(session, settings);
  });

  function getPhaseLabel(phase: SchedulePhase): string {
    if (phase.type === 'focus') {
      return `F${phase.cycle}`;
    }
    if (phase.type === 'long_break') {
      return 'LB';
    }
    return 'B';
  }
</script>

<div class="schedule-container">
  <h3 class="schedule-title">Session Schedule</h3>

  <div class="schedule-timeline">
    {#each schedule() as phase, i}
      <div
        class="phase-item"
        class:focus={phase.type === 'focus'}
        class:break={phase.type === 'break' || phase.type === 'long_break'}
        class:long-break={phase.type === 'long_break'}
        class:complete={phase.isComplete}
        class:current={phase.isCurrent}
        title="{phase.durationMinutes} min"
      >
        <span class="phase-label">{getPhaseLabel(phase)}</span>

        {#if phase.isComplete}
          <svg
            class="check-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
        {/if}

        {#if phase.isCurrent}
          <span class="current-indicator"></span>
        {/if}
      </div>

      {#if i < schedule().length - 1}
        <div class="connector" class:complete={phase.isComplete}></div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .schedule-container {
    margin-top: 2rem;
    padding: 1.5rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
  }

  .schedule-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    margin: 0 0 1rem 0;
  }

  .schedule-timeline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    flex-wrap: wrap;
    overflow-x: auto;
    padding: 0.5rem 0;
  }

  .phase-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 0.625rem;
    font-weight: 700;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
  }

  .phase-item.focus {
    background: rgba(108, 92, 231, 0.2);
    border: 2px solid rgba(108, 92, 231, 0.4);
    color: var(--color-primary-light);
  }

  .phase-item.break {
    background: rgba(38, 222, 129, 0.15);
    border: 2px solid rgba(38, 222, 129, 0.3);
    color: #26de81;
  }

  .phase-item.long-break {
    width: 40px;
    height: 40px;
    background: rgba(0, 212, 255, 0.15);
    border: 2px solid rgba(0, 212, 255, 0.3);
    color: #00d4ff;
  }

  .phase-item.complete {
    background: rgba(108, 92, 231, 0.3);
    border-color: var(--color-primary);
  }

  .phase-item.complete.break {
    background: rgba(38, 222, 129, 0.3);
    border-color: #26de81;
  }

  .phase-item.current {
    transform: scale(1.15);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .phase-item.current.break {
    box-shadow: 0 0 20px rgba(38, 222, 129, 0.5);
  }

  .phase-label {
    z-index: 1;
  }

  .check-icon {
    position: absolute;
    width: 14px;
    height: 14px;
    color: white;
    opacity: 0.8;
  }

  .phase-item.complete .phase-label {
    opacity: 0.3;
  }

  .current-indicator {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--color-primary-glow);
  }

  .phase-item.break .current-indicator {
    background: #26de81;
    box-shadow: 0 0 8px rgba(38, 222, 129, 0.5);
  }

  .connector {
    width: 16px;
    height: 2px;
    background: rgba(108, 92, 231, 0.2);
    flex-shrink: 0;
  }

  .connector.complete {
    background: var(--color-primary);
  }

  /* Responsive */
  @media (max-width: 500px) {
    .schedule-timeline {
      gap: 0;
    }

    .phase-item {
      width: 32px;
      height: 32px;
      font-size: 0.5625rem;
    }

    .phase-item.long-break {
      width: 36px;
      height: 36px;
    }

    .connector {
      width: 8px;
    }
  }
</style>
