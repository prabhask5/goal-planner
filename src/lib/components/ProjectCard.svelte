<script lang="ts">
  import type { ProjectWithDetails } from '$lib/types';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { remoteChangeAnimation } from '$lib/actions/remoteChange';

  interface Props {
    project: ProjectWithDetails;
    onNavigate: (goalListId: string) => void;
    onSetCurrent: (projectId: string) => void;
    onDelete: (projectId: string) => void;
  }

  let { project, onNavigate, onSetCurrent, onDelete }: Props = $props();

  const totalGoals = $derived(project.goalList?.totalGoals ?? 0);
  const completedGoals = $derived(project.goalList?.completedGoals ?? 0);
  const completionPercentage = $derived(project.goalList?.completionPercentage ?? 0);
  const tagColor = $derived(project.tag?.color ?? '#6c5ce7');
</script>

<div
  class="project-card"
  role="button"
  tabindex="0"
  onclick={() => project.goal_list_id && onNavigate(project.goal_list_id)}
  onkeypress={(e) => e.key === 'Enter' && project.goal_list_id && onNavigate(project.goal_list_id)}
  use:remoteChangeAnimation={{ entityId: project.id, entityType: 'projects' }}
>
  <div class="project-header">
    <div class="project-title">
      <span class="tag-dot" style="background-color: {tagColor}"></span>
      <h3 class="project-name">{project.name}</h3>
    </div>
    <div class="project-actions">
      <button
        class="star-btn"
        class:is-current={project.is_current}
        onclick={(e) => {
          e.stopPropagation();
          onSetCurrent(project.id);
        }}
        aria-label={project.is_current ? 'Current project' : 'Set as current project'}
        title={project.is_current ? 'Current project' : 'Set as current project'}
      >
        {project.is_current ? '★' : '☆'}
      </button>
      <button
        class="delete-btn"
        onclick={(e) => {
          e.stopPropagation();
          onDelete(project.id);
        }}
        aria-label="Delete project"
      >
        ×
      </button>
    </div>
  </div>
  <div class="project-stats">
    <span class="stat-text">
      {completedGoals} / {totalGoals} goals
    </span>
  </div>
  <ProgressBar percentage={completionPercentage} />
</div>

<style>
  .project-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.75rem;
    cursor: pointer;
    transition: all 0.4s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  /* Top glow line */
  .project-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.4),
      rgba(255, 255, 255, 0.2),
      rgba(108, 92, 231, 0.4),
      transparent
    );
  }

  /* Hover nebula effect */
  .project-card::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -30%;
    width: 150px;
    height: 200%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.15) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.4s;
    pointer-events: none;
  }

  .project-card:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-8px) scale(1.02);
    box-shadow:
      0 24px 50px rgba(0, 0, 0, 0.5),
      0 0 80px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .project-card:hover::after {
    opacity: 1;
  }

  .project-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.25rem;
    position: relative;
    z-index: 1;
  }

  .project-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .tag-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 8px currentColor;
  }

  .project-name {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .star-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
    color: var(--color-text);
  }

  .star-btn:hover {
    opacity: 1;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3) 0%, rgba(255, 215, 0, 0.1) 100%);
    border-color: rgba(255, 215, 0, 0.5);
    color: #ffd700;
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
  }

  .star-btn.is-current {
    opacity: 1;
    color: #ffd700;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.05) 100%);
    border-color: rgba(255, 215, 0, 0.3);
    box-shadow: 0 0 15px rgba(255, 215, 0, 0.2);
  }

  .delete-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    font-size: 1.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
  }

  .delete-btn:hover {
    opacity: 1;
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.3) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--color-red);
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  }

  .project-stats {
    margin-bottom: 1.25rem;
    position: relative;
    z-index: 1;
  }

  .stat-text {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    font-weight: 500;
    font-family: var(--font-mono);
  }

  /* Mobile responsive styles */
  @media (max-width: 640px) {
    .project-card {
      padding: 1.25rem;
      border-radius: var(--radius-xl);
    }

    .project-card:hover {
      transform: none;
    }

    .project-card:active {
      transform: scale(0.98);
      transition: transform 0.1s;
    }

    .project-name {
      font-size: 1.125rem;
    }

    .star-btn,
    .delete-btn {
      width: 44px;
      height: 44px;
      opacity: 0.5;
    }
  }

  /* iPhone 14/15/16 Pro Max specific (430px) */
  @media (min-width: 430px) and (max-width: 640px) {
    .project-card {
      padding: 1.5rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .project-card {
      padding: 1rem;
    }

    .project-name {
      font-size: 1rem;
    }
  }
</style>
