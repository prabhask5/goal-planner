<script lang="ts">
  // A subtle but visible starfield background for content pages
  // Inspired by the home page but less intensive for performance
</script>

<div class="page-starfield">
  <!-- Static stars layer -->
  <div class="stars stars-layer-1"></div>
  <div class="stars stars-layer-2"></div>

  <!-- Nebula accents -->
  <div class="nebula nebula-top"></div>
  <div class="nebula nebula-bottom"></div>

  <!-- Floating particles -->
  <div class="floating-particles">
    {#each Array(12) as _, i}
      <span
        class="particle"
        style="
          --delay: {i * 0.5}s;
          --duration: {8 + (i % 4) * 3}s;
          --x: {5 + (i * 8) % 90}%;
          --y: {10 + (i * 7) % 80}%;
          --size: {2 + (i % 3)}px;
        "
      ></span>
    {/each}
  </div>
</div>

<style>
  .page-starfield {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }

  /* Star layers */
  .stars {
    position: absolute;
    inset: 0;
    background-repeat: repeat;
  }

  .stars-layer-1 {
    background-image:
      radial-gradient(1px 1px at 10% 15%, rgba(255, 255, 255, 0.7) 0%, transparent 100%),
      radial-gradient(1px 1px at 25% 45%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 35% 75%, rgba(108, 92, 231, 0.8) 0%, transparent 100%),
      radial-gradient(1px 1px at 50% 25%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 65% 60%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 75% 35%, rgba(38, 222, 129, 0.7) 0%, transparent 100%),
      radial-gradient(1px 1px at 85% 85%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 95% 10%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 15% 90%, rgba(255, 121, 198, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 45% 5%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 55% 50%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 70% 80%, rgba(0, 212, 255, 0.5) 0%, transparent 100%);
    background-size: 250px 250px;
    animation: twinkle 6s ease-in-out infinite;
  }

  .stars-layer-2 {
    background-image:
      radial-gradient(2px 2px at 20% 30%, rgba(108, 92, 231, 0.9) 0%, transparent 100%),
      radial-gradient(2px 2px at 60% 70%, rgba(255, 121, 198, 0.7) 0%, transparent 100%),
      radial-gradient(2px 2px at 80% 15%, rgba(38, 222, 129, 0.6) 0%, transparent 100%),
      radial-gradient(2.5px 2.5px at 40% 55%, rgba(255, 255, 255, 0.9) 0%, transparent 100%),
      radial-gradient(2px 2px at 90% 45%, rgba(0, 212, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 5% 65%, rgba(255, 255, 255, 0.7) 0%, transparent 100%);
    background-size: 400px 400px;
    animation: twinkle 8s ease-in-out infinite reverse;
    animation-delay: -2s;
  }

  @keyframes twinkle {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Nebula accents */
  .nebula {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.25;
    animation: nebulaPulse 12s ease-in-out infinite;
  }

  .nebula-top {
    width: 500px;
    height: 400px;
    top: -150px;
    right: -100px;
    background: radial-gradient(ellipse,
      rgba(108, 92, 231, 0.5) 0%,
      rgba(255, 121, 198, 0.2) 50%,
      transparent 70%);
  }

  .nebula-bottom {
    width: 450px;
    height: 350px;
    bottom: -100px;
    left: -100px;
    background: radial-gradient(ellipse,
      rgba(38, 222, 129, 0.4) 0%,
      rgba(0, 212, 255, 0.2) 50%,
      transparent 70%);
    animation-delay: -6s;
  }

  @keyframes nebulaPulse {
    0%, 100% {
      opacity: 0.2;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(1.1);
    }
  }

  /* Floating particles */
  .floating-particles {
    position: absolute;
    inset: 0;
  }

  .particle {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--size);
    height: var(--size);
    background: white;
    border-radius: 50%;
    opacity: 0.5;
    animation: particleFloat var(--duration) ease-in-out var(--delay) infinite;
  }

  @keyframes particleFloat {
    0%, 100% {
      transform: translateY(0) translateX(0);
      opacity: 0.4;
    }
    25% {
      transform: translateY(-20px) translateX(10px);
    }
    50% {
      transform: translateY(-35px) translateX(-5px);
      opacity: 0.7;
    }
    75% {
      transform: translateY(-15px) translateX(15px);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .stars,
    .nebula,
    .particle {
      animation: none;
    }
    .stars-layer-1,
    .stars-layer-2 {
      opacity: 0.9;
    }
    .nebula {
      opacity: 0.25;
    }
  }
</style>
