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

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }

  @media (max-width: 480px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  .type-toggle {
    display: flex;
    gap: 0.75rem;
  }

  .type-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: linear-gradient(135deg,
      rgba(37, 37, 61, 0.8) 0%,
      rgba(26, 26, 46, 0.9) 100%);
    border: 2px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-smooth);
    position: relative;
    overflow: hidden;
  }

  .type-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--gradient-primary);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .type-btn:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .type-btn.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 25px var(--color-primary-glow),
                inset 0 0 30px rgba(108, 92, 231, 0.1);
  }

  .type-btn.active::before {
    opacity: 0.15;
  }

  .type-icon {
    font-size: 1.75rem;
    position: relative;
    z-index: 1;
    transition: transform 0.3s var(--ease-bounce);
  }

  .type-btn:hover .type-icon {
    transform: scale(1.2);
  }

  .type-btn.active .type-icon {
    filter: drop-shadow(0 0 10px var(--color-primary));
  }

  .type-btn span:last-child {
    position: relative;
    z-index: 1;
    font-weight: 500;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: var(--radius-md);
    transition: background 0.2s;
  }

  .checkbox-label:hover {
    background: rgba(108, 92, 231, 0.1);
  }

  .checkbox-label input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--color-primary);
  }

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

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.1);
  }
</style>
