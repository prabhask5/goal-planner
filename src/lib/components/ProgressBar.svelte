<script lang="ts">
  import { getProgressColor } from '$lib/utils/colors';

  interface Props {
    percentage: number;
    showLabel?: boolean;
    height?: string;
  }

  let { percentage, showLabel = true, height = '12px' }: Props = $props();

  const color = $derived(getProgressColor(percentage));
</script>

<div class="progress-container">
  <div class="progress-bar" style="height: {height}">
    <div
      class="progress-fill"
      style="width: {percentage}%; --fill-color: {color}"
    ></div>
    <div class="progress-glow" style="width: {percentage}%; --fill-color: {color}"></div>
  </div>
  {#if showLabel}
    <span class="progress-label" style="color: {color}">{Math.round(percentage)}%</span>
  {/if}
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .progress-bar {
    flex: 1;
    background: linear-gradient(180deg,
      rgba(20, 20, 40, 0.9) 0%,
      rgba(10, 10, 25, 0.95) 100%);
    border-radius: var(--radius-full);
    overflow: hidden;
    position: relative;
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.4),
      inset 0 -1px 0 rgba(255, 255, 255, 0.03),
      0 1px 3px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .progress-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--fill-color) 100%, white 20%) 0%,
      var(--fill-color) 50%,
      color-mix(in srgb, var(--fill-color) 80%, black) 100%);
    transition: width 0.6s var(--ease-out);
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
    animation: progressPulse 2s ease-in-out infinite;
  }

  @keyframes progressPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.1); }
  }

  /* Shine effect on top */
  .progress-fill::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg,
      rgba(255, 255, 255, 0.35) 0%,
      rgba(255, 255, 255, 0.1) 50%,
      transparent 100%);
    border-radius: var(--radius-full) var(--radius-full) 0 0;
  }

  /* Animated shimmer */
  .progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%);
    animation: shimmer 2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  .progress-glow {
    position: absolute;
    top: -50%;
    left: 0;
    height: 200%;
    border-radius: var(--radius-full);
    background: var(--fill-color);
    filter: blur(12px);
    opacity: 0.5;
    transition: width 0.6s var(--ease-out);
    pointer-events: none;
    animation: glowPulse 2s ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.6; }
  }

  .progress-label {
    font-size: 1.125rem;
    font-weight: 800;
    min-width: 4rem;
    text-align: right;
    text-shadow: 0 0 30px currentColor;
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
    letter-spacing: -0.02em;
    transition: all 0.3s var(--ease-out);
  }

  .progress-container:hover .progress-label {
    transform: scale(1.05);
    text-shadow: 0 0 40px currentColor;
  }
</style>
