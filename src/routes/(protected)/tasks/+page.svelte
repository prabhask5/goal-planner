<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    taskCategoriesStore,
    commitmentsStore,
    dailyTasksStore,
    longTermTasksStore
  } from '$lib/stores/data';
  import type { TaskCategory, Commitment, DailyTask, LongTermTaskWithCategory, CommitmentSection } from '$lib/types';
  import { formatDate } from '$lib/utils/dates';
  import { calculateNewOrder } from '$lib/utils/reorder';

  import TaskItem from '$lib/components/TaskItem.svelte';
  import DailyTaskForm from '$lib/components/DailyTaskForm.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import CommitmentsModal from '$lib/components/CommitmentsModal.svelte';
  import LongTermTaskCalendar from '$lib/components/LongTermTaskCalendar.svelte';
  import LongTermTaskList from '$lib/components/LongTermTaskList.svelte';
  import LongTermTaskModal from '$lib/components/LongTermTaskModal.svelte';
  import LongTermTaskForm from '$lib/components/LongTermTaskForm.svelte';
  import CategoryCreateModal from '$lib/components/CategoryCreateModal.svelte';
  import TaskTagsModal from '$lib/components/TaskTagsModal.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  // State
  let categories = $state<TaskCategory[]>([]);
  let commitments = $state<Commitment[]>([]);
  let dailyTasks = $state<DailyTask[]>([]);
  let longTermTasks = $state<LongTermTaskWithCategory[]>([]);

  let categoriesLoading = $state(true);
  let commitmentsLoading = $state(true);
  let dailyTasksLoading = $state(true);
  let longTermTasksLoading = $state(true);

  // Modal state
  let showCommitmentsModal = $state(false);
  let showTaskForm = $state(false);
  let showTaskModal = $state(false);
  let showCategoryCreate = $state(false);
  let showTagsModal = $state(false);
  let selectedTask = $state<LongTermTaskWithCategory | null>(null);
  let defaultTaskDate = $state<string | undefined>(undefined);

  // Saved task form state (for when switching to category creation)
  let savedTaskFormState = $state<{ name: string; dueDate: string; categoryId: string | null } | null>(null);

  // Keep backdrop visible during modal transitions
  let modalTransitioning = $state(false);

  // Calendar state
  let currentDate = $state(new Date());

  // Subscribe to stores
  $effect(() => {
    const unsubs = [
      taskCategoriesStore.subscribe(v => categories = v),
      taskCategoriesStore.loading.subscribe(v => categoriesLoading = v),
      commitmentsStore.subscribe(v => commitments = v),
      commitmentsStore.loading.subscribe(v => commitmentsLoading = v),
      dailyTasksStore.subscribe(v => dailyTasks = v),
      dailyTasksStore.loading.subscribe(v => dailyTasksLoading = v),
      longTermTasksStore.subscribe(v => longTermTasks = v),
      longTermTasksStore.loading.subscribe(v => longTermTasksLoading = v)
    ];

    return () => unsubs.forEach(u => u());
  });

  onMount(async () => {
    await Promise.all([
      taskCategoriesStore.load(),
      commitmentsStore.load(),
      dailyTasksStore.load(),
      longTermTasksStore.load()
    ]);
  });

  // Derived data for long-term tasks
  const today = $derived(formatDate(new Date()));

  const overdueTasks = $derived(
    longTermTasks
      .filter(t => t.due_date < today && !t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  const dueTodayTasks = $derived(
    longTermTasks
      .filter(t => t.due_date === today && !t.completed)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const upcomingTasks = $derived(
    longTermTasks
      .filter(t => t.due_date > today && !t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  const completedTasks = $derived(
    longTermTasks
      .filter(t => t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date)) // Earliest to latest
  );

  // Helper to get user ID
  function getUserId(): string {
    const session = $page.data.session;
    return session?.user?.id ?? '';
  }

  // Daily task handlers
  async function handleCreateDailyTask(name: string) {
    const userId = getUserId();
    if (!userId) return;
    await dailyTasksStore.create(name, userId);
  }

  async function handleToggleDailyTask(id: string) {
    await dailyTasksStore.toggle(id);
  }

  async function handleDeleteDailyTask(id: string) {
    await dailyTasksStore.delete(id);
  }

  async function handleReorderDailyTask(id: string, newOrder: number) {
    await dailyTasksStore.reorder(id, newOrder);
  }

  // Commitment handlers
  async function handleCreateCommitment(name: string, section: CommitmentSection) {
    const userId = getUserId();
    if (!userId) return;
    await commitmentsStore.create(name, section, userId);
  }

  async function handleUpdateCommitment(id: string, name: string) {
    await commitmentsStore.update(id, { name });
  }

  async function handleDeleteCommitment(id: string) {
    await commitmentsStore.delete(id);
  }

  async function handleReorderCommitment(id: string, newOrder: number) {
    await commitmentsStore.reorder(id, newOrder);
  }

  // Category handlers
  async function handleCreateCategory(name: string, color: string) {
    const userId = getUserId();
    if (!userId) return;
    await taskCategoriesStore.create(name, color, userId);
  }

  async function handleDeleteCategory(id: string) {
    await taskCategoriesStore.delete(id);
  }

  // Modal swapping for category creation
  // Simple approach: open new modal BEFORE closing old one, so backdrops overlap
  function handleRequestCreateCategory(formState: { name: string; dueDate: string; categoryId: string | null }) {
    savedTaskFormState = formState;
    // Open category modal first (its backdrop appears)
    showCategoryCreate = true;
    // Then close task form (backdrop fades out behind the new one)
    requestAnimationFrame(() => {
      showTaskForm = false;
    });
  }

  function handleCategoryCreateClose() {
    // Open task form first (its backdrop appears)
    showTaskForm = true;
    // Then close category modal (backdrop fades out behind the new one)
    requestAnimationFrame(() => {
      showCategoryCreate = false;
    });
  }

  async function handleCategoryCreateSubmit(name: string, color: string) {
    await handleCreateCategory(name, color);
    // Close category modal and return to task form
    handleCategoryCreateClose();
  }

  // Long-term task handlers
  async function handleCreateLongTermTask(name: string, dueDate: string, categoryId: string | null) {
    const userId = getUserId();
    if (!userId) return;
    await longTermTasksStore.create(name, dueDate, categoryId, userId);
  }

  async function handleUpdateLongTermTask(id: string, updates: { name?: string; due_date?: string; category_id?: string | null }) {
    await longTermTasksStore.update(id, updates);
  }

  async function handleToggleLongTermTask(id: string) {
    await longTermTasksStore.toggle(id);
  }

  async function handleDeleteLongTermTask(id: string) {
    await longTermTasksStore.delete(id);
  }

  // Calendar handlers
  function handleDayClick(date: Date) {
    defaultTaskDate = formatDate(date);
    showTaskForm = true;
  }

  function handleTaskClick(task: LongTermTaskWithCategory) {
    selectedTask = task;
    showTaskModal = true;
  }

  function handleMonthChange(date: Date) {
    currentDate = date;
  }
</script>

<svelte:head>
  <title>Tasks - Stellar</title>
</svelte:head>

<div class="container">
  <!-- TODAY'S TASKS Section -->
  <section class="section">
    <header class="section-header">
      <h2 class="section-title">Today's Tasks</h2>
      <div class="section-actions">
        <button class="btn btn-secondary btn-sm" onclick={() => showCommitmentsModal = true}>
          Commitments
        </button>
      </div>
    </header>

    <div class="daily-tasks-section">
      <DailyTaskForm onSubmit={handleCreateDailyTask} />

      {#if dailyTasksLoading}
        <!-- Daily Tasks Skeleton -->
        <div class="tasks-skeleton">
          {#each Array(3) as _, i}
            <div class="task-skeleton-item" style="--delay: {i * 0.1}s">
              <div class="task-skeleton-handle"></div>
              <div class="task-skeleton-checkbox"></div>
              <div class="task-skeleton-title"></div>
              <div class="task-skeleton-delete"></div>
              <div class="skeleton-shimmer"></div>
            </div>
          {/each}
        </div>
      {:else if dailyTasks.length === 0}
        <div class="empty-inline">
          No tasks yet. Add one above.
        </div>
      {:else}
        <DraggableList
          items={dailyTasks}
          onReorder={handleReorderDailyTask}
        >
          {#snippet renderItem({ item, dragHandleProps })}
            <TaskItem
              task={item}
              {dragHandleProps}
              onToggle={() => handleToggleDailyTask(item.id)}
              onDelete={() => handleDeleteDailyTask(item.id)}
            />
          {/snippet}
        </DraggableList>
      {/if}
    </div>
  </section>

  <!-- LONG-TERM TASKS Section -->
  <section class="section">
    <header class="section-header">
      <h2 class="section-title">Long-term Tasks</h2>
      <div class="section-actions">
        <button class="btn btn-secondary btn-sm btn-tags" onclick={() => showTagsModal = true}>
          <span class="btn-tags-full">View Tags</span>
          <span class="btn-tags-short">Tags</span>
        </button>
        <button class="btn btn-primary btn-sm" onclick={() => { defaultTaskDate = undefined; showTaskForm = true; }}>
          + New Task
        </button>
      </div>
    </header>

    <div class="long-term-section">
      {#if longTermTasksLoading}
        <!-- Long-term Tasks Skeleton -->
        <div class="calendar-skeleton-mini">
          <div class="calendar-skeleton-header">
            <div class="skeleton-nav-btn"></div>
            <div class="skeleton-month-title"></div>
            <div class="skeleton-nav-btn"></div>
          </div>
          <div class="calendar-skeleton-grid">
            {#each Array(35) as _, i}
              <div class="skeleton-day-mini" style="--delay: {(i % 7) * 0.03}s"></div>
            {/each}
          </div>
          <div class="skeleton-shimmer"></div>
        </div>
        <div class="task-list-skeleton">
          {#each Array(3) as _, i}
            <div class="long-task-skeleton" style="--delay: {i * 0.1}s">
              <div class="long-task-skeleton-indicator"></div>
              <div class="long-task-skeleton-content">
                <div class="long-task-skeleton-title"></div>
                <div class="long-task-skeleton-meta">
                  <div class="long-task-skeleton-date"></div>
                  <div class="long-task-skeleton-category"></div>
                </div>
              </div>
              <div class="skeleton-shimmer"></div>
            </div>
          {/each}
        </div>
      {:else}
        <LongTermTaskCalendar
          {currentDate}
          tasks={longTermTasks}
          onDayClick={handleDayClick}
          onTaskClick={handleTaskClick}
          onMonthChange={handleMonthChange}
        />

        <LongTermTaskList
          title="Overdue"
          tasks={overdueTasks}
          variant="overdue"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        <LongTermTaskList
          title="Due Today"
          tasks={dueTodayTasks}
          variant="due-today"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        <LongTermTaskList
          title="Upcoming"
          tasks={upcomingTasks}
          variant="upcoming"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        <LongTermTaskList
          title="Completed"
          tasks={completedTasks}
          variant="completed"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        {#if longTermTasks.length === 0}
          <EmptyState
            icon="📅"
            title="No long-term tasks"
            description="Add tasks with due dates to track them on the calendar"
          >
            <button class="btn btn-primary" onclick={() => { defaultTaskDate = undefined; showTaskForm = true; }}>
              Add First Task
            </button>
          </EmptyState>
        {/if}
      {/if}
    </div>
  </section>
</div>

<!-- Modals -->
<CommitmentsModal
  open={showCommitmentsModal}
  {commitments}
  onClose={() => showCommitmentsModal = false}
  onCreate={handleCreateCommitment}
  onUpdate={handleUpdateCommitment}
  onDelete={handleDeleteCommitment}
  onReorder={handleReorderCommitment}
/>

<LongTermTaskForm
  open={showTaskForm}
  {categories}
  defaultDate={savedTaskFormState?.dueDate ?? defaultTaskDate}
  initialName={savedTaskFormState?.name ?? ''}
  initialCategoryId={savedTaskFormState?.categoryId ?? null}
  onClose={() => { showTaskForm = false; savedTaskFormState = null; }}
  onCreate={handleCreateLongTermTask}
  onDeleteCategory={handleDeleteCategory}
  onRequestCreateCategory={handleRequestCreateCategory}
/>

<CategoryCreateModal
  open={showCategoryCreate}
  onClose={handleCategoryCreateClose}
  onCreate={handleCategoryCreateSubmit}
/>

<LongTermTaskModal
  open={showTaskModal}
  task={selectedTask}
  {categories}
  onClose={() => { showTaskModal = false; selectedTask = null; }}
  onUpdate={handleUpdateLongTermTask}
  onToggle={handleToggleLongTermTask}
  onDelete={handleDeleteLongTermTask}
/>

<TaskTagsModal
  open={showTagsModal}
  {categories}
  tasks={longTermTasks}
  onClose={() => showTagsModal = false}
  onTaskClick={(task) => { showTagsModal = false; selectedTask = task; showTaskModal = true; }}
  onToggle={handleToggleLongTermTask}
  onDelete={handleDeleteLongTermTask}
  onDeleteCategory={handleDeleteCategory}
/>

<!-- Transition backdrop - stays visible during modal swaps -->
<div class="transition-backdrop" class:visible={modalTransitioning}></div>

<style>
  .transition-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 5, 15, 0.98);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: 1001;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease-out;
  }

  .transition-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
    transition: none; /* Appear instantly */
  }
  .section {
    margin-bottom: 3rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
  }

  .section-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .daily-tasks-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .long-term-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SKELETON LOADING STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .tasks-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-skeleton-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .task-skeleton-handle {
    width: 16px;
    height: 16px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-sm);
  }

  .task-skeleton-checkbox {
    width: 22px;
    height: 22px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
  }

  .task-skeleton-title {
    flex: 1;
    height: 1rem;
    background: linear-gradient(90deg,
      rgba(108, 92, 231, 0.12) 0%,
      rgba(108, 92, 231, 0.2) 50%,
      rgba(108, 92, 231, 0.12) 100%);
    border-radius: var(--radius-sm);
  }

  .task-skeleton-delete {
    width: 32px;
    height: 32px;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-md);
  }

  /* Mini Calendar Skeleton */
  .calendar-skeleton-mini {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(10, 10, 22, 0.98) 50%,
      rgba(15, 15, 30, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-xl);
    overflow: hidden;
    position: relative;
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  .calendar-skeleton-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
  }

  .skeleton-nav-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    background: rgba(108, 92, 231, 0.1);
  }

  .skeleton-month-title {
    width: 140px;
    height: 1.25rem;
    border-radius: var(--radius-md);
    background: linear-gradient(90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%);
  }

  .calendar-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    padding: 0.5rem;
  }

  .skeleton-day-mini {
    aspect-ratio: 1;
    min-height: 32px;
    border-radius: var(--radius-sm);
    background: rgba(20, 20, 40, 0.6);
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  /* Long-term Task List Skeleton */
  .task-list-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .long-task-skeleton {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .long-task-skeleton-indicator {
    width: 4px;
    height: 36px;
    background: rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-full);
  }

  .long-task-skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .long-task-skeleton-title {
    width: 65%;
    height: 1rem;
    background: linear-gradient(90deg,
      rgba(108, 92, 231, 0.12) 0%,
      rgba(108, 92, 231, 0.2) 50%,
      rgba(108, 92, 231, 0.12) 100%);
    border-radius: var(--radius-sm);
  }

  .long-task-skeleton-meta {
    display: flex;
    gap: 0.75rem;
  }

  .long-task-skeleton-date {
    width: 80px;
    height: 0.75rem;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-sm);
  }

  .long-task-skeleton-category {
    width: 60px;
    height: 0.75rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-sm);
  }

  .skeleton-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.08) 20%,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(108, 92, 231, 0.08) 60%,
      transparent 100%
    );
    animation: shimmer 2.5s ease-in-out infinite;
  }

  @keyframes skeletonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 200%; }
  }

  .empty-inline {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-style: italic;
    background: rgba(15, 15, 30, 0.6);
    border: 1px dashed rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
  }

  /* Button styles */
  :global(.btn-sm) {
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
  }

  :global(.btn-secondary) {
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    color: var(--color-primary-light);
  }

  :global(.btn-secondary:hover) {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  /* Tags button responsive text */
  .btn-tags-short {
    display: none;
  }

  @media (max-width: 400px) {
    .btn-tags-full {
      display: none;
    }
    .btn-tags-short {
      display: inline;
    }
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .section {
      margin-bottom: 2rem;
    }

    .section-header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .section-title {
      font-size: 1.25rem;
      text-align: center;
    }

    .section-actions {
      justify-content: center;
    }
  }
</style>
