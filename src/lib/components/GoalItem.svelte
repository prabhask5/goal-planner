<script lang="ts">
  import { getProgressColor, calculateGoalProgress } from '$lib/utils/colors';
  import type { Goal, DailyRoutineGoal, DailyGoalProgress } from '$lib/types';

  interface Props {
    goal: Goal | (DailyRoutineGoal & { progress?: DailyGoalProgress });
    onToggleComplete?: () => void;
    onIncrement?: () => void;
    onDecrement?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
  }

  let { goal, onToggleComplete, onIncrement, onDecrement, onEdit, onDelete }: Props = $props();

  // Handle both Goal and DailyRoutineGoal with progress
  const isRegularGoal = $derived('goal_list_id' in goal);
  const currentValue = $derived(
    isRegularGoal
      ? (goal as Goal).current_value
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.current_value ?? 0)
  );
  const completed = $derived(
    isRegularGoal
      ? (goal as Goal).completed
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.completed ?? false)
  );

  const progress = $derived(
    calculateGoalProgress(goal.type, completed, currentValue, goal.target_value)
  );
  const progressColor = $derived(getProgressColor(progress));
</script>

<div class="goal-item" style="border-left-color: {progressColor}">
  <div class="goal-main">
    {#if goal.type === 'completion'}
      <button
        class="checkbox"
        class:checked={completed}
        onclick={onToggleComplete}
        style="border-color: {progressColor}; background-color: {completed ? progressColor : 'transparent'}"
        aria-label={completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {#if completed}
          <span class="checkmark">✓</span>
        {/if}
      </button>
    {:else}
      <div class="increment-controls">
        <button class="increment-btn" onclick={onDecrement} aria-label="Decrement">−</button>
        <span class="current-value" style="color: {progressColor}">
          {currentValue}/{goal.target_value}
        </span>
        <button class="increment-btn" onclick={onIncrement} aria-label="Increment">+</button>
      </div>
    {/if}

    <span class="goal-name" class:completed={completed && goal.type === 'completion'}>
      {goal.name}
    </span>
  </div>

  <div class="goal-actions">
    {#if goal.type === 'incremental'}
      <div class="mini-progress" style="background-color: var(--color-bg-tertiary)">
        <div
          class="mini-progress-fill"
          style="width: {progress}%; background-color: {progressColor}"
        ></div>
      </div>
    {/if}
    {#if onEdit}
      <button class="action-btn" onclick={onEdit} aria-label="Edit goal">✎</button>
    {/if}
    {#if onDelete}
      <button class="action-btn delete" onclick={onDelete} aria-label="Delete goal">×</button>
    {/if}
  </div>
</div>

<style>
  .goal-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-left-width: 4px;
    border-radius: var(--radius-md);
    transition: border-left-color 0.3s ease;
  }

  .goal-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .checkbox {
    width: 24px;
    height: 24px;
    border: 2px solid;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .checkbox:hover {
    transform: scale(1.1);
  }

  .checkmark {
    color: white;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .increment-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .increment-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-tertiary);
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .increment-btn:hover {
    background-color: var(--color-border);
  }

  .current-value {
    font-weight: 600;
    font-size: 0.875rem;
    min-width: 3.5rem;
    text-align: center;
  }

  .goal-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .goal-name.completed {
    text-decoration: line-through;
    opacity: 0.6;
  }

  .goal-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .mini-progress {
    width: 60px;
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
  }

  .mini-progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
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

  @media (max-width: 480px) {
    .goal-item {
      flex-wrap: wrap;
    }

    .goal-actions {
      width: 100%;
      justify-content: flex-end;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--color-border);
    }
  }
</style>
