<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { focusStore, blockListStore, focusTimeUpdated } from '$lib/stores/focus';
  import type { FocusSettings, FocusSession, BlockList, DayOfWeek } from '$lib/types';
  import { formatDuration } from '$lib/utils/focus';

  import FocusTimer from '$lib/components/focus/FocusTimer.svelte';
  import FocusControls from '$lib/components/focus/FocusControls.svelte';
  import SessionSchedule from '$lib/components/focus/SessionSchedule.svelte';
  import FocusSettingsModal from '$lib/components/focus/FocusSettings.svelte';
  import BlockListManager from '$lib/components/focus/BlockListManager.svelte';

  // State from store
  let settings = $state<FocusSettings | null>(null);
  let session = $state<FocusSession | null>(null);
  let remainingMs = $state(0);
  let isRunning = $state(false);
  let loading = $state(true);

  // Block lists state
  let blockLists = $state<BlockList[]>([]);

  // UI state
  let showSettings = $state(false);
  let todayFocusTime = $state(0);

  // Get user ID helper
  function getUserId(): string {
    const pageData = $page.data;
    // Check for Supabase session
    if (pageData.session?.user?.id) {
      return pageData.session.user.id;
    }
    // Check for offline profile
    if (pageData.offlineProfile?.id) {
      return pageData.offlineProfile.id;
    }
    return '';
  }

  // Subscribe to stores
  $effect(() => {
    const unsubs = [
      focusStore.subscribe(state => {
        settings = state.settings;
        session = state.session;
        remainingMs = state.remainingMs;
        isRunning = state.isRunning;
      }),
      focusStore.loading.subscribe(v => loading = v),
      blockListStore.subscribe(v => blockLists = v),
      // Refresh focus time when it's updated (e.g., after phase completion)
      focusTimeUpdated.subscribe(() => {
        loadTodayFocusTime();
      })
    ];

    return () => unsubs.forEach(u => u());
  });

  // Focus time tick interval for live updates
  let focusTimeTickInterval: ReturnType<typeof setInterval> | null = null;

  // Start/stop focus time tick based on session state
  $effect(() => {
    const isRunningFocusPhase = session?.status === 'running' && session?.phase === 'focus';

    if (isRunningFocusPhase && !focusTimeTickInterval) {
      // Start ticking every 30 seconds
      focusTimeTickInterval = setInterval(() => {
        loadTodayFocusTime();
      }, 30000);
    } else if (!isRunningFocusPhase && focusTimeTickInterval) {
      // Stop ticking
      clearInterval(focusTimeTickInterval);
      focusTimeTickInterval = null;
    }
  });

  // Load data on mount
  onMount(async () => {
    const userId = getUserId();
    if (userId) {
      await focusStore.load(userId);
      await loadTodayFocusTime();
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    focusStore.destroy();
    if (focusTimeTickInterval) {
      clearInterval(focusTimeTickInterval);
      focusTimeTickInterval = null;
    }
  });

  async function loadTodayFocusTime() {
    todayFocusTime = await focusStore.getTodayFocusTime();
  }

  // Control handlers
  function handleStart() {
    focusStore.start();
  }

  function handlePause() {
    focusStore.pause();
  }

  function handleResume() {
    focusStore.resume();
  }

  function handleStop() {
    focusStore.stop();
    loadTodayFocusTime();
  }

  function handleSkip() {
    focusStore.skip();
  }

  function handleSaveSettings(updates: Partial<FocusSettings>) {
    focusStore.updateSettings(updates);
  }

  // Helper to check if a block list is active today
  function isBlockListActiveToday(list: BlockList): boolean {
    if (!list.is_enabled) return false;
    if (list.active_days === null) return true; // null means every day
    const currentDay = new Date().getDay() as DayOfWeek;
    return list.active_days.includes(currentDay);
  }

  // Derived values
  const enabledBlockListCount = $derived(blockLists.filter(isBlockListActiveToday).length);
  const todayFocusFormatted = $derived(formatDuration(todayFocusTime));
</script>

<svelte:head>
  <title>Focus - Stellar</title>
</svelte:head>

<div class="container">
  <!-- Header -->
  <header class="page-header">
    <h1 class="page-title">Focus</h1>
    <button class="settings-btn" onclick={() => showSettings = true} aria-label="Focus settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </header>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="loading-skeleton">
      <div class="timer-skeleton">
        <div class="timer-ring-skeleton"></div>
        <div class="timer-content-skeleton">
          <div class="time-skeleton"></div>
          <div class="phase-skeleton"></div>
        </div>
      </div>
      <div class="controls-skeleton">
        <div class="btn-skeleton"></div>
      </div>
    </div>
  {:else}
    <!-- Timer Section -->
    <section class="timer-section">
      <FocusTimer
        {session}
        {settings}
        {remainingMs}
        {isRunning}
      />

      <FocusControls
        {session}
        {isRunning}
        {remainingMs}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onSkip={handleSkip}
      />
    </section>

    <!-- Schedule Section -->
    <SessionSchedule {session} {settings} />

    <!-- Stats Row -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-label">Focus Time Today</span>
        <span class="stat-value">{todayFocusFormatted}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Block Lists</span>
        <span class="stat-value">{enabledBlockListCount} active</span>
      </div>
    </div>

    <!-- Block List Manager -->
    <BlockListManager userId={getUserId()} />
  {/if}
</div>

<!-- Settings Modal -->
<FocusSettingsModal
  {settings}
  isOpen={showSettings}
  onClose={() => showSettings = false}
  onSave={handleSaveSettings}
/>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .page-title {
    font-size: 1.75rem;
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

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-full);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.3s;
  }

  .settings-btn:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
    transform: rotate(30deg);
  }

  .timer-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 0;
  }

  /* Stats Row */
  .stats-row {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .stat-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-primary-light);
  }

  /* Loading skeleton */
  .loading-skeleton {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 0;
  }

  .timer-skeleton {
    position: relative;
    width: 320px;
    height: 320px;
  }

  .timer-ring-skeleton {
    position: absolute;
    inset: 0;
    border: 8px solid rgba(108, 92, 231, 0.15);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  .timer-content-skeleton {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .time-skeleton {
    width: 160px;
    height: 48px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    animation: pulse 2s ease-in-out infinite;
  }

  .phase-skeleton {
    width: 100px;
    height: 20px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-md);
    animation: pulse 2s ease-in-out infinite;
    animation-delay: 0.2s;
  }

  .controls-skeleton {
    margin-top: 2rem;
  }

  .btn-skeleton {
    width: 160px;
    height: 56px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-full);
    animation: pulse 2s ease-in-out infinite;
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Responsive */
  @media (max-width: 640px) {
    .page-header {
      margin-bottom: 1.5rem;
    }

    .page-title {
      font-size: 1.5rem;
    }

    .timer-section {
      padding: 1rem 0;
    }

    .stats-row {
      flex-direction: column;
    }
  }
</style>
