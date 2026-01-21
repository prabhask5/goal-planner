<script lang="ts">
  import { getProgressColor, getOverflowColor } from '$lib/utils/colors';

  interface Props {
    percentage: number;
    showLabel?: boolean;
    height?: string;
  }

  let { percentage, showLabel = true, height = '12px' }: Props = $props();

  // Use overflow color for >100%, regular progress color otherwise
  const color = $derived(percentage > 100 ? getOverflowColor(percentage) : getProgressColor(percentage));

  // Celebration intensity: 0 at 100%, scales to 1 at 200%+
  const celebrationIntensity = $derived(
    percentage <= 100 ? 0 : Math.min(1, (percentage - 100) / 100)
  );

  // Whether we're celebrating (any overflow)
  const isCelebrating = $derived(percentage > 100);

  // Cap the visual bar width at 100%
  const barWidth = $derived(Math.min(100, percentage));

  // Calculate dynamic glow size based on intensity (scales from 15px to 50px)
  const glowSize = $derived(15 + celebrationIntensity * 35);

  // Nebula opacity range (scales with intensity)
  const nebulaMin = $derived(0.1 + celebrationIntensity * 0.15);
  const nebulaMax = $derived(0.2 + celebrationIntensity * 0.4);

  // Animation speed: faster as intensity increases
  const shimmerDuration = $derived(3 - celebrationIntensity * 2);
  const pulseDuration = $derived(2 - celebrationIntensity * 1);

  // Number of particles based on intensity (0 to 12)
  const particleCount = $derived(Math.floor(celebrationIntensity * 12));

  // Number of pulse rings based on intensity (0 to 3)
  const ringCount = $derived(Math.floor(celebrationIntensity * 3));

  // Generate particle positions with deterministic offsets
  const particles = $derived(
    Array.from({ length: particleCount }, (_, i) => ({
      delay: (i * 0.3) % 2,
      duration: 1.5 + (i % 3) * 0.5,
      angle: (i * 30) % 360,
      distance: 30 + (i % 4) * 15,
      size: 2 + (i % 3),
    }))
  );

  // Generate ring delays
  const rings = $derived(
    Array.from({ length: ringCount }, (_, i) => ({
      delay: i * 0.6,
      duration: 2 - celebrationIntensity * 0.5,
    }))
  );
</script>

