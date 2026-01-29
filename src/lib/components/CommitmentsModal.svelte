<script lang="ts">
  import Modal from './Modal.svelte';
  import { remoteChangeAnimation } from '$lib/actions/remoteChange';
  import type { Commitment, CommitmentSection } from '$lib/types';

  interface Props {
    open: boolean;
    commitments: Commitment[];
    onClose: () => void;
    onCreate: (name: string, section: CommitmentSection) => void;
    onUpdate: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onReorder: (id: string, newOrder: number) => void;
  }

  let { open, commitments, onClose, onCreate, onUpdate, onDelete, onReorder }: Props = $props();

  // Focus action for accessibility
  function focus(node: HTMLElement) {
    node.focus();
  }

  const sections: { key: CommitmentSection; label: string }[] = [
    { key: 'career', label: 'CAREER' },
    { key: 'personal', label: 'PERSONAL' },
    { key: 'projects', label: 'PROJECTS' }
  ];

  // Check if a commitment is project-owned (cannot be edited/deleted independently)
  function isProjectOwned(commitment: Commitment): boolean {
    return !!commitment.project_id;
  }

  let addingTo = $state<CommitmentSection | null>(null);
  let newName = $state('');
  let editingId = $state<string | null>(null);
  let editingName = $state('');

  // Drag state
  let draggedId = $state<string | null>(null);
  let draggedSection = $state<CommitmentSection | null>(null);
  let dropTargetId = $state<string | null>(null);

  function getCommitmentsForSection(section: CommitmentSection): Commitment[] {
    return commitments.filter((c) => c.section === section).sort((a, b) => a.order - b.order);
  }

  function handleAddClick(section: CommitmentSection) {
    addingTo = section;
    newName = '';
  }

  function handleAddSubmit(section: CommitmentSection) {
    if (!newName.trim()) return;
    onCreate(newName.trim(), section);
    addingTo = null;
    newName = '';
  }

  function handleAddKeydown(e: KeyboardEvent, section: CommitmentSection) {
    if (e.key === 'Enter') {
      handleAddSubmit(section);
    } else if (e.key === 'Escape') {
      addingTo = null;
      newName = '';
    }
  }

  function startEditing(commitment: Commitment) {
    editingId = commitment.id;
    editingName = commitment.name;
  }

  function handleEditSubmit() {
    if (editingId && editingName.trim()) {
      onUpdate(editingId, editingName.trim());
    }
    editingId = null;
    editingName = '';
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      editingId = null;
      editingName = '';
    }
  }

  function handleDragStart(e: DragEvent, commitment: Commitment) {
    draggedId = commitment.id;
    draggedSection = commitment.section;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent, targetId: string) {
    e.preventDefault();
    dropTargetId = targetId;
  }

  function handleDragEnd() {
    if (draggedId && dropTargetId && draggedId !== dropTargetId) {
      const sectionItems = getCommitmentsForSection(draggedSection!);
      const draggedIndex = sectionItems.findIndex((c) => c.id === draggedId);
      const targetIndex = sectionItems.findIndex((c) => c.id === dropTargetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Calculate new order between target's neighbors
        let newOrder: number;
        if (targetIndex === 0) {
          newOrder = sectionItems[0].order - 1;
        } else if (targetIndex === sectionItems.length - 1) {
          newOrder = sectionItems[targetIndex].order + 1;
        } else {
          const before = sectionItems[targetIndex - 1].order;
          const after = sectionItems[targetIndex].order;
          newOrder = (before + after) / 2;
        }

        onReorder(draggedId, newOrder);
      }
    }

    draggedId = null;
    draggedSection = null;
    dropTargetId = null;
  }
</script>

