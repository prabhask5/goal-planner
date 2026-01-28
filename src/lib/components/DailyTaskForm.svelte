<script lang="ts">
  interface Props {
    onSubmit: (name: string) => void;
  }

  let { onSubmit }: Props = $props();

  let name = $state('');
  let inputEl: HTMLInputElement;

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
    name = '';
    inputEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }
</script>

<form class="task-form" onsubmit={handleSubmit}>
  <input
    bind:this={inputEl}
    bind:value={name}
    type="text"
    placeholder="Add a task..."
    class="task-input"
    onkeydown={handleKeydown}
  />
  <button type="submit" class="add-btn" disabled={!name.trim()} aria-label="Add task">
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  </button>
</form>

<style>
  .task-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .task-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 0.9375rem;
    transition: all 0.3s var(--ease-out);
  }

  .task-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .task-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
    background: rgba(20, 20, 40, 0.9);
  }

  .add-btn {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-lg);
    background: var(--gradient-primary);
    border: none;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: rgba(108, 92, 231, 0.3);
  }

  .add-btn:not(:disabled):hover {
    transform: scale(1.08);
    box-shadow: 0 0 25px var(--color-primary-glow);
  }

  .add-btn:not(:disabled):active {
    transform: scale(0.95);
  }
</style>
