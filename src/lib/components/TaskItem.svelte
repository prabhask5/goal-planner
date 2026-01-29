<script lang="ts">
  import { remoteChangeAnimation, triggerLocalAnimation } from '$lib/actions/remoteChange';
  import type { DailyTask } from '$lib/types';

  interface Props {
    task: DailyTask;
    onToggle?: () => void;
    onDelete?: () => void;
    dragHandleProps?: { onpointerdown: (e: PointerEvent) => void };
  }

  let { task, onToggle, onDelete, dragHandleProps }: Props = $props();

  let element: HTMLElement;

  function handleToggle() {
    triggerLocalAnimation(element, 'toggle');
    onToggle?.();
  }
</script>

<div
  bind:this={element}
  class="task-item"
  class:completed={task.completed}
  use:remoteChangeAnimation={{ entityId: task.id, entityType: 'daily_tasks' }}
>
  {#if dragHandleProps}
    <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="9" cy="6" r="1.5" fill="currentColor" />
        <circle cx="15" cy="6" r="1.5" fill="currentColor" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
        <circle cx="9" cy="18" r="1.5" fill="currentColor" />
        <circle cx="15" cy="18" r="1.5" fill="currentColor" />
      </svg>
    </button>
  {/if}

  <button
    class="checkbox"
    class:checked={task.completed}
    onclick={handleToggle}
    aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
  >
    {#if task.completed}
      <span class="checkmark">✓</span>
    {/if}
  </button>

  <span class="task-name">{task.name}</span>

  {#if onDelete}
    <button class="delete-btn" onclick={onDelete} aria-label="Delete task">×</button>
  {/if}
</div>

<style>
  .task-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-left: 4px solid var(--color-red);
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .task-item.completed {
    border-left-color: var(--color-green);
    opacity: 0.7;
  }

  .task-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 30%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(108, 92, 231, 0.3) 70%,
      transparent 100%
    );
  }

  .task-item:hover {
    transform: translateX(4px);
    border-color: rgba(108, 92, 231, 0.3);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .drag-handle {
    cursor: grab;
    touch-action: none;
    padding: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    user-select: none;
    color: var(--color-text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    margin-left: -0.25rem;
  }

  .drag-handle:hover {
    opacity: 1;
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .checkbox {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-red);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
    cursor: pointer;
    background: transparent;
  }

  .checkbox.checked {
    border-color: var(--color-green);
    background: var(--color-green);
  }

  .checkbox:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px currentColor;
  }

  .checkmark {
    color: white;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .task-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 0.9375rem;
    transition: all 0.3s;
  }

  .task-item.completed .task-name {
    text-decoration: line-through;
    opacity: 0.6;
    font-style: italic;
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    opacity: 0;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .task-item:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    background: rgba(255, 107, 107, 0.2);
    border-color: rgba(255, 107, 107, 0.4);
    color: var(--color-red);
    transform: scale(1.1);
  }

  @media (max-width: 480px) {
    .task-item {
      padding: 0.625rem 0.75rem;
      gap: 0.625rem;
    }

    .checkbox {
      width: 16px !important;
      height: 16px !important;
    }

    .checkmark {
      font-size: 0.5rem !important;
    }

    .task-name {
      font-size: 0.875rem;
    }

    .delete-btn {
      opacity: 0.3;
    }

    .drag-handle {
      padding: 0.25rem;
    }
  }
</style>