<Modal {open} title="Commitments" {onClose}>
  <div class="commitments-content">
    {#each sections as section}
      <div class="section" class:projects-section={section.key === 'projects'}>
        <div class="section-header">
          <h3 class="section-title">{section.label}</h3>
          {#if section.key !== 'projects'}
            <button
              class="add-section-btn"
              onclick={() => handleAddClick(section.key)}
              aria-label="Add commitment"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          {:else}
            <span class="section-hint">via Plans</span>
          {/if}
        </div>

        {#if addingTo === section.key}
          <div class="add-form">
            <input
              type="text"
              bind:value={newName}
              placeholder="New commitment..."
              class="add-input"
              onkeydown={(e) => handleAddKeydown(e, section.key)}
              use:focus
            />
            <button
              class="confirm-btn"
              onclick={() => handleAddSubmit(section.key)}
              disabled={!newName.trim()}
              aria-label="Confirm"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button
              class="cancel-btn"
              onclick={() => {
                addingTo = null;
                newName = '';
              }}
              aria-label="Cancel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        {/if}

        <div class="items-list">
          {#each getCommitmentsForSection(section.key) as commitment (commitment.id)}
            <div
              class="commitment-item"
              class:dragging={draggedId === commitment.id}
              class:drop-target={dropTargetId === commitment.id && draggedId !== commitment.id}
              class:project-owned={isProjectOwned(commitment)}
              draggable={!isProjectOwned(commitment)}
              ondragstart={(e) => !isProjectOwned(commitment) && handleDragStart(e, commitment)}
              ondragover={(e) => handleDragOver(e, commitment.id)}
              ondragend={handleDragEnd}
              use:remoteChangeAnimation={{ entityId: commitment.id, entityType: 'commitments' }}
            >
              {#if !isProjectOwned(commitment)}
                <span class="drag-handle-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                </span>
              {:else}
                <span class="project-icon" title="Managed by project">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </span>
              {/if}

              {#if editingId === commitment.id && !isProjectOwned(commitment)}
                <input
                  type="text"
                  bind:value={editingName}
                  class="edit-input"
                  onkeydown={handleEditKeydown}
                  onblur={handleEditSubmit}
                  use:focus
                />
              {:else}
                <span
                  class="commitment-name"
                  ondblclick={() => !isProjectOwned(commitment) && startEditing(commitment)}
                >
                  {commitment.name}
                </span>
              {/if}

              {#if !isProjectOwned(commitment)}
                <button
                  class="delete-btn"
                  onclick={() => onDelete(commitment.id)}
                  aria-label="Delete commitment"
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
              {/if}
            </div>
          {:else}
            <div class="empty-section">
              {#if section.key === 'projects'}
                No projects yet
              {:else}
                No commitments yet
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</Modal>

<style>
  .commitments-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .section-hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    opacity: 0.6;
    font-style: italic;
  }

  .projects-section {
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.1);
  }

  .add-section-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.25);
    color: var(--color-primary-light);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .add-section-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    transform: scale(1.1);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem;
    background: rgba(15, 15, 30, 0.6);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .add-input,
  .edit-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: rgba(10, 10, 20, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.875rem;
  }

  .add-input:focus,
  .edit-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  .confirm-btn,
  .cancel-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    border: none;
  }

  .confirm-btn {
    background: var(--color-green);
    color: white;
  }

  .confirm-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .confirm-btn:not(:disabled):hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(38, 222, 129, 0.4);
  }

  .cancel-btn {
    background: rgba(255, 107, 107, 0.2);
    color: var(--color-red);
  }

  .cancel-btn:hover {
    background: rgba(255, 107, 107, 0.3);
    transform: scale(1.1);
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .commitment-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-out);
    cursor: grab;
  }

  .commitment-item:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(20, 20, 40, 0.9);
  }

  .commitment-item.dragging {
    opacity: 0.6;
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .commitment-item.drop-target {
    border-color: var(--color-primary);
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  .drag-handle-icon {
    opacity: 0.3;
    transition: opacity 0.2s;
    color: var(--color-text-muted);
  }

  .commitment-item:hover .drag-handle-icon {
    opacity: 0.7;
  }

  .commitment-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
    cursor: text;
  }

  .edit-input {
    flex: 1;
    min-width: 0;
  }

  .delete-btn {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.3s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .commitment-item:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  .empty-section {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-style: italic;
    opacity: 0.6;
  }

  .commitment-item.project-owned {
    cursor: default;
    border-color: rgba(255, 215, 0, 0.15);
    background: rgba(255, 215, 0, 0.03);
  }

  .commitment-item.project-owned:hover {
    border-color: rgba(255, 215, 0, 0.25);
    background: rgba(255, 215, 0, 0.05);
  }

  .project-icon {
    color: #ffd700;
    opacity: 0.7;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
