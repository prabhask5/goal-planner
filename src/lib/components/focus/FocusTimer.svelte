<script lang="ts">
  import type { FocusSession, FocusSettings } from '$lib/types';
  import { formatTime, calculateProgress, getPhaseText } from '$lib/utils/focus';

  interface Props {
    session: FocusSession | null;
    settings: FocusSettings | null;
    remainingMs: number;
    isRunning: boolean;
  }

  let { session, settings, remainingMs, isRunning }: Props = $props();

  // Calculate total duration for progress
  const totalMs = $derived(() => {
    if (!session || !settings) {
      return (settings?.focus_duration || 25) * 60 * 1000;
    }

    if (session.phase === 'focus') {
      return session.focus_duration * 60 * 1000;
    }

    const isLongBreak = session.current_cycle >= settings.cycles_before_long_break;
    return isLongBreak
      ? settings.long_break_duration * 60 * 1000
      : session.break_duration * 60 * 1000;
  });

  const progress = $derived(calculateProgress(remainingMs, totalMs()));
  const timeDisplay = $derived(formatTime(remainingMs));
  const isBreak = $derived(session?.phase === 'break');
  const isLongBreak = $derived(
    session?.phase === 'break' &&
    settings &&
    session.current_cycle >= settings.cycles_before_long_break
  );
  const phaseText = $derived(
    session ? getPhaseText(session.phase, isLongBreak) : 'Ready to Focus'
  );

  // SVG circle calculations
  const radius = 140;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = $derived(circumference - (progress / 100) * circumference);
</script>

