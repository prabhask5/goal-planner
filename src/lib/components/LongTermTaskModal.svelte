<script lang="ts">
  import Modal from './Modal.svelte';
  import type { LongTermTaskWithCategory, TaskCategory } from '$lib/types';
  import { parseDateString } from '$lib/utils/dates';
  import { remoteChangeAnimation, trackEditing } from '$lib/actions/remoteChange';

  interface Props {
    open: boolean;
    task: LongTermTaskWithCategory | null;
    categories: TaskCategory[];
    onClose: () => void;
    onUpdate: (
      id: string,
      updates: { name?: string; due_date?: string; category_id?: string | null }
    ) => void;
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
  let dropdownOpen = $state(false);

  // Derive selected category from local state for immediate UI feedback
  const selectedCategory = $derived(
    categoryId ? categories.find((c) => c.id === categoryId) : null
  );

  $effect(() => {
    if (task) {
      name = task.name;
      dueDate = task.due_date;
      categoryId = task.category_id;
      completed = task.completed;
      dropdownOpen = false;
    }
  });

  function selectCategory(id: string | null) {
    categoryId = id;
    dropdownOpen = false;
    if (task && id !== task.category_id) {
      onUpdate(task.id, { category_id: id });
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.category-dropdown')) {
      dropdownOpen = false;
    }
  }

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

  const isOverdue = $derived.by(() => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseDateString(dueDate);
    return taskDueDate < today && !completed;
  });

  const isDueToday = $derived.by(() => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseDateString(dueDate);
    return taskDueDate.getTime() === today.getTime() && !completed;
  });

  function formatDisplayDate(dateStr: string): string {
    const date = parseDateString(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<svelte:window onclick={handleClickOutside} />

<Modal {open} title="Task Details" {onClose}>
  {#if task}
    <div
      class="task-details"
      use:remoteChangeAnimation={{ entityId: task.id, entityType: 'long_term_tasks' }}
      use:trackEditing={{ entityId: task.id, entityType: 'long_term_tasks', formType: 'auto-save' }}
    >
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
          <button class="field-value editable" onclick={() => (editingName = true)}>
            {name}
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
        {#if isOverdue}
          <span class="overdue-badge">Overdue</span>
        {:else if isDueToday}
          <span class="due-today-badge">Due Today</span>
        {/if}
      </div>

      <div class="field">
        <label class="field-label">Tag</label>
        <div class="category-dropdown">
          <button
            type="button"
            class="dropdown-trigger"
            onclick={() => (dropdownOpen = !dropdownOpen)}
          >
            {#if selectedCategory}
              <span class="selected-category">
                <span class="cat-dot" style="--cat-color: {selectedCategory.color}"></span>
                {selectedCategory.name}
              </span>
            {:else}
              <span class="no-tag">
                <span class="cat-dot none"></span>
                No tag
              </span>
            {/if}
            <svg
              class="chevron"
              class:open={dropdownOpen}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {#if dropdownOpen}
            <div class="dropdown-menu">
              <button
                type="button"
                class="dropdown-item"
                class:selected={categoryId === null}
                onclick={() => selectCategory(null)}
              >
                <span class="cat-dot none"></span>
                No tag
              </button>

              {#each categories as cat (cat.id)}
                <button
                  type="button"
                  class="dropdown-item"
                  class:selected={categoryId === cat.id}
                  onclick={() => selectCategory(cat.id)}
                >
                  <span class="cat-dot" style="--cat-color: {cat.color}"></span>
                  {cat.name}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="field">
        <label class="field-label">Status</label>
        <button class="status-toggle" class:completed onclick={handleToggle}>
          {#if completed}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Completed
          {:else}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
            </svg>
            Mark as Complete
          {/if}
        </button>
      </div>

      <div class="actions">
        <button class="delete-btn" onclick={handleDelete}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
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

  /* Custom Category Dropdown */
  .category-dropdown {
    position: relative;
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-out);
  }

  .dropdown-trigger:hover {
    border-color: rgba(108, 92, 231, 0.4);
  }

  .dropdown-trigger:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .selected-category,
  .no-tag {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .no-tag {
    color: var(--color-text-muted);
  }

  .chevron {
    transition: transform 0.2s var(--ease-out);
    color: var(--color-text-muted);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: rgba(15, 15, 28, 0.98);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 100;
    max-height: 250px;
    overflow-y: auto;
    animation: dropdownFadeIn 0.2s var(--ease-out);
  }

  @keyframes dropdownFadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: left;
  }

  .dropdown-item:hover {
    background: rgba(108, 92, 231, 0.15);
  }

  .dropdown-item.selected {
    background: rgba(108, 92, 231, 0.2);
    color: var(--color-primary-light);
  }

  .cat-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat-color);
    flex-shrink: 0;
  }

  .cat-dot.none {
    background: var(--color-text-muted);
    opacity: 0.3;
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
