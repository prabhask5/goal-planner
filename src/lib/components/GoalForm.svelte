<script lang="ts">
  import type { GoalType } from '$lib/types';

  interface Props {
    name?: string;
    type?: GoalType;
    targetValue?: number | null;
    submitLabel?: string;
    onSubmit: (data: { name: string; type: GoalType; targetValue: number | null }) => void;
    onCancel?: () => void;
  }

  let {
    name: initialName = '',
    type: initialType = 'completion',
    targetValue: initialTargetValue = 10,
    submitLabel = 'Create',
    onSubmit,
    onCancel
  }: Props = $props();

  let name = $state(initialName);
  let type = $state<GoalType>(initialType);
  let targetValue = $state(initialTargetValue ?? 10);

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      type,
      targetValue: type === 'incremental' ? targetValue : null
    });
  }
</script>

<form class="goal-form" onsubmit={handleSubmit}>
  <div class="form-group">
    <label for="goal-name">Goal Name</label>
    <input
      id="goal-name"
      type="text"
      bind:value={name}
      placeholder="Enter goal name..."
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
      <label for="target-value">Target Value</label>
      <input
        id="target-value"
        type="number"
        bind:value={targetValue}
        min="1"
        required
      />
    </div>
  {/if}

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
  .goal-form {
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

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>