<div class="timer-container" class:running={isRunning}>
  <!-- 3-Layer CSS Starfield -->
  <div class="stars-container">
    <div class="stars stars-small"></div>
    <div class="stars stars-medium"></div>
    <div class="stars stars-large"></div>
  </div>

  <!-- Nebula background -->
  <div class="nebula" class:active={isRunning}></div>

  <!-- Orbital rings (visible when running) -->
  {#if isRunning}
    <div class="orbital-ring orbital-ring-1" class:break={isBreak}>
      <div class="orbital-dot"></div>
    </div>
    <div class="orbital-ring orbital-ring-2" class:break={isBreak}>
      <div class="orbital-dot"></div>
    </div>
  {/if}

  <!-- Timer ring -->
  <svg class="timer-ring" viewBox="0 0 320 320">
    <!-- Background ring -->
    <circle
      cx="160"
      cy="160"
      r={radius}
      fill="none"
      stroke="rgba(108, 92, 231, 0.15)"
      stroke-width={strokeWidth}
    />

    <!-- Progress ring -->
    <circle
      class="progress-ring"
      class:focus={!isBreak}
      class:break={isBreak}
      class:running={isRunning}
      cx="160"
      cy="160"
      r={radius}
      fill="none"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={strokeDashoffset}
      transform="rotate(-90 160 160)"
    />

    <!-- Glow effect -->
    {#if isRunning}
      <circle
        class="glow-ring"
        class:focus={!isBreak}
        class:break={isBreak}
        cx="160"
        cy="160"
        r={radius}
        fill="none"
        stroke-width={strokeWidth + 4}
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={strokeDashoffset}
        transform="rotate(-90 160 160)"
      />
    {/if}
  </svg>

  <!-- Timer content -->
  <div class="timer-content">
    <div class="time-display" class:running={isRunning}>
      {timeDisplay}
    </div>
    <div class="phase-text" class:break={isBreak}>
      {phaseText}
    </div>
    {#if session}
      <div class="cycle-indicator">
        Cycle {session.current_cycle} of {session.total_cycles}
      </div>
    {/if}
  </div>
</div>

<style>
  .timer-container {
    position: relative;
    width: 320px;
    height: 320px;
    margin: 0 auto;
  }

  /* 3-Layer CSS Starfield */
  .stars-container {
    position: absolute;
    inset: -60px;
    overflow: hidden;
    pointer-events: none;
    border-radius: 50%;
  }

  .stars {
    position: absolute;
    inset: 0;
    background-repeat: repeat;
  }

  .stars-small {
    background-image:
      radial-gradient(1px 1px at 20px 30px, white, transparent),
      radial-gradient(1px 1px at 40px 70px, rgba(255, 255, 255, 0.8), transparent),
      radial-gradient(1px 1px at 50px 160px, rgba(255, 255, 255, 0.6), transparent),
      radial-gradient(1px 1px at 90px 40px, white, transparent),
      radial-gradient(1px 1px at 130px 80px, rgba(255, 255, 255, 0.7), transparent),
      radial-gradient(1px 1px at 160px 120px, white, transparent),
      radial-gradient(1px 1px at 200px 60px, rgba(255, 255, 255, 0.5), transparent),
      radial-gradient(1px 1px at 240px 150px, white, transparent),
      radial-gradient(1px 1px at 280px 90px, rgba(255, 255, 255, 0.8), transparent),
      radial-gradient(1px 1px at 320px 140px, white, transparent),
      radial-gradient(1px 1px at 360px 180px, rgba(255, 255, 255, 0.6), transparent),
      radial-gradient(1px 1px at 380px 50px, white, transparent);
    background-size: 400px 220px;
    animation: twinkle 4s ease-in-out infinite;
  }

  .stars-medium {
    background-image:
      radial-gradient(1.5px 1.5px at 100px 50px, white, transparent),
      radial-gradient(1.5px 1.5px at 200px 120px, rgba(255, 255, 255, 0.9), transparent),
      radial-gradient(1.5px 1.5px at 70px 180px, white, transparent),
      radial-gradient(1.5px 1.5px at 250px 200px, rgba(255, 255, 255, 0.7), transparent),
      radial-gradient(1.5px 1.5px at 30px 100px, white, transparent),
      radial-gradient(1.5px 1.5px at 330px 80px, rgba(255, 255, 255, 0.8), transparent),
      radial-gradient(1.5px 1.5px at 380px 160px, white, transparent);
    background-size: 400px 280px;
    animation: twinkle 5s ease-in-out infinite reverse;
    animation-delay: 0.5s;
  }

  .stars-large {
    background-image:
      radial-gradient(2px 2px at 150px 100px, white, transparent),
      radial-gradient(2px 2px at 50px 220px, rgba(255, 255, 255, 0.9), transparent),
      radial-gradient(2px 2px at 220px 30px, white, transparent),
      radial-gradient(2px 2px at 320px 120px, rgba(255, 255, 255, 0.8), transparent),
      radial-gradient(2px 2px at 380px 200px, white, transparent);
    background-size: 420px 300px;
    animation: twinkle 6s ease-in-out infinite;
    animation-delay: 1s;
  }

  @keyframes twinkle {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.9; }
  }

  /* Nebula Background */
  .nebula {
    position: absolute;
    inset: -80px;
    background: radial-gradient(
      ellipse at 50% 50%,
      rgba(108, 92, 231, 0.2) 0%,
      rgba(255, 121, 198, 0.15) 30%,
      transparent 60%
    );
    pointer-events: none;
    opacity: 0.4;
    transition: opacity 0.5s ease;
  }

  .nebula.active {
    opacity: 1;
    animation: nebulaPulse 8s ease-in-out infinite;
  }

  @keyframes nebulaPulse {
    0%, 100% { opacity: 0.7; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.08); }
  }

  /* Orbital Rings */
  .orbital-ring {
    position: absolute;
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: 50%;
    pointer-events: none;
  }

  .orbital-ring-1 {
    inset: -20px;
    animation: orbitRotate 12s linear infinite;
  }

  .orbital-ring-2 {
    inset: -40px;
    animation: orbitRotate 18s linear infinite reverse;
  }

  .orbital-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    background: var(--color-primary);
    border-radius: 50%;
    top: 50%;
    left: 0;
    transform: translate(-50%, -50%);
    box-shadow:
      0 0 8px var(--color-primary),
      0 0 16px var(--color-primary-glow);
  }

  .orbital-ring-2 .orbital-dot {
    left: auto;
    right: 0;
    transform: translate(50%, -50%);
  }

  @keyframes orbitRotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Break phase orbital styling */
  .orbital-ring.break {
    border-color: rgba(38, 222, 129, 0.2);
  }

  .orbital-ring.break .orbital-dot {
    background: #26de81;
    box-shadow:
      0 0 8px #26de81,
      0 0 16px rgba(38, 222, 129, 0.5);
  }

  /* Timer ring */
  .timer-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .progress-ring {
    transition: stroke-dashoffset 0.3s ease-out;
  }

  .progress-ring.running {
    transition: stroke-dashoffset 1s linear;
  }

  .progress-ring.focus {
    stroke: url(#focusGradient);
  }

  .progress-ring.break {
    stroke: url(#breakGradient);
  }

  .progress-ring.running {
    filter:
      drop-shadow(0 0 4px var(--color-primary))
      drop-shadow(0 0 8px var(--color-primary-glow))
      drop-shadow(0 0 16px var(--color-primary-glow));
  }

  .progress-ring.running.break {
    filter:
      drop-shadow(0 0 4px #26de81)
      drop-shadow(0 0 8px rgba(38, 222, 129, 0.5))
      drop-shadow(0 0 16px rgba(38, 222, 129, 0.3));
  }

  .glow-ring {
    opacity: 0.3;
    filter: blur(8px);
  }

  .glow-ring.focus {
    stroke: var(--color-primary);
  }

  .glow-ring.break {
    stroke: #26de81;
  }

  /* Timer content */
  .timer-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .time-display {
    font-size: 4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--color-text);
    transition: text-shadow 0.5s ease, color 0.5s ease;
  }

  .time-display.running {
    text-shadow:
      0 0 10px var(--color-primary-glow),
      0 0 20px var(--color-primary-glow),
      0 0 40px var(--color-primary-glow),
      0 0 60px rgba(108, 92, 231, 0.3);
  }

  .phase-text {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-primary-light);
    margin-top: 0.5rem;
  }

  .phase-text.break {
    color: #26de81;
  }

  .cycle-indicator {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.5rem;
  }

  /* Responsive */
  @media (max-width: 400px) {
    .timer-container {
      width: 280px;
      height: 280px;
    }

    .time-display {
      font-size: 3rem;
    }
  }
</style>

<!-- SVG gradient definitions (hidden) -->
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6c5ce7"/>
      <stop offset="100%" stop-color="#ff79c6"/>
    </linearGradient>
    <linearGradient id="breakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#26de81"/>
      <stop offset="100%" stop-color="#00d4ff"/>
    </linearGradient>
  </defs>
</svg>
