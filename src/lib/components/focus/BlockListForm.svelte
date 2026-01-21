<script lang="ts">
  import type { DayOfWeek } from '$lib/types';

  interface Props {
    name?: string;
    activeDays?: DayOfWeek[] | null;
    submitLabel?: string;
    onSubmit: (data: { name: string; activeDays: DayOfWeek[] | null }) => void;
    onCancel?: () => void;
  }

  let {
    name: initialName = '',
    activeDays: initialActiveDays = null,
    submitLabel = 'Create',
    onSubmit,
    onCancel
  }: Props = $props();

  // Day labels for the selector
  const dayLabels: { short: string; full: string; value: DayOfWeek }[] = [
    { short: 'S', full: 'Sun', value: 0 },
    { short: 'M', full: 'Mon', value: 1 },
    { short: 'T', full: 'Tue', value: 2 },
    { short: 'W', full: 'Wed', value: 3 },
    { short: 'T', full: 'Thu', value: 4 },
    { short: 'F', full: 'Fri', value: 5 },
    { short: 'S', full: 'Sat', value: 6 }
  ];

  let name = $state(initialName);

  // Active days state - null means all days, empty array means no days (invalid)
  // Default to all days selected if null
  let selectedDays = $state<Set<DayOfWeek>>(
    initialActiveDays === null
      ? new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[])
      : new Set(initialActiveDays)
  );
  let allDaysSelected = $derived(selectedDays.size === 7);

  function toggleDay(day: DayOfWeek) {
    const newSet = new Set(selectedDays);
    if (newSet.has(day)) {
      // Don't allow deselecting the last day
      if (newSet.size > 1) {
        newSet.delete(day);
      }
    } else {
      newSet.add(day);
    }
    selectedDays = newSet;
  }

  function selectAllDays() {
    selectedDays = new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]);
  }

  function selectWeekdays() {
    selectedDays = new Set([1, 2, 3, 4, 5] as DayOfWeek[]);
  }

  function selectWeekends() {
    selectedDays = new Set([0, 6] as DayOfWeek[]);
  }

  // Helper to get active days description
  const activeDaysDescription = $derived(() => {
    if (selectedDays.size === 7) return 'every day';
    if (selectedDays.size === 5 && !selectedDays.has(0) && !selectedDays.has(6)) {
      return 'weekdays only';
    }
    if (selectedDays.size === 2 && selectedDays.has(0) && selectedDays.has(6)) {
      return 'weekends only';
    }
    const days = Array.from(selectedDays).sort((a, b) => a - b);
    return days.map(d => dayLabels[d].full).join(', ');
  });

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!name.trim()) return;
    if (selectedDays.size === 0) return;

    // Convert selected days to sorted array, or null if all days selected
    const activeDaysResult: DayOfWeek[] | null = allDaysSelected
      ? null
      : (Array.from(selectedDays).sort((a, b) => a - b) as DayOfWeek[]);

    onSubmit({
      name: name.trim(),
      activeDays: activeDaysResult
    });
  }
</script>

<form class="block-list-form" onsubmit={handleSubmit}>
  <div class="form-group">
    <label for="block-list-name">Block List Name</label>
    <input
      id="block-list-name"
      type="text"
      bind:value={name}
      placeholder="Enter block list name..."
      required
    />
  </div>

  <!-- Active Days Selector -->
  <div class="form-group">
    <label>Active Days</label>
    <div class="days-selector">
      {#each dayLabels as day}
        <button
          type="button"
          class="day-btn"
          class:active={selectedDays.has(day.value)}
          onclick={() => toggleDay(day.value)}
          title={day.full}
          aria-label={day.full}
          aria-pressed={selectedDays.has(day.value)}
        >
          <span class="day-short">{day.short}</span>
          <span class="day-full">{day.full}</span>
        </button>
      {/each}
    </div>
    <div class="quick-select">
      <button
        type="button"
        class="quick-btn"
        class:active={allDaysSelected}
        onclick={selectAllDays}
      >
        Every day
      </button>
      <button
        type="button"
        class="quick-btn"
        class:active={selectedDays.size === 5 && !selectedDays.has(0) && !selectedDays.has(6)}
        onclick={selectWeekdays}
      >
        Weekdays
      </button>
      <button
        type="button"
        class="quick-btn"
        class:active={selectedDays.size === 2 && selectedDays.has(0) && selectedDays.has(6)}
        onclick={selectWeekends}
      >
        Weekends
      </button>
    </div>
  </div>

  <p class="help-text">
    This block list will be active on <strong>{activeDaysDescription()}</strong> during focus sessions.
  </p>

  <div class="form-actions">
    {#if onCancel}
      <button type="button" class="btn btn-secondary" onclick={onCancel}>
        Cancel
      </button>
    {/if}
    <button type="submit" class="btn btn-primary">
      {submitLabel}
    </button>
  </div>
</form>

<style>
  .block-list-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Days Selector */
  .days-selector {
    display: flex;
    gap: 0.375rem;
    justify-content: space-between;
  }

  .day-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 48px;
    padding: 0.375rem;
    background: linear-gradient(135deg,
      rgba(37, 37, 61, 0.8) 0%,
      rgba(26, 26, 46, 0.9) 100%);
    border: 2px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
    transition: all 0.2s var(--ease-smooth);
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .day-btn .day-short {
    display: block;
    font-size: 0.875rem;
  }

  .day-btn .day-full {
    display: none;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .day-btn:hover {
    border-color: rgba(108, 92, 231, 0.4);
    transform: translateY(-1px);
  }

  .day-btn.active {
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(108, 92, 231, 0.15) 100%);
    border-color: var(--color-primary);
    color: var(--color-text);
    box-shadow: 0 0 12px var(--color-primary-glow);
  }

  .day-btn.active:hover {
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.4) 0%,
      rgba(108, 92, 231, 0.2) 100%);
  }

  /* Larger screens - show full day name */
  @media (min-width: 480px) {
    .day-btn {
      height: 52px;
      min-width: 44px;
    }

    .day-btn .day-short {
      display: none;
    }

    .day-btn .day-full {
      display: block;
    }
  }

  /* Quick select buttons */
  .quick-select {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .quick-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    background: rgba(37, 37, 61, 0.5);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
    transition: all 0.2s var(--ease-smooth);
    white-space: nowrap;
  }

  .quick-btn:hover {
    background: rgba(108, 92, 231, 0.15);
    border-color: rgba(108, 92, 231, 0.3);
    color: var(--color-text);
  }

  .quick-btn.active {
    background: rgba(108, 92, 231, 0.2);
    border-color: var(--color-primary);
    color: var(--color-primary-light);
  }

  @media (max-width: 400px) {
    .quick-select {
      flex-wrap: wrap;
    }

    .quick-btn {
      flex: none;
      padding: 0.375rem 0.625rem;
      font-size: 0.6875rem;
    }
  }

  /* Help text */
  .help-text {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    padding: 0.875rem 1rem;
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.1) 0%,
      rgba(108, 92, 231, 0.05) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    line-height: 1.6;
  }

  .help-text strong {
    color: var(--color-primary-light);
    font-weight: 600;
  }

  /* Form actions */
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.1);
  }
</style>
