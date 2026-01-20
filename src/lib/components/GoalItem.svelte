<script lang="ts">
  import { getProgressColor, calculateGoalProgress } from '$lib/utils/colors';
  import type { Goal, DailyRoutineGoal, DailyGoalProgress } from '$lib/types';

  interface Props {
    goal: Goal | (DailyRoutineGoal & { progress?: DailyGoalProgress });
    onToggleComplete?: () => void;
    onIncrement?: () => void;
    onDecrement?: () => void;
    onSetValue?: (value: number) => void;
    onEdit?: () => void;
    onDelete?: () => void;
  }

  let { goal, onToggleComplete, onIncrement, onDecrement, onSetValue, onEdit, onDelete }: Props = $props();

  let editing = $state(false);
  let inputValue = $state('');

  // Handle both Goal and DailyRoutineGoal with progress
  const isRegularGoal = $derived('goal_list_id' in goal);
  const rawCurrentValue = $derived(
    isRegularGoal
      ? (goal as Goal).current_value
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.current_value ?? 0)
  );
  // Cap current value to target to handle case where target was reduced
  const currentValue = $derived(
    goal.target_value !== null ? Math.min(rawCurrentValue, goal.target_value) : rawCurrentValue
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

  function startEditing() {
    if (!onSetValue) return;
    inputValue = String(currentValue);
    editing = true;
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitValue();
    } else if (e.key === 'Escape') {
      editing = false;
    }
  }

  function commitValue() {
    editing = false;
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed !== currentValue && onSetValue) {
      // Clamp to valid range
      const clamped = Math.max(0, Math.min(parsed, goal.target_value ?? Infinity));
      onSetValue(clamped);
    }
  }
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
        {#if editing}
          <input
            type="number"
            class="value-input"
            bind:value={inputValue}
            onkeydown={handleInputKeydown}
            onblur={commitValue}
            min="0"
            max={goal.target_value ?? undefined}
            autofocus
          />
        {:else}
          <button
            class="current-value"
            style="color: {progressColor}"
            onclick={startEditing}
            disabled={!onSetValue}
            aria-label="Click to edit value"
          >
            {currentValue}/{goal.target_value}
          </button>
        {/if}
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
    gap: 1.25rem;
    padding: 1.125rem 1.5rem;
    background: linear-gradient(135deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-left-width: 4px;
    border-radius: var(--radius-xl);
    transition: all 0.35s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  /* Top shine line */
  .goal-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 30%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(108, 92, 231, 0.3) 70%,
      transparent 100%);
  }

  /* Subtle nebula glow */
  .goal-item::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 100px;
    height: 200%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.08) 0%, transparent 70%);
    pointer-events: none;
    transition: opacity 0.3s;
    opacity: 0;
  }

  .goal-item:hover {
    transform: translateX(6px) translateY(-2px);
    border-color: rgba(108, 92, 231, 0.35);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 60px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .goal-item:hover::after {
    opacity: 1;
  }

  .goal-main {
    display: flex;
    align-items: center;
    gap: 1.125rem;
    flex: 1;
    min-width: 0;
  }

  .checkbox {
    width: 32px;
    height: 32px;
    border: 2px solid;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
    position: relative;
    cursor: pointer;
  }

  /* Glow behind checkbox */
  .checkbox::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: var(--radius-lg);
    background: currentColor;
    opacity: 0;
    filter: blur(12px);
    transition: opacity 0.3s;
  }

  .checkbox:hover {
    transform: scale(1.15) rotate(5deg);
  }

  .checkbox:hover::before {
    opacity: 0.35;
  }

  .checkbox.checked {
    animation: starComplete 0.5s var(--ease-spring);
  }

  @keyframes starComplete {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); box-shadow: 0 0 30px currentColor; }
    100% { transform: scale(1); }
  }

  .checkmark {
    color: white;
    font-size: 1.125rem;
    font-weight: bold;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    animation: checkAppear 0.3s var(--ease-spring);
  }

  @keyframes checkAppear {
    from { transform: scale(0) rotate(-90deg); opacity: 0; }
    to { transform: scale(1) rotate(0); opacity: 1; }
  }

  .increment-controls {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  .increment-btn {
    width: 36px;
    height: 36px;
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
    background: linear-gradient(145deg,
      rgba(30, 30, 55, 0.9) 0%,
      rgba(20, 20, 40, 0.95) 100%);
    font-size: 1.375rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.25s var(--ease-spring);
    color: var(--color-text-muted);
  }

  .increment-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    transform: scale(1.15);
    box-shadow: 0 0 25px var(--color-primary-glow);
  }

  .increment-btn:active {
    transform: scale(0.95);
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  .current-value {
    font-weight: 800;
    font-size: 1rem;
    min-width: 4.5rem;
    text-align: center;
    background: none;
    border: none;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.25s var(--ease-out);
    text-shadow: 0 0 20px currentColor;
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .current-value:hover:not(:disabled) {
    background: rgba(108, 92, 231, 0.2);
    transform: scale(1.08);
    text-shadow: 0 0 30px currentColor;
  }

  .current-value:disabled {
    cursor: default;
  }

  .value-input {
    width: 4.5rem;
    text-align: center;
    font-weight: 800;
    font-size: 1rem;
    padding: 0.5rem 0.625rem;
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-lg);
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-text);
    box-shadow:
      0 0 30px var(--color-primary-glow),
      inset 0 0 20px rgba(108, 92, 231, 0.1);
    font-family: var(--font-mono);
  }

  .value-input::-webkit-inner-spin-button,
  .value-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .value-input[type=number] {
    -moz-appearance: textfield;
  }

  .goal-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 1rem;
    transition: all 0.3s;
    letter-spacing: -0.01em;
  }

  .goal-name.completed {
    text-decoration: line-through;
    opacity: 0.5;
    font-style: italic;
    filter: blur(0.5px);
  }

  .goal-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .mini-progress {
    width: 80px;
    height: 10px;
    border-radius: var(--radius-full);
    overflow: hidden;
    background: rgba(20, 20, 40, 0.9);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
    position: relative;
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .mini-progress-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 0.5s var(--ease-out);
    box-shadow: 0 0 15px currentColor;
    position: relative;
  }

  .mini-progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
    border-radius: var(--radius-full);
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
    background: rgba(108, 92, 231, 0.2);
    border-color: rgba(108, 92, 231, 0.35);
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.2);
  }

  .action-btn.delete:hover {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.3) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--color-red);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  }

  @media (max-width: 480px) {
    .goal-item {
      flex-wrap: wrap;
      padding: 1rem 1.125rem;
    }

    .goal-actions {
      width: 100%;
      justify-content: flex-end;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(108, 92, 231, 0.12);
    }
  }
</style>
