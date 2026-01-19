<script lang="ts">
  import type { GoalType } from '$lib/types';
  import { formatDate } from '$lib/utils/dates';

  interface Props {
    name?: string;
    type?: GoalType;
    targetValue?: number | null;
    startDate?: string;
    endDate?: string | null;
    submitLabel?: string;
    onSubmit: (data: {
      name: string;
      type: GoalType;
      targetValue: number | null;
      startDate: string;
      endDate: string | null;
    }) => void;
    onCancel?: () => void;
  }

  let {
    name: initialName = '',
    type: initialType = 'completion',
    targetValue: initialTargetValue = 10,
    startDate: initialStartDate = formatDate(new Date()),
    endDate: initialEndDate = null,
    submitLabel = 'Create',
    onSubmit,
    onCancel
  }: Props = $props();

  let name = $state(initialName);
  let type = $state<GoalType>(initialType);
  let targetValue = $state(initialTargetValue ?? 10);
  let startDate = $state(initialStartDate);
  let hasEndDate = $state(initialEndDate !== null);
  let endDate = $state(initialEndDate ?? formatDate(new Date()));

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      type,
      targetValue: type === 'incremental' ? targetValue : null,
      startDate,
      endDate: hasEndDate ? endDate : null
    });
  }
</script>

<form class="routine-form" onsubmit={handleSubmit}>
  <div class="form-group">
    <label for="routine-name">Routine Name</label>
    <input
      id="routine-name"
      type="text"
      bind:value={name}
      placeholder="Enter routine name..."
      required
    />
  </div>

  <div class="form-group">
    <label>Goal Type</label>
    <div class="type-toggle">
      <button
        type="button"
        class="type-btn"
        class:active={type === 'completion'}
        onclick={() => (type = 'completion')}
      >
        <span class="type-icon">✓</span>
        <span>Completion</span>
      </button>
      <button
        type="button"
        class="type-btn"
        class:active={type === 'incremental'}
        onclick={() => (type = 'incremental')}
      >
        <span class="type-icon">↑</span>
        <span>Incremental</span>
      </button>
    </div>
  </div>

  {#if type === 'incremental'}
    <div class="form-group">
      <label for="target-value">Daily Target Value</label>
      <input
        id="target-value"
        type="number"
        bind:value={targetValue}
        min="1"
        required
      />
    </div>
  {/if}

  <div class="form-row">
    <div class="form-group">
      <label for="start-date">Start Date</label>
      <input id="start-date" type="date" bind:value={startDate} required />
    </div>

    <div class="form-group">
      <label for="end-date-toggle" class="checkbox-label">
        <input id="end-date-toggle" type="checkbox" bind:checked={hasEndDate} />
        <span>Has End Date</span>
      </label>
      {#if hasEndDate}
        <input id="end-date" type="date" bind:value={endDate} min={startDate} required />
      {/if}
    </div>
  </div>

  <p class="help-text">
    {#if hasEndDate}
      This routine will be active from {startDate} to {endDate}.
    {:else}
      This routine will be active indefinitely starting from {startDate}.
    {/if}
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
  .routine-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 480px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  .type-toggle {
    display: flex;
    gap: 0.5rem;
  }

  .type-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem;
    background-color: var(--color-bg-tertiary);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .type-btn:hover {
    border-color: var(--color-primary);
  }

  .type-btn.active {
    border-color: var(--color-primary);
    background-color: rgba(108, 92, 231, 0.1);
  }

  .type-icon {
    font-size: 1.25rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .help-text {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    padding: 0.5rem;
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>
