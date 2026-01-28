<script lang="ts">
  import type { FocusSession } from '$lib/types';

  interface Props {
    session: FocusSession | null;
    isRunning: boolean;
    remainingMs: number;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onSkip: () => void;
  }

  let { session, isRunning, remainingMs, onStart, onPause, onResume, onStop, onSkip }: Props =
    $props();

  // Can go back only in first 30 seconds of a phase
  const canGoBack = $derived(
    session &&
      session.status === 'running' &&
      remainingMs >
        (session.phase === 'focus'
          ? session.focus_duration * 60 * 1000 - 30000
          : session.break_duration * 60 * 1000 - 30000)
  );

  const hasSession = $derived(!!session && session.status !== 'stopped');
  const isPaused = $derived(session?.status === 'paused');
</script>

<div class="controls">
  {#if !hasSession}
    <!-- No session - show start button -->
    <button class="control-btn primary large" onclick={onStart} aria-label="Start focus session">
      <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <polygon points="5,3 19,12 5,21" />
      </svg>
      <span>Start Focus</span>
    </button>
  {:else}
    <!-- Active session controls -->
    <div class="control-row">
      <!-- Stop button -->
      <button class="control-btn stop" onclick={onStop} aria-label="Stop session">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      </button>

      <!-- Main play/pause button -->
      {#if isRunning}
        <button class="control-btn primary" onclick={onPause} aria-label="Pause">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </button>
      {:else}
        <button class="control-btn primary" onclick={onResume} aria-label="Resume">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
      {/if}

      <!-- Skip button -->
      <button class="control-btn skip" onclick={onSkip} aria-label="Skip to next phase">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <polygon points="5,4 15,12 5,20" />
          <rect x="15" y="4" width="4" height="16" rx="1" />
        </svg>
      </button>
    </div>

    <!-- Phase info -->
    {#if session}
      <div class="phase-info">
        {#if session.phase === 'focus'}
          <span class="phase-badge focus">Focus</span>
        {:else if session.phase === 'break'}
          <span class="phase-badge break">Break</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
  }

  .control-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-text);
  }

  .control-btn:hover {
    transform: scale(1.05);
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  /* Primary button (play/pause) */
  .control-btn.primary {
    width: 72px;
    height: 72px;
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 20px var(--color-primary-glow);
  }

  .control-btn.primary:hover {
    box-shadow: 0 6px 30px var(--color-primary-glow);
  }

  .control-btn.primary.large {
    width: auto;
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .control-btn.primary.large span {
    margin-left: 0.5rem;
  }

  /* Stop button */
  .control-btn.stop {
    width: 48px;
    height: 48px;
    background: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
    border: 1px solid rgba(255, 107, 107, 0.3);
  }

  .control-btn.stop:hover {
    background: rgba(255, 107, 107, 0.25);
    border-color: rgba(255, 107, 107, 0.5);
  }

  /* Skip button */
  .control-btn.skip {
    width: 48px;
    height: 48px;
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light);
    border: 1px solid rgba(108, 92, 231, 0.3);
  }

  .control-btn.skip:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  /* Phase info */
  .phase-info {
    margin-top: 0.5rem;
  }

  .phase-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: var(--radius-full);
  }

  .phase-badge.focus {
    background: rgba(108, 92, 231, 0.2);
    color: var(--color-primary-light);
  }

  .phase-badge.break {
    background: rgba(38, 222, 129, 0.2);
    color: #26de81;
  }

  /* Responsive */
  @media (max-width: 400px) {
    .control-btn.primary {
      width: 64px;
      height: 64px;
    }

    .control-btn.primary.large {
      padding: 0.875rem 1.5rem;
    }

    .control-btn.stop,
    .control-btn.skip {
      width: 44px;
      height: 44px;
    }
  }
</style>
