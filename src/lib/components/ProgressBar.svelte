<script lang="ts">
  import { getProgressColor } from '$lib/utils/colors';

  interface Props {
    percentage: number;
    showLabel?: boolean;
    height?: string;
  }

  let { percentage, showLabel = true, height = '8px' }: Props = $props();

  const color = $derived(getProgressColor(percentage));
</script>

<div class="progress-container">
  <div class="progress-bar" style="height: {height}">
    <div
      class="progress-fill"
      style="width: {percentage}%; background-color: {color}"
    ></div>
  </div>
  {#if showLabel}
    <span class="progress-label" style="color: {color}">{Math.round(percentage)}%</span>
  {/if}
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .progress-bar {
    flex: 1;
    background-color: var(--color-bg-tertiary);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease, background-color 0.3s ease;
  }

  .progress-label {
    font-size: 0.875rem;
    font-weight: 600;
    min-width: 3rem;
    text-align: right;
  }
</style>
