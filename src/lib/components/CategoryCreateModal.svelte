<script lang="ts">
  import Modal from './Modal.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (name: string, color: string) => void;
  }

  let { open, onClose, onCreate }: Props = $props();

  const presetColors = [
    '#6c5ce7', // Purple
    '#ff79c6', // Pink
    '#00cec9', // Teal
    '#fdcb6e', // Yellow
    '#e17055', // Orange
    '#d63031', // Red
    '#00b894', // Green
    '#0984e3', // Blue
  ];

  let name = $state('');
  let color = $state(presetColors[0]);

  $effect(() => {
    if (open) {
      name = '';
      color = presetColors[0];
    }
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal {open} title="New Category" {onClose}>
  <form class="form" onsubmit={handleSubmit}>
    <div class="field">
      <label class="field-label" for="category-name">Category Name</label>
      <input
        id="category-name"
        type="text"
        bind:value={name}
        class="field-input"
        placeholder="e.g. Work, Personal, Health..."
        autofocus
      />
    </div>

    <div class="field">
      <label class="field-label">Color</label>
      <div class="color-picker">
        {#each presetColors as presetColor}
          <button
            type="button"
            class="color-btn"
            class:selected={color === presetColor}
            style="--btn-color: {presetColor}"
            onclick={() => color = presetColor}
            aria-label="Select color"
          ></button>
        {/each}
      </div>
      <div class="color-preview" style="--preview-color: {color}">
        <span class="preview-dot"></span>
        <span class="preview-text">{name || 'Category Preview'}</span>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="cancel-btn" onclick={onClose}>
        Cancel
      </button>
      <button type="submit" class="submit-btn" disabled={!name.trim()}>
        Create Category
      </button>
    </div>
  </form>
</Modal>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .field-input {
    padding: 0.875rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    transition: all 0.3s var(--ease-out);
  }

  .field-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .color-picker {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .color-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--btn-color);
    border: 3px solid transparent;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .color-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px var(--btn-color);
  }

  .color-btn.selected {
    border-color: white;
    box-shadow: 0 0 20px var(--btn-color);
    transform: scale(1.05);
  }

  .color-preview {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    margin-top: 0.5rem;
  }

  .preview-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--preview-color);
    box-shadow: 0 0 10px color-mix(in srgb, var(--preview-color) 50%, transparent);
  }

  .preview-text {
    font-size: 0.9375rem;
    color: var(--color-text);
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .cancel-btn {
    flex: 1;
    padding: 0.875rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .cancel-btn:hover {
    background: rgba(255, 107, 107, 0.15);
    border-color: rgba(255, 107, 107, 0.3);
    color: var(--color-red);
  }

  .submit-btn {
    flex: 1;
    padding: 0.875rem 1rem;
    background: var(--gradient-primary);
    border: none;
    border-radius: var(--radius-lg);
    color: white;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .submit-btn:not(:disabled):hover {
    transform: scale(1.02);
    box-shadow: 0 0 30px var(--color-primary-glow);
  }
</style>
