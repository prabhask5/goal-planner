<script lang="ts">
  import { getProgressColor, calculateGoalProgress, getOverflowColor } from '$lib/utils/colors';
  import { remoteChangeAnimation, triggerLocalAnimation } from '$lib/actions/remoteChange';
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

  let { goal, onToggleComplete, onIncrement, onDecrement, onSetValue, onEdit, onDelete }: Props =
    $props();

  // Determine entity type for remote change tracking
  const entityType = $derived('goal_list_id' in goal ? 'goals' : 'daily_routine_goals');

  let element: HTMLElement;

  function handleToggle() {
    triggerLocalAnimation(element, 'toggle');
    onToggleComplete?.();
  }

  function handleIncrement() {
    triggerLocalAnimation(element, 'increment');
    onIncrement?.();
  }

  function handleDecrement() {
    triggerLocalAnimation(element, 'decrement');
    onDecrement?.();
  }

  // Focus action for accessibility (skip on mobile to avoid keyboard popup)
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  let editing = $state(false);
  let inputValue = $state('');

  // Handle both Goal and DailyRoutineGoal with progress
  const isRegularGoal = $derived('goal_list_id' in goal);
  const rawCurrentValue = $derived(
    isRegularGoal
      ? (goal as Goal).current_value
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.current_value ?? 0)
  );
  // Allow overflow - don't cap current value
  const currentValue = $derived(rawCurrentValue);
  const completed = $derived(
    isRegularGoal
      ? (goal as Goal).completed
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.completed ?? false)
  );

  const progress = $derived(
    calculateGoalProgress(goal.type, completed, currentValue, goal.target_value)
  );
  // Use overflow color for >100%, regular progress color otherwise
  const progressColor = $derived(
    progress > 100 ? getOverflowColor(progress) : getProgressColor(progress)
  );

  // Celebration state for overflow
  const isCelebrating = $derived(progress > 100);
  const celebrationIntensity = $derived(progress <= 100 ? 0 : Math.min(1, (progress - 100) / 100));

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
      // Only prevent negative values - allow overflow above target
      const clamped = Math.max(0, parsed);
      onSetValue(clamped);
    }
  }
</script>

<div
  bind:this={element}
  class="goal-item"
  class:celebrating={isCelebrating}
  style="border-left-color: {progressColor}; --celebration-intensity: {celebrationIntensity}; --glow-color: {progressColor}"
  use:remoteChangeAnimation={{ entityId: goal.id, entityType }}
