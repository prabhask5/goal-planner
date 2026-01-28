<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { TaskCategory, LongTermTaskWithCategory } from '$lib/types';
  import { parseDateString } from '$lib/utils/dates';
  import { remoteChangeAnimation } from '$lib/actions/remoteChange';

  // Available colors for categories (same as CategoryCreateModal)
  const CATEGORY_COLORS = [
    '#6c5ce7', // Purple (primary)
    '#a29bfe', // Light purple
    '#00d4ff', // Cyan
    '#26de81', // Green
    '#ffd93d', // Yellow
    '#ff6b6b', // Red
    '#fd79a8', // Pink
    '#fdcb6e', // Orange
    '#74b9ff', // Blue
    '#55efc4' // Teal
  ];

  interface Props {
    open: boolean;
    categories: TaskCategory[];
    tasks: LongTermTaskWithCategory[];
    onClose: () => void;
    onTaskClick: (task: LongTermTaskWithCategory) => void;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteCategory: (id: string) => void;
    onUpdateCategory: (id: string, updates: { name?: string; color?: string }) => void;
  }

  let {
    open,
    categories,
    tasks,
    onClose,
    onTaskClick,
    onToggle,
    onDelete,
    onDeleteCategory,
    onUpdateCategory
  }: Props = $props();

  // Editing state
  let editingCategoryId = $state<string | null>(null);
  let editingCategoryName = $state('');
  let showColorPicker = $state<string | null>(null);

  // Group incomplete tasks by category, sorted by date (soonest first)
  const tasksByCategory = $derived(() => {
    const incompleteTasks = tasks.filter((t) => !t.completed);
    const grouped = new Map<string | null, LongTermTaskWithCategory[]>();

    // Initialize with all categories (even empty ones)
    for (const cat of categories) {
      grouped.set(cat.id, []);
    }
    // Add null for uncategorized
    grouped.set(null, []);

    // Group tasks
    for (const task of incompleteTasks) {
      const categoryId = task.category_id ?? null;
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, []);
      }
      grouped.get(categoryId)!.push(task);
    }

    // Sort each group by due date (soonest first)
    for (const [, taskList] of grouped) {
      taskList.sort((a, b) => a.due_date.localeCompare(b.due_date));
    }

    return grouped;
  });

  // Get category by ID
  function getCategory(id: string | null): TaskCategory | undefined {
    if (!id) return undefined;
    return categories.find((c) => c.id === id);
  }

  function formatDate(dateStr: string): string {
    const date = parseDateString(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = parseDateString(dateStr);

    const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)}d overdue`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 7) {
      return `${diffDays}d`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function isOverdue(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parseDateString(dateStr) < today;
  }

  function isDueToday(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = parseDateString(dateStr);
    return taskDate.getTime() === today.getTime();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (editingCategoryId) {
        cancelEditName();
      } else if (showColorPicker) {
        showColorPicker = null;
      } else {
        onClose();
      }
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  // Start editing category name
  function startEditName(category: TaskCategory) {
    editingCategoryId = category.id;
    editingCategoryName = category.name;
    showColorPicker = null;
  }

  // Save category name
  function saveEditName() {
    if (editingCategoryId && editingCategoryName.trim()) {
      onUpdateCategory(editingCategoryId, { name: editingCategoryName.trim() });
    }
    cancelEditName();
  }

  // Cancel editing
  function cancelEditName() {
    editingCategoryId = null;
    editingCategoryName = '';
  }

  // Handle name input keydown
  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEditName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditName();
    }
  }

  // Toggle color picker
  function toggleColorPicker(categoryId: string) {
    if (showColorPicker === categoryId) {
      showColorPicker = null;
    } else {
      showColorPicker = categoryId;
      editingCategoryId = null; // Close name editing if open
    }
  }

  // Select color
  function selectColor(categoryId: string, color: string) {
    onUpdateCategory(categoryId, { color });
    showColorPicker = null;
  }

  // Confirm before deleting tag
  function handleDeleteTag(id: string, name: string, taskCount: number) {
    const message =
      taskCount > 0
        ? `Delete "${name}"? ${taskCount} task${taskCount === 1 ? '' : 's'} will become untagged.`
        : `Delete "${name}"?`;

    if (confirm(message)) {
      onDeleteCategory(id);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop"
    in:fade={{ duration: 0 }}
    out:fade={{ duration: 150 }}
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="modal" transition:scale={{ duration: 150, start: 0.95 }}>
      <div class="modal-header">
        <h2 id="modal-title">Task Tags</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">×</button>
      </div>
      <div class="modal-content">
        {#if categories.length === 0}
          <div class="empty-state">
            <div class="empty-icon">🏷️</div>
            <p class="empty-text">No tags created yet</p>
            <p class="empty-hint">Create tags when adding new tasks</p>
          </div>
        {:else}
          <div class="categories-list">
            {#each categories as category (category.id)}
              {@const categoryTasks = tasksByCategory().get(category.id) || []}
              <div
                class="category-section"
                use:remoteChangeAnimation={{ entityId: category.id, entityType: 'task_categories' }}
              >
                <div class="category-header">
                  <div class="category-info">
                    <!-- Color button with picker -->
                    <div class="color-picker-container">
                      <button
                        class="category-color"
                        style="background-color: {category.color}"
                        onclick={() => toggleColorPicker(category.id)}
                        aria-label="Change color"
                      ></button>
                      {#if showColorPicker === category.id}
                        <div class="color-picker" transition:scale={{ duration: 150, start: 0.9 }}>
                          {#each CATEGORY_COLORS as color}
                            <button
                              class="color-option"
                              class:selected={category.color === color}
                              style="background-color: {color}"
                              onclick={() => selectColor(category.id, color)}
                              aria-label="Select {color}"
                            ></button>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <!-- Editable name -->
                    {#if editingCategoryId === category.id}
                      <input
                        type="text"
                        class="category-name-input"
                        bind:value={editingCategoryName}
                        onkeydown={handleNameKeydown}
                        onblur={saveEditName}
                        autofocus
                      />
                    {:else}
                      <button class="category-name" onclick={() => startEditName(category)}>
                        {category.name}
                      </button>
                    {/if}

                    <span class="task-count">{categoryTasks.length}</span>
                  </div>
                  <button
                    class="delete-tag-btn"
                    onclick={() =>
                      handleDeleteTag(category.id, category.name, categoryTasks.length)}
                    aria-label="Delete tag"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {#if categoryTasks.length > 0}
                  <div class="tasks-list">
                    {#each categoryTasks as task (task.id)}
                      <div
                        class="task-row"
                        class:overdue={isOverdue(task.due_date)}
                        class:due-today={isDueToday(task.due_date)}
                        use:remoteChangeAnimation={{
                          entityId: task.id,
                          entityType: 'long_term_tasks'
                        }}
                      >
                        <button
                          class="checkbox"
                          onclick={() => onToggle(task.id)}
                          aria-label="Mark complete"
                        ></button>

                        <button class="task-info" onclick={() => onTaskClick(task)}>
                          <span class="task-name">{task.name}</span>
                          <span
                            class="due-date"
                            class:overdue={isOverdue(task.due_date)}
                            class:due-today={isDueToday(task.due_date)}
                          >
                            {formatDate(task.due_date)}
                          </span>
                        </button>

                        <button
                          class="delete-btn"
                          onclick={() => onDelete(task.id)}
                          aria-label="Delete task"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="no-tasks">No incomplete tasks</div>
                {/if}
              </div>
            {/each}

            <!-- Untagged tasks -->
            {#if (tasksByCategory().get(null) || []).length > 0}
              {@const untaggedTasks = tasksByCategory().get(null) || []}
              <div class="category-section untagged">
                <div class="category-header">
                  <div class="category-info">
                    <span
                      class="category-color-static"
                      style="background-color: rgba(108, 92, 231, 0.5)"
                    ></span>
                    <span class="category-name-static">Untagged</span>
                    <span class="task-count">{untaggedTasks.length}</span>
                  </div>
                </div>

                <div class="tasks-list">
                  {#each untaggedTasks as task (task.id)}
                    <div
                      class="task-row"
                      class:overdue={isOverdue(task.due_date)}
                      class:due-today={isDueToday(task.due_date)}
                      use:remoteChangeAnimation={{
                        entityId: task.id,
                        entityType: 'long_term_tasks'
                      }}
                    >
                      <button
                        class="checkbox"
                        onclick={() => onToggle(task.id)}
                        aria-label="Mark complete"
                      ></button>

                      <button class="task-info" onclick={() => onTaskClick(task)}>
                        <span class="task-name">{task.name}</span>
                        <span
                          class="due-date"
                          class:overdue={isOverdue(task.due_date)}
                          class:due-today={isDueToday(task.due_date)}
                        >
                          {formatDate(task.due_date)}
                        </span>
                      </button>

                      <button
                        class="delete-btn"
                        onclick={() => onDelete(task.id)}
                        aria-label="Delete task"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 100% 100% at 50% 0%, rgba(108, 92, 231, 0.1) 0%, transparent 50%),
      radial-gradient(ellipse at center, rgba(5, 5, 16, 0.9) 0%, rgba(0, 0, 0, 0.98) 100%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: calc(64px + 1.5rem) 1.5rem 1.5rem 1.5rem;
    z-index: 1000;
    overflow-y: auto;
  }

  .modal {
    background: linear-gradient(
      165deg,
      rgba(20, 20, 40, 0.98) 0%,
      rgba(15, 15, 30, 0.95) 50%,
      rgba(20, 20, 40, 0.98) 100%
    );
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-2xl);
    width: 100%;
    max-width: 550px;
    max-height: calc(100vh - 64px - 3rem);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 30px 60px -15px rgba(0, 0, 0, 0.6),
      0 0 100px rgba(108, 92, 231, 0.2);
    position: relative;
    animation: modalAppear 0.4s var(--ease-spring);
    margin-bottom: 1.5rem;
    flex-shrink: 0;
  }

  @keyframes modalAppear {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.6),
      rgba(255, 255, 255, 0.4),
      rgba(108, 92, 231, 0.6),
      transparent
    );
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.75rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
    background: linear-gradient(180deg, rgba(108, 92, 231, 0.1) 0%, rgba(108, 92, 231, 0.02) 100%);
  }

  .modal-header h2 {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .close-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    color: var(--color-text-muted);
    border: 1px solid transparent;
    background: rgba(108, 92, 231, 0.05);
  }

  .close-btn:hover {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.25) 0%,
      rgba(255, 107, 107, 0.1) 100%
    );
    border-color: rgba(255, 107, 107, 0.4);
    color: var(--color-red);
    transform: rotate(90deg) scale(1.1);
  }

  .modal-content {
    padding: 1rem 1.75rem 1.75rem;
    overflow-y: auto;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.7;
  }

  .empty-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 0.5rem;
  }

  .empty-hint {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  /* Categories list */
  .categories-list {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .category-section {
    border-radius: var(--radius-lg);
    /* Note: no overflow:hidden here to allow color picker dropdown to be visible */
  }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(20, 20, 40, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
  }

  .category-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  /* Color picker container */
  .color-picker-container {
    position: relative;
  }

  .category-color {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
  }

  .category-color:hover {
    transform: scale(1.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .category-color-static {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  /* Color picker dropdown */
  .color-picker {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    padding: 10px;
    background: rgba(20, 20, 40, 0.98);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 10;
  }

  .color-option {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
  }

  .color-option:hover {
    transform: scale(1.15);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .color-option.selected {
    border-color: white;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
  }

  /* Editable category name */
  .category-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-name:hover {
    background: rgba(108, 92, 231, 0.15);
  }

  .category-name-static {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
  }

  .category-name-input {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.1);
    border: 1px solid rgba(108, 92, 231, 0.4);
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
    border-radius: var(--radius-sm);
    width: 100%;
    max-width: 200px;
  }

  .category-name-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-glow);
  }

  .task-count {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    background: rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-full);
    color: var(--color-primary-light);
    flex-shrink: 0;
  }

  .delete-tag-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.3;
    transition: all 0.3s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .category-header:hover .delete-tag-btn {
    opacity: 0.6;
  }

  .delete-tag-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  /* Tasks list */
  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding-left: 0.5rem;
  }

  .task-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-md);
    transition: all 0.2s var(--ease-out);
  }

  .task-row:hover {
    background: rgba(20, 20, 40, 0.8);
    border-color: rgba(108, 92, 231, 0.2);
    transform: translateX(4px);
  }

  .task-row.overdue {
    border-left: 2px solid var(--color-red);
  }

  .task-row.due-today {
    border-left: 2px solid var(--color-yellow);
  }

  .checkbox {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(108, 92, 231, 0.4);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    background: transparent;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .checkbox:hover {
    border-color: var(--color-green);
    transform: scale(1.1);
  }

  .task-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .task-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .due-date {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .due-date.overdue {
    color: var(--color-red);
  }

  .due-date.due-today {
    color: var(--color-yellow);
  }

  .delete-btn {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.2s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .task-row:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  .no-tasks {
    padding: 0.75rem 1rem;
    margin-top: 0.5rem;
    margin-left: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    font-style: italic;
    background: rgba(15, 15, 30, 0.4);
    border-radius: var(--radius-md);
    border: 1px dashed rgba(108, 92, 231, 0.1);
  }

  /* Uncategorized section */
  .category-section.untagged .category-header {
    background: rgba(30, 30, 50, 0.4);
    border-style: dashed;
  }

  /* Tablet breakpoint */
  @media (min-width: 641px) and (max-width: 900px) {
    .modal-backdrop {
      padding: calc(64px + 1rem) 1rem 1rem 1rem;
    }

    .modal {
      max-height: calc(100vh - 64px - 2rem);
    }
  }

  /* Mobile */
  @media (max-width: 640px) {
    .modal-backdrop {
      padding: calc(env(safe-area-inset-top, 20px) + 1rem) 1rem
        calc(80px + env(safe-area-inset-bottom, 0) + 1rem) 1rem;
      align-items: center;
    }

    .modal {
      max-width: 100%;
      max-height: calc(
        100vh - env(safe-area-inset-top, 20px) - 80px - env(safe-area-inset-bottom, 0) - 2rem
      );
      border-radius: var(--radius-xl);
      margin-bottom: 0;
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
    }

    .modal-content {
      padding: 1rem 1.25rem 1.5rem;
    }

    .delete-btn {
      opacity: 0.3;
    }

    .delete-tag-btn {
      opacity: 0.5;
    }

    .color-picker {
      left: 50%;
      transform: translateX(-50%);
    }
  }

  /* Very short viewports (landscape tablets, etc.) */
  @media (max-height: 600px) and (min-width: 641px) {
    .modal-backdrop {
      padding-top: calc(64px + 0.75rem);
      padding-bottom: 0.75rem;
    }

    .modal {
      max-height: calc(100vh - 64px - 1.5rem);
    }

    .modal-header {
      padding: 1rem 1.5rem;
    }

    .modal-content {
      padding: 1rem 1.5rem;
    }
  }
</style>