<div class="progress-container" class:celebrating={isCelebrating}>
  <div
    class="progress-bar"
    class:celebrating={isCelebrating}
    style="
      height: {height};
      --celebration-intensity: {celebrationIntensity};
      --glow-size: {glowSize}px;
      --glow-color: {color};
      --nebula-min: {nebulaMin};
      --nebula-max: {nebulaMax};
      --shimmer-duration: {shimmerDuration}s;
      --pulse-duration: {pulseDuration}s;
    "
  >
    <!-- Nebula glow background for celebrating state -->
    {#if isCelebrating}
      <div class="nebula-glow" style="--fill-color: {color}"></div>
    {/if}

    <div
      class="progress-fill"
      class:celebrating={isCelebrating}
      style="width: {barWidth}%; --fill-color: {color}"
    ></div>
    <div
      class="progress-glow"
      class:celebrating={isCelebrating}
      style="width: {barWidth}%; --fill-color: {color}"
    ></div>

    <!-- Aurora wave effect for medium+ intensity -->
    {#if celebrationIntensity > 0.2}
      <div class="aurora-wave" style="--aurora-color: {color}; --aurora-intensity: {celebrationIntensity}"></div>
    {/if}

    <!-- Pulse rings emanating from the end -->
    {#if isCelebrating}
      <div class="pulse-ring-container">
        {#each rings as ring, i}
          <div
            class="pulse-ring"
            style="
              --ring-color: {color};
              --ring-delay: {ring.delay}s;
              --ring-duration: {ring.duration}s;
            "
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Starburst particles -->
    {#if celebrationIntensity > 0.1}
      <div class="particle-container">
        {#each particles as particle, i}
          <div
            class="starburst-particle"
            style="
              --particle-color: {color};
              --particle-delay: {particle.delay}s;
              --particle-duration: {particle.duration}s;
              --particle-angle: {particle.angle}deg;
              --particle-distance: {particle.distance}px;
              --particle-size: {particle.size}px;
            "
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Orbiting stars for high intensity celebrations -->
    {#if celebrationIntensity > 0.4}
      <div class="orbital-container" style="--orbit-color: {color}">
        <div class="orbital-star" style="--orbit-radius: 20px; --orbit-duration: {4 - celebrationIntensity * 2}s; --star-delay: 0s"></div>
        {#if celebrationIntensity > 0.6}
          <div class="orbital-star" style="--orbit-radius: 28px; --orbit-duration: {5 - celebrationIntensity * 2}s; --star-delay: -1.5s"></div>
        {/if}
        {#if celebrationIntensity > 0.8}
          <div class="orbital-star" style="--orbit-radius: 35px; --orbit-duration: {4.5 - celebrationIntensity * 2}s; --star-delay: -0.8s"></div>
        {/if}
      </div>
    {/if}

    <!-- Energy crackling for very high intensity -->
    {#if celebrationIntensity > 0.7}
      <div class="energy-crackle" style="--crackle-color: {color}"></div>
    {/if}
  </div>

  {#if showLabel}
    <span
      class="progress-label"
      class:celebrating={isCelebrating}
      style="color: {color}; --glow-color: {color}; --celebration-intensity: {celebrationIntensity}"
    >
      {Math.round(percentage)}%
    </span>
  {/if}
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
  }

  .progress-container.celebrating {
    /* Extra padding for particles/effects that extend beyond */
    padding: 10px 0;
    margin: -10px 0;
  }

  .progress-bar {
    flex: 1;
    background: linear-gradient(180deg,
      rgba(20, 20, 40, 0.9) 0%,
      rgba(10, 10, 25, 0.95) 100%);
    border-radius: var(--radius-full);
    overflow: visible;
    position: relative;
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.4),
      inset 0 -1px 0 rgba(255, 255, 255, 0.03),
      0 1px 3px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .progress-bar.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 60%, transparent);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.4),
      inset 0 -1px 0 rgba(255, 255, 255, 0.03),
      0 1px 3px rgba(0, 0, 0, 0.3),
      0 0 var(--glow-size) color-mix(in srgb, var(--glow-color) calc(30% + var(--celebration-intensity) * 40%), transparent);
    animation: cosmicGlow var(--pulse-duration) ease-in-out infinite,
               barExpand calc(var(--pulse-duration) * 0.5) ease-in-out infinite;
  }

  @keyframes barExpand {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(calc(1 + var(--celebration-intensity) * 0.15)); }
  }

  /* Nebula glow background */
  .nebula-glow {
    position: absolute;
    inset: -30px;
    background: radial-gradient(
      ellipse at 30% 50%,
      color-mix(in srgb, var(--fill-color) calc(var(--nebula-max, 0.3) * 100%), transparent) 0%,
      transparent 70%
    );
    animation: nebulaBreath 3s ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
  }

  .progress-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--fill-color) 100%, white 25%) 0%,
      var(--fill-color) 50%,
      color-mix(in srgb, var(--fill-color) 80%, black) 100%);
    transition: width 0.6s var(--ease-out);
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
    animation: progressPulse 2s ease-in-out infinite;
    z-index: 1;
  }

  .progress-fill.celebrating {
    animation: progressPulse var(--pulse-duration) ease-in-out infinite,
               fillGlow var(--pulse-duration) ease-in-out infinite;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.4),
      0 0 20px color-mix(in srgb, var(--fill-color) 50%, transparent);
  }

  @keyframes progressPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.15); }
  }

  @keyframes fillGlow {
    0%, 100% {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        0 0 20px color-mix(in srgb, var(--fill-color) 50%, transparent);
    }
    50% {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.6),
        0 0 35px color-mix(in srgb, var(--fill-color) 70%, transparent);
    }
  }

  /* Shine effect on top */
  .progress-fill::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg,
      rgba(255, 255, 255, 0.4) 0%,
      rgba(255, 255, 255, 0.1) 50%,
      transparent 100%);
    border-radius: var(--radius-full) var(--radius-full) 0 0;
  }

  /* Animated shimmer */
  .progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%);
    animation: shimmer 2s ease-in-out infinite;
  }

  .progress-fill.celebrating::after {
    animation: supernovaShimmer var(--shimmer-duration, 2s) ease-in-out infinite;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.5) 40%,
      rgba(255, 255, 255, 0.6) 50%,
      rgba(255, 255, 255, 0.5) 60%,
      transparent 100%);
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  .progress-glow {
    position: absolute;
    top: -50%;
    left: 0;
    height: 200%;
    border-radius: var(--radius-full);
    background: var(--fill-color);
    filter: blur(12px);
    opacity: 0.5;
    transition: width 0.6s var(--ease-out);
    pointer-events: none;
    animation: glowPulse 2s ease-in-out infinite;
    z-index: 0;
  }

  .progress-glow.celebrating {
    filter: blur(calc(15px + var(--celebration-intensity, 0) * 15px));
    opacity: calc(0.5 + var(--celebration-intensity, 0) * 0.4);
    animation: glowPulse var(--pulse-duration) ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  /* Aurora wave effect */
  .aurora-wave {
    position: absolute;
    top: -200%;
    left: 0;
    right: 0;
    height: 500%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--aurora-color) calc(var(--aurora-intensity) * 20%), transparent) 20%,
      color-mix(in srgb, var(--aurora-color) calc(var(--aurora-intensity) * 35%), transparent) 50%,
      color-mix(in srgb, var(--aurora-color) calc(var(--aurora-intensity) * 20%), transparent) 80%,
      transparent 100%
    );
    animation: auroraWave calc(3s - var(--aurora-intensity) * 1.5s) ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
    filter: blur(8px);
  }

  @keyframes auroraWave {
    0%, 100% {
      transform: translateY(5%) scaleY(0.8);
      opacity: 0.3;
    }
    50% {
      transform: translateY(-5%) scaleY(1.2);
      opacity: 0.6;
    }
  }

  /* Pulse rings */
  .pulse-ring-container {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    z-index: 3;
  }

  .pulse-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    border: 2px solid var(--ring-color);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: pulseRingExpand var(--ring-duration) ease-out infinite;
    animation-delay: var(--ring-delay);
    opacity: 0;
  }

  @keyframes pulseRingExpand {
    0% {
      width: 10px;
      height: 10px;
      opacity: 0.8;
      border-width: 3px;
    }
    100% {
      width: 80px;
      height: 80px;
      opacity: 0;
      border-width: 1px;
    }
  }

  /* Starburst particles */
  .particle-container {
    position: absolute;
    right: 5%;
    top: 50%;
    width: 0;
    height: 0;
    z-index: 4;
  }

  .starburst-particle {
    position: absolute;
    width: var(--particle-size);
    height: var(--particle-size);
    background: var(--particle-color);
    border-radius: 50%;
    box-shadow: 0 0 calc(var(--particle-size) * 2) var(--particle-color);
    animation: starburstShoot var(--particle-duration) ease-out infinite;
    animation-delay: var(--particle-delay);
    opacity: 0;
  }

  @keyframes starburstShoot {
    0% {
      transform: rotate(var(--particle-angle)) translateX(0);
      opacity: 1;
    }
    100% {
      transform: rotate(var(--particle-angle)) translateX(var(--particle-distance));
      opacity: 0;
    }
  }

  /* Orbital stars container */
  .orbital-container {
    position: absolute;
    top: 50%;
    right: 10%;
    width: 0;
    height: 0;
    z-index: 2;
  }

  .orbital-star {
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--orbit-color, var(--color-cyan));
    border-radius: 50%;
    box-shadow: 0 0 8px var(--orbit-color, var(--color-cyan)),
                0 0 15px var(--orbit-color, var(--color-cyan));
    animation: orbitalStar var(--orbit-duration, 3s) linear infinite;
    animation-delay: var(--star-delay, 0s);
  }

  /* Energy crackle effect */
  .energy-crackle {
    position: absolute;
    inset: -5px;
    border-radius: var(--radius-full);
    background: transparent;
    z-index: 5;
    pointer-events: none;
    animation: crackle 0.3s steps(2) infinite;
  }

  .energy-crackle::before,
  .energy-crackle::after {
    content: '';
    position: absolute;
    background: var(--crackle-color);
    filter: blur(1px);
    opacity: 0.7;
    animation: crackleFlash 0.2s ease-out infinite alternate;
  }

  .energy-crackle::before {
    top: 20%;
    right: 15%;
    width: 2px;
    height: 8px;
    transform: rotate(45deg);
  }

  .energy-crackle::after {
    bottom: 25%;
    right: 25%;
    width: 2px;
    height: 6px;
    transform: rotate(-30deg);
  }

  @keyframes crackle {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.4; }
  }

  @keyframes crackleFlash {
    0% { opacity: 0.3; transform: rotate(45deg) scaleY(0.8); }
    100% { opacity: 0.9; transform: rotate(45deg) scaleY(1.2); }
  }

  .progress-label {
    font-size: 1.125rem;
    font-weight: 800;
    min-width: 4rem;
    text-align: right;
    text-shadow: 0 0 30px currentColor;
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
    letter-spacing: -0.02em;
    transition: all 0.3s var(--ease-out);
  }

  .progress-label.celebrating {
    text-shadow:
      0 0 calc(20px + var(--celebration-intensity, 0) * 30px) var(--glow-color),
      0 0 calc(40px + var(--celebration-intensity, 0) * 40px) color-mix(in srgb, var(--glow-color) 50%, transparent);
    animation: celebrationTwinkle calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-in-out infinite,
               labelPulse calc(1s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
    --twinkle-min: calc(0.7 - var(--celebration-intensity, 0) * 0.2);
    --twinkle-max: 1;
  }

  @keyframes labelPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(calc(1 + var(--celebration-intensity, 0) * 0.1)); }
  }

  .progress-container:hover .progress-label {
    transform: scale(1.05);
    text-shadow: 0 0 40px currentColor;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .progress-fill,
    .progress-fill::after,
    .progress-glow,
    .progress-bar.celebrating,
    .progress-label.celebrating,
    .orbital-star,
    .nebula-glow,
    .aurora-wave,
    .pulse-ring,
    .starburst-particle,
    .energy-crackle,
    .energy-crackle::before,
    .energy-crackle::after {
      animation: none !important;
    }
  }
</style>