>
  <div class="goal-main">
    {#if goal.type === 'completion'}
      <button
        class="checkbox"
        class:checked={completed}
        onclick={handleToggle}
        style="border-color: {progressColor}; background-color: {completed
          ? progressColor
          : 'transparent'}"
        aria-label={completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {#if completed}
          <span class="checkmark">✓</span>
        {/if}
      </button>
    {:else}
      <div class="increment-controls">
        <button class="increment-btn" onclick={handleDecrement} aria-label="Decrement">−</button>
        {#if editing}
          <input
            type="number"
            class="value-input"
            bind:value={inputValue}
            onkeydown={handleInputKeydown}
            onblur={commitValue}
            min="0"
            use:focus
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
        <button class="increment-btn" onclick={handleIncrement} aria-label="Increment">+</button>
      </div>
    {/if}

    <span class="goal-name" class:completed={completed && goal.type === 'completion'}>
      {goal.name}
    </span>
  </div>

  <div class="goal-actions">
    {#if goal.type === 'incremental'}
      <!-- Desktop: Progress bar -->
      <div
        class="mini-progress-wrapper desktop-only"
        class:celebrating={isCelebrating}
        style="--glow-color: {progressColor}; --celebration-intensity: {celebrationIntensity}"
      >
        {#if celebrationIntensity > 0.3}
          <div class="pulse-ring pulse-ring-1 bar-ring"></div>
          {#if celebrationIntensity > 0.6}
            <div class="pulse-ring pulse-ring-2 bar-ring"></div>
          {/if}
        {/if}

        <div class="mini-progress" class:celebrating={isCelebrating}>
          <div
            class="mini-progress-fill"
            class:celebrating={isCelebrating}
            style="width: {Math.min(100, progress)}%; background-color: {progressColor}"
          ></div>
          {#if isCelebrating}
            <div class="shimmer-overlay"></div>
          {/if}
        </div>

        {#if celebrationIntensity > 0.1}
          <div class="particle-burst bar-particles">
            {#each Array(Math.floor(celebrationIntensity * 8)) as _, i}
              <div class="particle" style="--angle: {i * 45}deg; --delay: {i * 0.15}s; --distance: {20 + (i % 3) * 10}px"></div>
            {/each}
          </div>
        {/if}

        {#if celebrationIntensity > 0.5}
          <div class="orbit-spark orbit-1 bar-orbit"></div>
          {#if celebrationIntensity > 0.75}
            <div class="orbit-spark orbit-2 bar-orbit"></div>
          {/if}
        {/if}

        {#if isCelebrating}
          <span class="overflow-star star-1 bar-star">✦</span>
          {#if celebrationIntensity > 0.4}
            <span class="overflow-star star-2 bar-star">✦</span>
          {/if}
          {#if celebrationIntensity > 0.7}
            <span class="overflow-star star-3 bar-star">✧</span>
          {/if}
        {/if}

        {#if celebrationIntensity > 0.6}
          <div class="energy-arc arc-1 bar-arc"></div>
          {#if celebrationIntensity > 0.85}
            <div class="energy-arc arc-2 bar-arc"></div>
          {/if}
        {/if}
      </div>

      <!-- Mobile: Star progress -->
      <div
        class="star-progress-wrapper mobile-only"
        class:celebrating={isCelebrating}
        style="--glow-color: {progressColor}; --celebration-intensity: {celebrationIntensity}"
      >
        {#if celebrationIntensity > 0.3}
          <div class="pulse-ring pulse-ring-1"></div>
          {#if celebrationIntensity > 0.6}
            <div class="pulse-ring pulse-ring-2"></div>
          {/if}
        {/if}

        <div class="star-container" class:celebrating={isCelebrating}>
          <svg class="star-bg" viewBox="0 0 24 24" fill="none">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <div class="star-fill-container">
            <svg class="star-fill" viewBox="0 0 24 24" style="color: {progressColor}">
              <defs>
                <clipPath id="star-clip-{goal.id}">
                  <rect x="0" y="{24 - (Math.min(100, progress) / 100) * 24}" width="24" height="{(Math.min(100, progress) / 100) * 24}"/>
                </clipPath>
              </defs>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    fill="currentColor" clip-path="url(#star-clip-{goal.id})"/>
            </svg>
          </div>
          {#if isCelebrating}
            <div class="star-shimmer"></div>
          {/if}
        </div>

        {#if celebrationIntensity > 0.1}
          <div class="particle-burst">
            {#each Array(Math.floor(celebrationIntensity * 8)) as _, i}
              <div class="particle" style="--angle: {i * 45}deg; --delay: {i * 0.15}s; --distance: {15 + (i % 3) * 8}px"></div>
            {/each}
          </div>
        {/if}

        {#if celebrationIntensity > 0.5}
          <div class="orbit-spark orbit-1"></div>
          {#if celebrationIntensity > 0.75}
            <div class="orbit-spark orbit-2"></div>
          {/if}
        {/if}

        {#if isCelebrating}
          <span class="overflow-star star-1">✦</span>
          {#if celebrationIntensity > 0.4}
            <span class="overflow-star star-2">✦</span>
          {/if}
          {#if celebrationIntensity > 0.7}
            <span class="overflow-star star-3">✧</span>
          {/if}
        {/if}

        {#if celebrationIntensity > 0.6}
          <div class="energy-arc arc-1"></div>
          {#if celebrationIntensity > 0.85}
            <div class="energy-arc arc-2"></div>
          {/if}
        {/if}
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
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
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
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 30%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(108, 92, 231, 0.3) 70%,
      transparent 100%
    );
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

  /* Celebration effects for overflow */
  .goal-item.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 40%, rgba(108, 92, 231, 0.15));
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.3),
      0 0 calc(20px + var(--celebration-intensity, 0) * 30px)
        color-mix(
          in srgb,
          var(--glow-color) calc(var(--celebration-intensity, 0) * 40%),
          transparent
        );
  }

  .goal-item.celebrating::after {
    opacity: calc(0.3 + var(--celebration-intensity, 0) * 0.7);
    background: radial-gradient(
      ellipse,
      color-mix(in srgb, var(--glow-color) 15%, transparent) 0%,
      transparent 70%
    );
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
    border-radius: 50%;
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
    border-radius: 50%;
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
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.3);
      box-shadow: 0 0 30px currentColor;
    }
    100% {
      transform: scale(1);
    }
  }

  .checkmark {
    color: white;
    font-size: 1.125rem;
    font-weight: bold;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    animation: checkAppear 0.3s var(--ease-spring);
  }

  @keyframes checkAppear {
    from {
      transform: scale(0) rotate(-90deg);
      opacity: 0;
    }
    to {
      transform: scale(1) rotate(0);
      opacity: 1;
    }
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
    background: linear-gradient(145deg, rgba(30, 30, 55, 0.9) 0%, rgba(20, 20, 40, 0.95) 100%);
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

  .value-input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
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

  /* Desktop/Mobile visibility */
  .desktop-only {
    display: flex;
  }

  .mobile-only {
    display: none;
  }

  /* Mini progress bar wrapper (desktop) */
  .mini-progress-wrapper {
    position: relative;
    width: 80px;
    height: 10px;
    margin: 15px 25px 15px 10px;
  }

  .mini-progress-wrapper.celebrating {
    filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color));
    animation: wrapperPulse calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-in-out infinite;
  }

  @keyframes wrapperPulse {
    0%,
    100% {
      filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color));
    }
    50% {
      filter: drop-shadow(0 0 calc(8px + var(--celebration-intensity, 0) * 20px) var(--glow-color));
    }
  }

  .mini-progress {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-full);
    overflow: hidden;
    background: rgba(20, 20, 40, 0.9);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
    position: relative;
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .mini-progress.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 50%, transparent);
  }

  .mini-progress-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 0.5s var(--ease-out);
    box-shadow: 0 0 15px currentColor;
    position: relative;
    overflow: hidden;
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

  .mini-progress-fill.celebrating {
    animation: fillPulse calc(0.8s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  @keyframes fillPulse {
    0%,
    100% {
      filter: brightness(1);
      box-shadow: 0 0 15px currentColor;
    }
    50% {
      filter: brightness(1.3);
      box-shadow: 0 0 25px currentColor, 0 0 40px currentColor;
    }
  }

  .shimmer-overlay {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.5) 40%,
      rgba(255, 255, 255, 0.8) 50%,
      rgba(255, 255, 255, 0.5) 60%,
      transparent 100%
    );
    animation: shimmerSweep calc(1.5s - var(--celebration-intensity, 0) * 0.7s) ease-in-out infinite;
  }

  @keyframes shimmerSweep {
    0% {
      left: -100%;
    }
    100% {
      left: 100%;
    }
  }

  /* Bar-specific effect positioning (right edge) */
  .bar-ring {
    top: 50%;
    left: auto;
    right: 0;
    transform: translate(50%, -50%);
  }

  .bar-particles {
    top: 50%;
    left: auto;
    right: 0;
  }

  .bar-orbit {
    top: 50%;
    left: auto;
    right: 0;
  }

  .bar-star {
    top: 50%;
    left: auto;
  }

  .bar-star.star-1 {
    right: -14px;
  }

  .bar-star.star-2 {
    right: -8px;
    top: -8px;
  }

  .bar-star.star-3 {
    right: -6px;
    top: auto;
    bottom: -6px;
  }

  .bar-arc {
    top: 50%;
    left: auto;
    right: 5px;
  }

  .bar-arc.arc-2 {
    right: 15px;
  }

  /* Star progress wrapper (mobile) */
  .star-progress-wrapper {
    position: relative;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 4px 12px 4px 0;
  }

  .star-progress-wrapper.celebrating {
    filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color));
    animation: wrapperPulse calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-in-out infinite;
  }

  .star-container {
    position: relative;
    width: 24px;
    height: 24px;
  }

  .star-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    color: rgba(108, 92, 231, 0.3);
  }

  .star-fill-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .star-fill {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 4px currentColor);
    transition: all 0.5s var(--ease-out);
  }

  .star-container.celebrating .star-fill {
    animation: starFillPulse calc(0.8s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  @keyframes starFillPulse {
    0%,
    100% {
      filter: drop-shadow(0 0 4px currentColor) brightness(1);
    }
    50% {
      filter: drop-shadow(0 0 12px currentColor) drop-shadow(0 0 20px currentColor) brightness(1.3);
    }
  }

  .star-shimmer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(255, 255, 255, 0.6) 45%,
      rgba(255, 255, 255, 0.9) 50%,
      rgba(255, 255, 255, 0.6) 55%,
      transparent 100%
    );
    animation: starShimmer calc(1.5s - var(--celebration-intensity, 0) * 0.7s) ease-in-out infinite;
    pointer-events: none;
    mask: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'/%3E%3C/svg%3E");
    -webkit-mask: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'/%3E%3C/svg%3E");
    mask-size: contain;
    -webkit-mask-size: contain;
  }

  @keyframes starShimmer {
    0% {
      transform: translateY(100%);
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    100% {
      transform: translateY(-100%);
      opacity: 0;
    }
  }

  /* Pulse rings - centered for star */
  .pulse-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    border: 2px solid var(--glow-color);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    pointer-events: none;
  }

  .pulse-ring-1 {
    animation: pulseExpand calc(2s - var(--celebration-intensity, 0) * 0.8s) ease-out infinite;
  }

  .pulse-ring-2 {
    animation: pulseExpand calc(2s - var(--celebration-intensity, 0) * 0.8s) ease-out infinite;
    animation-delay: calc(1s - var(--celebration-intensity, 0) * 0.4s);
  }

  @keyframes pulseExpand {
    0% {
      width: 10px;
      height: 10px;
      opacity: 0.9;
      border-width: 3px;
    }
    100% {
      width: 60px;
      height: 60px;
      opacity: 0;
      border-width: 1px;
    }
  }

  /* Particle burst - centered for star */
  .particle-burst {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .particle {
    position: absolute;
    width: 3px;
    height: 3px;
    background: var(--glow-color);
    border-radius: 50%;
    box-shadow:
      0 0 6px var(--glow-color),
      0 0 10px var(--glow-color);
    animation: particleShoot calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes particleShoot {
    0% {
      transform: rotate(var(--angle)) translateX(5px);
      opacity: 1;
    }
    100% {
      transform: rotate(var(--angle)) translateX(var(--distance));
      opacity: 0;
    }
  }

  /* Orbiting sparks - centered for star */
  .orbit-spark {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 4px;
    background: var(--glow-color);
    border-radius: 50%;
    box-shadow:
      0 0 8px var(--glow-color),
      0 0 15px var(--glow-color);
    pointer-events: none;
  }

  .orbit-1 {
    animation: orbit calc(2s - var(--celebration-intensity, 0) * 0.8s) linear infinite;
    --orbit-radius: 18px;
  }

  .orbit-2 {
    animation: orbit calc(2.5s - var(--celebration-intensity, 0) * 1s) linear infinite reverse;
    animation-delay: -0.5s;
    --orbit-radius: 25px;
  }

  @keyframes orbit {
    from {
      transform: rotate(0deg) translateX(var(--orbit-radius)) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg);
    }
  }

  /* Multiple overflow stars - positioned around star center */
  .overflow-star {
    position: absolute;
    font-size: 10px;
    color: var(--glow-color);
    text-shadow:
      0 0 8px var(--glow-color),
      0 0 15px var(--glow-color);
    pointer-events: none;
  }

  .star-1 {
    top: -4px;
    right: -4px;
    animation: starPulse calc(1s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  .star-2 {
    bottom: -2px;
    left: -4px;
    font-size: 7px;
    animation: starPulseAlt calc(1.2s - var(--celebration-intensity, 0) * 0.4s) ease-in-out infinite;
    animation-delay: -0.3s;
  }

  .star-3 {
    top: 50%;
    right: -8px;
    font-size: 8px;
    transform: translateY(-50%);
    animation: starPulse calc(0.9s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
    animation-delay: -0.6s;
  }

  @keyframes starPulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
      filter: brightness(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.4);
      filter: brightness(1.5);
    }
  }

  @keyframes starPulseAlt {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
      filter: brightness(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.5);
      filter: brightness(1.5);
    }
  }

  .star-2 {
    animation-name: starPulseAlt;
  }

  .star-3 {
    animation-name: starPulseAlt;
  }

  /* Energy arcs - positioned around star */
  .energy-arc {
    position: absolute;
    width: 2px;
    height: 10px;
    background: var(--glow-color);
    border-radius: 2px;
    transform-origin: center center;
    pointer-events: none;
    filter: blur(0.5px);
    box-shadow: 0 0 4px var(--glow-color);
  }

  .arc-1 {
    top: -6px;
    left: 50%;
    animation: arcCrackle 0.3s steps(3) infinite;
    transform: translateX(-50%) rotate(15deg);
  }

  .arc-2 {
    bottom: -4px;
    right: 2px;
    height: 8px;
    animation: arcCrackle 0.25s steps(3) infinite;
    animation-delay: -0.1s;
    transform: rotate(-20deg);
  }

  @keyframes arcCrackle {
    0% {
      opacity: 0.3;
      scaleY: 0.7;
    }
    33% {
      opacity: 1;
      scaleY: 1.2;
    }
    66% {
      opacity: 0.5;
      scaleY: 0.9;
    }
    100% {
      opacity: 0.3;
      scaleY: 0.7;
    }
  }

  .action-btn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
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
    /* Toggle visibility */
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: flex !important;
    }

    .goal-item {
      padding: 0.625rem 0.75rem;
      gap: 0.5rem;
    }

    .goal-main {
      gap: 0.5rem;
    }

    .checkbox {
      width: 16px !important;
      height: 16px !important;
    }

    .checkmark {
      font-size: 0.5rem !important;
    }

    .increment-controls {
      gap: 0.25rem;
      flex-shrink: 0;
    }

    /* Smaller buttons */
    .increment-btn {
      width: 22px;
      height: 22px;
      font-size: 0.875rem;
      border-radius: var(--radius-md);
    }

    /* Larger numbers relative to buttons */
    .current-value {
      min-width: 3.25rem;
      font-size: 0.8125rem;
      padding: 0.25rem 0.375rem;
      font-weight: 700;
    }

    /* Input field sized for iPhone 16 Pro */
    .value-input {
      width: 3.25rem;
      font-size: 16px !important; /* Prevents iOS zoom */
      padding: 0.25rem 0.375rem;
      font-weight: 700;
    }

    .goal-name {
      font-size: 0.8125rem;
    }

    .goal-actions {
      gap: 0.375rem;
    }

    .action-btn {
      width: 36px;
      height: 36px;
      font-size: 1.25rem;
      opacity: 0.5;
    }

    /* Star progress on mobile */
    .star-progress-wrapper {
      width: 24px;
      height: 24px;
      margin: 2px 8px 2px 0;
    }

    .star-container {
      width: 20px;
      height: 20px;
    }

    /* Scale down celebration effects for star */
    .pulse-ring {
      width: 16px;
      height: 16px;
    }

    .overflow-star {
      font-size: 7px;
    }

    .star-1 {
      top: -3px;
      right: -3px;
    }

    .star-2 {
      bottom: -1px;
      left: -3px;
      font-size: 5px;
    }

    .star-3 {
      right: -6px;
      font-size: 6px;
    }

    .orbit-spark {
      width: 2px;
      height: 2px;
    }

    .orbit-1 {
      --orbit-radius: 12px;
    }

    .orbit-2 {
      --orbit-radius: 16px;
    }

    .particle {
      width: 2px;
      height: 2px;
    }

    .energy-arc {
      height: 7px;
      width: 1px;
    }

    .arc-1 {
      top: -4px;
    }

    .arc-2 {
      height: 5px;
      bottom: -3px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .mini-progress-wrapper.celebrating,
    .mini-progress.celebrating,
    .mini-progress-fill.celebrating,
    .shimmer-overlay,
    .pulse-ring,
    .particle,
    .orbit-spark,
    .overflow-star,
    .energy-arc {
      animation: none !important;
    }

    .mini-progress-wrapper.celebrating {
      filter: drop-shadow(0 0 8px var(--glow-color));
    }
  }
</style>
