/**
 * Returns a color on the red-to-green spectrum based on a percentage (0-100)
 * 0% = red, 50% = yellow, 100% = green
 */
export function getProgressColor(percentage: number): string {
  const clamped = Math.max(0, Math.min(100, percentage));

  if (clamped <= 50) {
    // Red to yellow (0-50%)
    const ratio = clamped / 50;
    const r = 255;
    const g = Math.round(107 + (215 - 107) * ratio); // 107 (red) to 215 (yellow)
    const b = Math.round(107 * (1 - ratio)); // 107 to 0
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to green (50-100%)
    const ratio = (clamped - 50) / 50;
    const r = Math.round(255 * (1 - ratio)); // 255 to 0
    const g = Math.round(215 + (222 - 215) * ratio); // 215 to 222
    const b = Math.round(61 * ratio + 93 * ratio); // 0 to ~129
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Calculate completion percentage for a goal
 */
export function calculateGoalProgress(
  type: 'completion' | 'incremental',
  completed: boolean,
  currentValue: number,
  targetValue: number | null
): number {
  if (type === 'completion') {
    return completed ? 100 : 0;
  }
  if (targetValue === null || targetValue === 0) return 0;
  return Math.min(100, (currentValue / targetValue) * 100);
}
