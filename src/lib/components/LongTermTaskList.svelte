<script lang="ts">
  import { remoteChangeAnimation, triggerLocalAnimation } from '$lib/actions/remoteChange';
  import type { LongTermTaskWithCategory } from '$lib/types';

  interface Props {
    title: string;
    tasks: LongTermTaskWithCategory[];
    variant?: 'overdue' | 'due-today' | 'upcoming' | 'completed';
    onTaskClick: (task: LongTermTaskWithCategory) => void;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
  }

  let { title, tasks, variant = 'upcoming', onTaskClick, onToggle, onDelete }: Props = $props();

  // Track element references by task id
  let taskElements: Record<string, HTMLElement> = {};

  function registerElement(node: HTMLElement, id: string) {
    taskElements[id] = node;
    return {
      destroy() {
        delete taskElements[id];
      }
    };
  }

  function handleToggle(taskId: string) {
    const element = taskElements[taskId];
    if (element) {
      triggerLocalAnimation(element, 'toggle');
    }
    onToggle(taskId);
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

{#if tasks.length > 0}
  <div
    class="task-list"
    class:overdue={variant === 'overdue'}
    class:due-today={variant === 'due-today'}
    class:completed={variant === 'completed'}
  >
    <h3 class="list-title">{title}</h3>
    <div class="items">
      {#each tasks as task (task.id)}
        <div
          class="task-row"
          use:registerElement={task.id}
          use:remoteChangeAnimation={{ entityId: task.id, entityType: 'long_term_tasks' }}
        >
          <button
            class="checkbox"
            class:checked={task.completed}
            onclick={() => handleToggle(task.id)}
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {#if task.completed}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {/if}
          </button>

          <button class="task-info" onclick={() => onTaskClick(task)}>
            <span class="task-name" class:completed={task.completed}>{task.name}</span>
            <span class="task-meta">
              <span class="due-date">{formatDate(task.due_date)}</span>
              {#if task.category}
                <span class="category-tag" style="--tag-color: {task.category.color}">
                  {task.category.name}
                </span>
              {/if}
            </span>
          </button>

          <button class="delete-btn" onclick={() => onDelete(task.id)} aria-label="Delete task">
            <svg
              width="16"
              height="16"
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

<style>
  .task-list {
    margin-top: 1.5rem;
  }

  .list-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  .task-list.overdue .list-title {
    color: var(--color-red);
  }

  .task-list.due-today .list-title {
    color: var(--color-yellow);
  }

  .task-list.completed .list-title {
    color: var(--color-green);
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-out);
  }

  .task-list.overdue .task-row {
    border-left: 3px solid var(--color-red);
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.05) 0%, rgba(20, 20, 40, 0.9) 100%);
  }

  .task-list.due-today .task-row {
    border-left: 3px solid var(--color-yellow);
    background: linear-gradient(135deg, rgba(255, 217, 61, 0.08) 0%, rgba(20, 20, 40, 0.9) 100%);
  }

  .task-list.completed .task-row {
    border-left: 3px solid var(--color-green);
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.05) 0%, rgba(20, 20, 40, 0.9) 100%);
    opacity: 0.7;
  }

  .task-list.completed .task-row:hover {
    opacity: 1;
  }

  .task-row:hover {
    border-color: rgba(108, 92, 231, 0.3);
    transform: translateX(4px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .checkbox {
    width: 22px;
    height: 22px;
    border: 2px solid rgba(108, 92, 231, 0.4);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    color: white;
  }

  .checkbox:hover {
    border-color: var(--color-primary);
    transform: scale(1.1);
  }

  .checkbox.checked {
    background: var(--color-green);
    border-color: var(--color-green);
  }

  .task-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .task-name {
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: all 0.3s;
  }

  .task-name.completed {
    text-decoration: line-through;
    opacity: 0.5;
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .due-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .task-list.overdue .due-date {
    color: var(--color-red);
  }

  .task-list.due-today .due-date {
    color: var(--color-yellow);
  }

  .category-tag {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--tag-color);
    color: white;
    white-space: nowrap;
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.3s var(--ease-spring);
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

  @media (max-width: 480px) {
    .task-row {
      padding: 0.625rem 0.75rem;
    }

    .delete-btn {
      opacity: 0.3;
    }
  }
</style>
