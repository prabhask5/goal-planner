<script lang="ts">
  import Modal from './Modal.svelte';
  import type { LongTermTaskWithCategory, TaskCategory } from '$lib/types';

  interface Props {
    open: boolean;
    task: LongTermTaskWithCategory | null;
    categories: TaskCategory[];
    onClose: () => void;
    onUpdate: (id: string, updates: { name?: string; due_date?: string; category_id?: string | null }) => void;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
  }

  let { open, task, categories, onClose, onUpdate, onToggle, onDelete }: Props = $props();

  // Focus action for accessibility
  function focus(node: HTMLElement) {
    node.focus();
  }

  let editingName = $state(false);
  let name = $state('');
  let dueDate = $state('');
  let categoryId = $state<string | null>(null);
  let completed = $state(false);

  $effect(() => {
    if (task) {
      name = task.name;
      dueDate = task.due_date;
      categoryId = task.category_id;
      completed = task.completed;
    }
  });

  function handleNameSubmit() {
    if (task && name.trim() && name !== task.name) {
      onUpdate(task.id, { name: name.trim() });
    }
    editingName = false;
  }

  function handleDueDateChange() {
    if (task && dueDate !== task.due_date) {
      onUpdate(task.id, { due_date: dueDate });
    }
  }

  function handleCategoryChange() {
    if (task && categoryId !== task.category_id) {
      onUpdate(task.id, { category_id: categoryId });
    }
  }

  function handleDelete() {
    if (task && confirm('Delete this task?')) {
      onDelete(task.id);
      onClose();
    }
  }

  function handleToggle() {
    if (task) {
      // Update local state immediately for responsive UI
      completed = !completed;
      onToggle(task.id);
    }
  }

  function isOverdue(): boolean {
    if (!task) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = new Date(task.due_date + 'T00:00:00');
    return taskDueDate < today && !completed;
  }

  function isDueToday(): boolean {
    if (!task) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = new Date(task.due_date + 'T00:00:00');
    return taskDueDate.getTime() === today.getTime() && !completed;
  }

  function formatDisplayDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<Modal {open} title="Task Details" onClose={onClose}>
  {#if task}
    <div class="task-details">
      <div class="field">
        <label class="field-label">Name</label>
        {#if editingName}
          <input
            type="text"
            bind:value={name}
            class="field-input"
            onblur={handleNameSubmit}
            onkeydown={(e) => e.key === 'Enter' && handleNameSubmit()}
            use:focus
          />
        {:else}
          <button class="field-value editable" onclick={() => editingName = true}>
            {task.name}
          </button>
        {/if}
      </div>

      <div class="field">
        <label class="field-label">Due Date</label>
        <input
          type="date"
          bind:value={dueDate}
          class="field-input date-input"
          onchange={handleDueDateChange}
        />
        {#if isOverdue()}
          <span class="overdue-badge">Overdue</span>
        {:else if isDueToday()}
          <span class="due-today-badge">Due Today</span>
        {/if}
      </div>

      <div class="field">
        <label class="field-label">Tag</label>
        <select
          bind:value={categoryId}
          class="field-input"
          onchange={handleCategoryChange}
        >
          <option value={null}>No tag</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
        {#if task.category}
          <div class="category-preview" style="--cat-color: {task.category.color}">
            <span class="category-dot"></span>
            {task.category.name}
          </div>
        {/if}
      </div>

      <div class="field">
        <label class="field-label">Status</label>
        <button
          class="status-toggle"
          class:completed={completed}
          onclick={handleToggle}
        >
          {#if completed}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Completed
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
            Mark as Complete
          {/if}
        </button>
      </div>

      <div class="actions">
        <button class="delete-btn" onclick={handleDelete}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete Task
        </button>
      </div>
    </div>
  {/if}
</Modal>

<style>
  .task-details {
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
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    transition: all 0.3s var(--ease-out);
  }

  .field-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .date-input {
    color-scheme: dark;
  }

  .field-value {
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    text-align: left;
    width: 100%;
    cursor: default;
  }

  .field-value.editable {
    cursor: pointer;
    transition: all 0.3s var(--ease-out);
  }

  .field-value.editable:hover {
    border-color: rgba(108, 92, 231, 0.4);
    background: rgba(20, 20, 40, 0.8);
  }

  .overdue-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 107, 107, 0.2);
    border: 1px solid rgba(255, 107, 107, 0.4);
    border-radius: var(--radius-md);
    color: var(--color-red);
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.25rem;
    width: fit-content;
  }

  .due-today-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 217, 61, 0.2);
    border: 1px solid rgba(255, 217, 61, 0.4);
    border-radius: var(--radius-md);
    color: var(--color-yellow);
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.25rem;
    width: fit-content;
  }

  .category-preview {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(var(--cat-color), 0.1);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    color: var(--color-text);
    margin-top: 0.25rem;
    width: fit-content;
  }

  .category-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat-color);
    box-shadow: 0 0 8px var(--cat-color);
  }

  .status-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .status-toggle:hover {
    border-color: rgba(108, 92, 231, 0.4);
    background: rgba(20, 20, 40, 0.8);
  }

  .status-toggle.completed {
    background: rgba(38, 222, 129, 0.15);
    border-color: rgba(38, 222, 129, 0.4);
    color: var(--color-green);
  }

  .actions {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .delete-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 107, 107, 0.15);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: var(--radius-lg);
    color: var(--color-red);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .delete-btn:hover {
    background: rgba(255, 107, 107, 0.25);
    border-color: rgba(255, 107, 107, 0.5);
    transform: scale(1.02);
  }
</style>
