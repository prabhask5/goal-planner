<script lang="ts">
  import Modal from './Modal.svelte';
  import type { TaskCategory } from '$lib/types';

  interface Props {
    open: boolean;
    categories: TaskCategory[];
    defaultDate?: string;
    // Allow restoring form state when coming back from category creation
    initialName?: string;
    initialCategoryId?: string | null;
    onClose: () => void;
    onCreate: (name: string, dueDate: string, categoryId: string | null) => void;
    onDeleteCategory: (id: string) => void;
    onRequestCreateCategory: (formState: { name: string; dueDate: string; categoryId: string | null }) => void;
  }

  let {
    open,
    categories,
    defaultDate,
    initialName = '',
    initialCategoryId = null,
    onClose,
    onCreate,
    onDeleteCategory,
    onRequestCreateCategory
  }: Props = $props();

  // Form state
  let name = $state('');
  let dueDate = $state('');
  let categoryId = $state<string | null>(null);

  // Dropdown state
  let dropdownOpen = $state(false);

  $effect(() => {
    if (open) {
      // Restore state if provided, otherwise reset
      name = initialName || '';
      dueDate = defaultDate || getTodayString();
      categoryId = initialCategoryId;
      dropdownOpen = false;
    }
  });

  function getTodayString(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;
    onCreate(name.trim(), dueDate, categoryId);
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (dropdownOpen) {
        dropdownOpen = false;
      } else {
        onClose();
      }
    }
  }

  function selectCategory(id: string | null) {
    categoryId = id;
    dropdownOpen = false;
  }

  function handleDeleteCategory(e: Event, id: string) {
    e.stopPropagation();
    if (confirm('Delete this category? Tasks will keep their data but lose the category tag.')) {
      onDeleteCategory(id);
      if (categoryId === id) {
        categoryId = null;
      }
    }
  }

  function handleAddCategoryClick() {
    dropdownOpen = false;
    // Pass current form state so it can be restored
    onRequestCreateCategory({ name, dueDate, categoryId });
  }

  // Get selected category
  const selectedCategory = $derived(categories.find(c => c.id === categoryId));

  // Close dropdown when clicking outside
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.category-dropdown')) {
      dropdownOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<Modal {open} title="New Long-term Task" {onClose}>
  <form class="form" onsubmit={handleSubmit}>
    <div class="field">
      <label class="field-label" for="task-name">Task Name</label>
      <input
        id="task-name"
        type="text"
        bind:value={name}
        class="field-input"
        placeholder="What needs to be done?"
        autofocus
      />
    </div>

    <div class="field">
      <label class="field-label" for="due-date">Due Date</label>
      <input
        id="due-date"
        type="date"
        bind:value={dueDate}
        class="field-input date-input"
        min={getTodayString()}
      />
    </div>

    <div class="field">
      <label class="field-label">Category (optional)</label>

      <!-- Custom Dropdown -->
      <div class="category-dropdown">
        <button
          type="button"
          class="dropdown-trigger"
          onclick={() => dropdownOpen = !dropdownOpen}
        >
          {#if selectedCategory}
            <span class="selected-category">
              <span class="cat-dot" style="--cat-color: {selectedCategory.color}"></span>
              {selectedCategory.name}
            </span>
          {:else}
            <span class="placeholder">Select a category...</span>
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
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {#if dropdownOpen}
          <div class="dropdown-menu">
            <!-- No category option -->
            <button
              type="button"
              class="dropdown-item"
              class:selected={categoryId === null}
              onclick={() => selectCategory(null)}
            >
              <span class="item-content">
                <span class="cat-dot none"></span>
                No category
              </span>
            </button>

            <!-- Category options -->
            {#each categories as cat (cat.id)}
              <div class="dropdown-item-wrapper">
                <button
                  type="button"
                  class="dropdown-item"
                  class:selected={categoryId === cat.id}
                  onclick={() => selectCategory(cat.id)}
                >
                  <span class="item-content">
                    <span class="cat-dot" style="--cat-color: {cat.color}"></span>
                    {cat.name}
                  </span>
                </button>
                <button
                  type="button"
                  class="delete-btn"
                  onclick={(e) => handleDeleteCategory(e, cat.id)}
                  aria-label="Delete category"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            {/each}

            <!-- Divider -->
            <div class="dropdown-divider"></div>

            <!-- Add Category Button -->
            <button
              type="button"
              class="dropdown-item add-category-btn"
              onclick={handleAddCategoryClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Category
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div class="actions">
      <button type="button" class="cancel-btn" onclick={onClose}>
        Cancel
      </button>
      <button type="submit" class="submit-btn" disabled={!name.trim() || !dueDate}>
        Create Task
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

  .date-input {
    color-scheme: dark;
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
    padding: 0.875rem 1rem;
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

  .placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .selected-category {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
    max-height: 300px;
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

  .dropdown-item-wrapper {
    display: flex;
    align-items: center;
  }

  .dropdown-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: left;
    width: 100%;
  }

  .dropdown-item:hover {
    background: rgba(108, 92, 231, 0.15);
  }

  .dropdown-item.selected {
    background: rgba(108, 92, 231, 0.2);
    color: var(--color-primary-light);
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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

  .delete-btn {
    padding: 0.5rem;
    margin-right: 0.5rem;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s var(--ease-out);
    border-radius: var(--radius-sm);
  }

  .dropdown-item-wrapper:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.15);
  }

  .dropdown-divider {
    height: 1px;
    background: rgba(108, 92, 231, 0.15);
    margin: 0.25rem 0;
  }

  .add-category-btn {
    color: var(--color-primary-light) !important;
    gap: 0.5rem;
  }

  .add-category-btn:hover {
    background: rgba(108, 92, 231, 0.2) !important;
  }

  /* Form Actions */
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
