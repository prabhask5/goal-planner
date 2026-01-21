<script lang="ts">
  import { getProgressColor, calculateGoalProgress, getOverflowColor } from '$lib/utils/colors';
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

  // Focus action for accessibility
  function focus(node: HTMLElement) {
    node.focus();
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
  const progressColor = $derived(progress > 100 ? getOverflowColor(progress) : getProgressColor(progress));

  // Celebration state for overflow
  const isCelebrating = $derived(progress > 100);
  const celebrationIntensity = $derived(
    progress <= 100 ? 0 : Math.min(1, (progress - 100) / 100)
  );

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
  class="goal-item"
  class:celebrating={isCelebrating}
  style="border-left-color: {progressColor}; --celebration-intensity: {celebrationIntensity}; --glow-color: {progressColor}"
>
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
        <button class="increment-btn" onclick={onIncrement} aria-label="Increment">+</button>
      </div>
    {/if}

    <span class="goal-name" class:completed={completed && goal.type === 'completion'}>
      {goal.name}
    </span>
  </div>

  <div class="goal-actions">
    {#if goal.type === 'incremental'}
      <div
        class="mini-progress-wrapper"
        class:celebrating={isCelebrating}
        style="--glow-color: {progressColor}; --celebration-intensity: {celebrationIntensity}"
      >
        <!-- Pulse rings for celebration -->
        {#if celebrationIntensity > 0.3}
          <div class="pulse-ring pulse-ring-1"></div>
          {#if celebrationIntensity > 0.6}
            <div class="pulse-ring pulse-ring-2"></div>
          {/if}
        {/if}

        <div
          class="mini-progress"
          class:celebrating={isCelebrating}
        >
          <div
            class="mini-progress-fill"
            class:celebrating={isCelebrating}
            style="width: {Math.min(100, progress)}%; background-color: {progressColor}"
          ></div>

          <!-- Shimmer overlay -->
          {#if isCelebrating}
            <div class="shimmer-overlay"></div>
          {/if}
        </div>

        <!-- Starburst particles -->
        {#if celebrationIntensity > 0.1}
          <div class="particle-burst">
            {#each Array(Math.floor(celebrationIntensity * 8)) as _, i}
              <div
                class="particle"
                style="--angle: {i * 45}deg; --delay: {i * 0.15}s; --distance: {20 + (i % 3) * 10}px"
              ></div>
            {/each}
          </div>
        {/if}

        <!-- Orbiting sparks -->
        {#if celebrationIntensity > 0.5}
          <div class="orbit-spark orbit-1"></div>
          {#if celebrationIntensity > 0.75}
            <div class="orbit-spark orbit-2"></div>
          {/if}
        {/if}

        <!-- Overflow stars -->
        {#if isCelebrating}
          <span class="overflow-star star-1">✦</span>
          {#if celebrationIntensity > 0.4}
            <span class="overflow-star star-2">✦</span>
          {/if}
          {#if celebrationIntensity > 0.7}
            <span class="overflow-star star-3">✧</span>
          {/if}
        {/if}

        <!-- Energy crackle at high intensity -->
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

  /* Celebration effects for overflow */
  .goal-item.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 40%, rgba(108, 92, 231, 0.15));
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.3),
      0 0 calc(20px + var(--celebration-intensity, 0) * 30px) color-mix(in srgb, var(--glow-color) calc(var(--celebration-intensity, 0) * 40%), transparent);
  }

  .goal-item.celebrating::after {
    opacity: calc(0.3 + var(--celebration-intensity, 0) * 0.7);
    background: radial-gradient(ellipse, color-mix(in srgb, var(--glow-color) 15%, transparent) 0%, transparent 70%);
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

  /* Mini progress wrapper - contains all effects */
  .mini-progress-wrapper {
    position: relative;
    width: 80px;
    height: 10px;
    /* Extra space for effects */
    margin: 15px 25px 15px 10px;
  }

  .mini-progress-wrapper.celebrating {
    /* Pulsing glow aura */
    filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color));
    animation: wrapperPulse calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-in-out infinite;
  }

  @keyframes wrapperPulse {
    0%, 100% { filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color)); }
    50% { filter: drop-shadow(0 0 calc(8px + var(--celebration-intensity, 0) * 20px) var(--glow-color)); }
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
    animation: barExpand calc(1s - var(--celebration-intensity, 0) * 0.4s) ease-in-out infinite;
  }

  @keyframes barExpand {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(calc(1 + var(--celebration-intensity, 0) * 0.4)); }
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

  .mini-progress-fill.celebrating {
    animation: fillPulse calc(0.8s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  @keyframes fillPulse {
    0%, 100% {
      filter: brightness(1);
      box-shadow: 0 0 15px currentColor;
    }
    50% {
      filter: brightness(1.3);
      box-shadow: 0 0 25px currentColor, 0 0 40px currentColor;
    }
  }

  /* Shimmer overlay */
  .shimmer-overlay {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.5) 40%,
      rgba(255, 255, 255, 0.8) 50%,
      rgba(255, 255, 255, 0.5) 60%,
      transparent 100%);
    animation: shimmerSweep calc(1.5s - var(--celebration-intensity, 0) * 0.7s) ease-in-out infinite;
  }

  @keyframes shimmerSweep {
    0% { left: -100%; }
    100% { left: 200%; }
  }

  /* Pulse rings */
  .pulse-ring {
    position: absolute;
    top: 50%;
    right: 0;
    width: 20px;
    height: 20px;
    border: 2px solid var(--glow-color);
    border-radius: 50%;
    transform: translate(50%, -50%);
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

  /* Particle burst */
  .particle-burst {
    position: absolute;
    top: 50%;
    right: 0;
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
    box-shadow: 0 0 6px var(--glow-color), 0 0 10px var(--glow-color);
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

  /* Orbiting sparks */
  .orbit-spark {
    position: absolute;
    top: 50%;
    right: 0;
    width: 4px;
    height: 4px;
    background: var(--glow-color);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--glow-color), 0 0 15px var(--glow-color);
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

  /* Multiple overflow stars */
  .overflow-star {
    position: absolute;
    top: 50%;
    font-size: 12px;
    color: var(--glow-color);
    text-shadow: 0 0 8px var(--glow-color), 0 0 15px var(--glow-color);
    pointer-events: none;
  }

  .star-1 {
    right: -14px;
    transform: translateY(-50%);
    animation: starPulse calc(1s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  .star-2 {
    right: -8px;
    top: -8px;
    font-size: 8px;
    animation: starPulse calc(1.2s - var(--celebration-intensity, 0) * 0.4s) ease-in-out infinite;
    animation-delay: -0.3s;
  }

  .star-3 {
    right: -6px;
    top: auto;
    bottom: -6px;
    font-size: 10px;
    animation: starPulse calc(0.9s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
    animation-delay: -0.6s;
  }

  @keyframes starPulse {
    0%, 100% {
      opacity: 0.6;
      transform: translateY(-50%) scale(1);
      filter: brightness(1);
    }
    50% {
      opacity: 1;
      transform: translateY(-50%) scale(1.4);
      filter: brightness(1.5);
    }
  }

  .star-2, .star-3 {
    transform: none;
  }

  @keyframes starPulseAlt {
    0%, 100% {
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

  /* Energy arcs */
  .energy-arc {
    position: absolute;
    top: 50%;
    right: 5px;
    width: 2px;
    height: 12px;
    background: var(--glow-color);
    border-radius: 2px;
    transform-origin: bottom center;
    pointer-events: none;
    filter: blur(0.5px);
    box-shadow: 0 0 4px var(--glow-color);
  }

  .arc-1 {
    animation: arcCrackle 0.3s steps(3) infinite;
    transform: translateY(-50%) rotate(30deg);
  }

  .arc-2 {
    right: 15px;
    height: 8px;
    animation: arcCrackle 0.25s steps(3) infinite;
    animation-delay: -0.1s;
    transform: translateY(-50%) rotate(-25deg);
  }

  @keyframes arcCrackle {
    0% { opacity: 0.3; transform: translateY(-50%) rotate(30deg) scaleY(0.7); }
    33% { opacity: 1; transform: translateY(-50%) rotate(35deg) scaleY(1.2); }
    66% { opacity: 0.5; transform: translateY(-50%) rotate(25deg) scaleY(0.9); }
    100% { opacity: 0.3; transform: translateY(-50%) rotate(30deg) scaleY(0.7); }
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
