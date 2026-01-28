<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { onSyncComplete } from '$lib/sync/engine';
  import { browser } from '$app/environment';
  import { authState, userDisplayInfo } from '$lib/stores/authState';
  import PWAInstallModal from '$lib/components/PWAInstallModal.svelte';
  let isLoading = $state(true);
  let selectedCompliment = $state('');
  let timeGreeting = $state('Good day');
  let isGreetingTransitioning = $state(false);
  let showPWAButton = $state(false);
  let isPWAModalOpen = $state(false);

  // LocalStorage key for tracking first-time home page visit
  const FIRST_HOME_VISIT_KEY = 'stellar_first_home_visit_complete';

  // PWA-specific messages
  const PWA_WELCOME_MESSAGE =
    'Welcome! Make sure to download Stellar onto your phone as an app to track tasks on the go!';
  const PWA_REMINDER_MESSAGE =
    "By the way, if you haven't, you can download Stellar onto your phone as an app!";

  // Time periods for comparison (avoids string comparison overhead)
  type TimePeriod = 'morning' | 'afternoon' | 'evening';
  let currentTimePeriod = $state<TimePeriod>('morning');

  function getTimePeriod(): TimePeriod {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'morning';
    } else if (hour >= 12 && hour < 17) {
      return 'afternoon';
    } else {
      return 'evening';
    }
  }

  function getGreetingForPeriod(period: TimePeriod): string {
    switch (period) {
      case 'morning':
        return 'Good morning';
      case 'afternoon':
        return 'Good afternoon';
      case 'evening':
        return 'Good evening';
    }
  }

  // Smoothly transition greeting when time period changes
  function updateGreetingIfNeeded(): void {
    const newPeriod = getTimePeriod();
    if (newPeriod !== currentTimePeriod) {
      // Time period changed - animate the transition
      isGreetingTransitioning = true;

      // After fade out, update the text
      setTimeout(() => {
        currentTimePeriod = newPeriod;
        timeGreeting = getGreetingForPeriod(newPeriod);

        // After text update, fade back in
        setTimeout(() => {
          isGreetingTransitioning = false;
        }, 50);
      }, 300);
    }
  }

  // Cleanup function for sync subscription
  let unsubscribeSyncComplete: (() => void) | null = null;

  const compliments = [
    "you're going to do great things.",
    'the universe is on your side.',
    'your potential is limitless.',
    "you're capable of amazing things.",
    'keep reaching for the stars.',
    'your dedication is inspiring.',
    'greatness is within your reach.',
    'you make the impossible possible.',
    "you're stronger than you know.",
    'every step you take matters.',
    'your journey is extraordinary.',
    "you're exactly where you need to be.",
    'the best is yet to come.',
    "you've got this.",
    'your hard work will pay off.'
  ];

  function getRandomCompliment(): string {
    return compliments[Math.floor(Math.random() * compliments.length)];
  }

  interface MessageResult {
    message: string;
    isPWAMessage: boolean;
    isFirstVisit: boolean;
  }

  function getMessageForDisplay(): MessageResult {
    if (!browser) {
      return { message: getRandomCompliment(), isPWAMessage: false, isFirstVisit: false };
    }

    const hasVisitedBefore = localStorage.getItem(FIRST_HOME_VISIT_KEY);

    if (!hasVisitedBefore) {
      // First time visiting home page - show welcome PWA message
      localStorage.setItem(FIRST_HOME_VISIT_KEY, 'true');
      return { message: PWA_WELCOME_MESSAGE, isPWAMessage: true, isFirstVisit: true };
    }

    // Returning user - 1/50 chance to show PWA reminder
    const showPWAReminder = Math.random() < 0.02; // 1/50 = 0.02
    if (showPWAReminder) {
      return { message: PWA_REMINDER_MESSAGE, isPWAMessage: true, isFirstVisit: false };
    }

    // Regular compliment with "Remember, " prefix
    return { message: getRandomCompliment(), isPWAMessage: false, isFirstVisit: false };
  }

  // Use the auth store for user info - works for both online and offline modes
  const firstName = $derived($userDisplayInfo?.firstName || 'Explorer');

  onMount(() => {
    // Initialize greeting based on current time
    currentTimePeriod = getTimePeriod();
    timeGreeting = getGreetingForPeriod(currentTimePeriod);

    // Get message for display
    const messageResult = getMessageForDisplay();
    selectedCompliment = messageResult.message;
    showPWAButton = messageResult.isPWAMessage;

    isLoading = false;

    // Subscribe to sync completion - check if greeting needs update
    // This handles the case where the page is open overnight
    unsubscribeSyncComplete = onSyncComplete(() => {
      updateGreetingIfNeeded();
    });
  });

  // Use reactive effect to handle auth redirects
  // This uses the authState from the layout instead of re-checking
  $effect(() => {
    if (!$authState.isLoading && $authState.mode === 'none') {
      // Include redirect param so login page knows this was a redirect, not direct navigation
      goto('/login?redirect=%2F', { replaceState: true });
    }
  });

  onDestroy(() => {
    // Clean up sync subscription
    if (unsubscribeSyncComplete) {
      unsubscribeSyncComplete();
      unsubscribeSyncComplete = null;
    }
  });
</script>

<svelte:head>
  <title>Home - Stellar</title>
</svelte:head>

{#if isLoading}
  <div class="loading-screen">
    <div class="loading-orb"></div>
  </div>
{:else}
  <div class="home-container">
    <!-- Animated Star Field -->
    <div class="starfield">
      <div class="stars stars-small"></div>
      <div class="stars stars-medium"></div>
      <div class="stars stars-large"></div>
    </div>

    <!-- Nebula Effects -->
    <div class="nebula nebula-1"></div>
    <div class="nebula nebula-2"></div>
    <div class="nebula nebula-3"></div>

    <!-- Orbital Rings -->
    <div class="orbital-system">
      <div class="orbit orbit-1"></div>
      <div class="orbit orbit-2"></div>
      <div class="orbit orbit-3"></div>
      <div class="orbit-particle particle-1"></div>
      <div class="orbit-particle particle-2"></div>
      <div class="orbit-particle particle-3"></div>
    </div>

    <!-- Shooting Stars -->
    <div class="shooting-star shooting-star-1"></div>
    <div class="shooting-star shooting-star-2"></div>
    <div class="shooting-star shooting-star-3"></div>

    <!-- Central Content -->
    <div class="content">
      <div class="greeting-wrapper">
        <div class="greeting-glow"></div>
        <h1 class="greeting">
          <span class="greeting-hello" class:greeting-transitioning={isGreetingTransitioning}
            >{timeGreeting},</span
          >
          <span class="greeting-name">{firstName}</span>
        </h1>
      </div>

      <p class="compliment">
        {#if showPWAButton}
          {selectedCompliment}
        {:else}
          Remember, {selectedCompliment}
        {/if}
      </p>

      {#if showPWAButton}
        <button class="pwa-button" onclick={() => (isPWAModalOpen = true)}>
          <span class="pwa-button-text">See how</span>
          <span class="pwa-button-glow"></span>
        </button>
      {/if}

      <!-- Decorative constellation -->
      <div class="constellation">
        <span class="star star-1"></span>
        <span class="star star-2"></span>
        <span class="star star-3"></span>
        <span class="star star-4"></span>
        <span class="star star-5"></span>
        <svg class="constellation-lines" viewBox="0 0 200 100" fill="none">
          <path
            d="M20 50 L80 30 L140 55 L180 25"
            stroke="url(#constellationGrad)"
            stroke-width="1"
            opacity="0.3"
          />
          <path
            d="M80 30 L100 70"
            stroke="url(#constellationGrad)"
            stroke-width="1"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="constellationGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#6c5ce7" />
              <stop offset="50%" stop-color="#ff79c6" />
              <stop offset="100%" stop-color="#26de81" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>

    <!-- Floating Particles -->
    <div class="particles">
      {#each Array(20) as _, i}
        <span
          class="particle"
          style="
            --delay: {Math.random() * 5}s;
            --duration: {5 + Math.random() * 10}s;
            --x-start: {Math.random() * 100}%;
            --y-start: {Math.random() * 100}%;
            --size: {2 + Math.random() * 4}px;
            --opacity: {0.3 + Math.random() * 0.5};
          "
        ></span>
      {/each}
    </div>
  </div>

  <PWAInstallModal bind:open={isPWAModalOpen} onClose={() => (isPWAModalOpen = false)} />
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOADING SCREEN
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-void);
  }

  .loading-orb {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--gradient-primary);
    box-shadow:
      0 0 60px var(--color-primary-glow),
      0 0 120px var(--color-primary-glow);
    animation: loadingPulse 1.5s ease-in-out infinite;
  }

  @keyframes loadingPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0.7;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HOME CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .home-container {
    position: fixed;
    /* Fill entire screen below the navbar */
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(
      ellipse at center,
      rgba(15, 15, 35, 1) 0%,
      rgba(5, 5, 16, 1) 50%,
      rgba(0, 0, 5, 1) 100%
    );
    background-attachment: fixed;
    /* Offset upward to account for navbar (64px desktop) and appear truly centered */
    padding-top: 64px;
  }

  /* Mobile: account for bottom navbar instead */
  @media (max-width: 768px) {
    .home-container {
      padding-top: 0;
      /* Mobile has top island header + bottom nav, roughly balanced */
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STAR FIELD
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .starfield {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .stars {
    position: absolute;
    inset: 0;
    background-repeat: repeat;
  }

  .stars-small {
    background-image:
      radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.8) 0%, transparent 100%),
      radial-gradient(1px 1px at 30% 70%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 50% 10%, rgba(255, 255, 255, 0.7) 0%, transparent 100%),
      radial-gradient(1px 1px at 70% 50%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 90% 80%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 15% 90%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 85% 15%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 45% 45%, rgba(255, 255, 255, 0.6) 0%, transparent 100%);
    background-size: 200px 200px;
    animation: starsDrift 100s linear infinite;
  }

  .stars-medium {
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(108, 92, 231, 0.9) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 60% 80%, rgba(255, 121, 198, 0.8) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 80% 20%, rgba(38, 222, 129, 0.7) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 40% 60%, rgba(0, 212, 255, 0.6) 0%, transparent 100%);
    background-size: 300px 300px;
    animation: starsDrift 150s linear infinite reverse;
  }

  .stars-large {
    background-image:
      radial-gradient(2px 2px at 25% 25%, rgba(255, 255, 255, 1) 0%, transparent 100%),
      radial-gradient(2.5px 2.5px at 75% 75%, rgba(108, 92, 231, 1) 0%, transparent 100%),
      radial-gradient(2px 2px at 50% 90%, rgba(255, 121, 198, 0.9) 0%, transparent 100%);
    background-size: 400px 400px;
    animation:
      starsTwinkle 4s ease-in-out infinite,
      starsDrift 200s linear infinite;
  }

  @keyframes starsDrift {
    from {
      transform: translateY(0) translateX(0);
    }
    to {
      transform: translateY(-100px) translateX(-50px);
    }
  }

  @keyframes starsTwinkle {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NEBULA EFFECTS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.4;
    pointer-events: none;
  }

  .nebula-1 {
    width: 600px;
    height: 600px;
    top: -200px;
    right: -150px;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.5) 0%, transparent 70%);
    animation:
      nebulaPulse 8s ease-in-out infinite,
      nebulaFloat 20s ease-in-out infinite;
  }

  .nebula-2 {
    width: 500px;
    height: 500px;
    bottom: -150px;
    left: -100px;
    background: radial-gradient(ellipse, rgba(255, 121, 198, 0.4) 0%, transparent 70%);
    animation:
      nebulaPulse 10s ease-in-out infinite 2s,
      nebulaFloat 25s ease-in-out infinite reverse;
  }

  .nebula-3 {
    width: 400px;
    height: 400px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse, rgba(38, 222, 129, 0.2) 0%, transparent 70%);
    animation: nebulaPulse 12s ease-in-out infinite 4s;
  }

  @keyframes nebulaPulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.1);
    }
  }

  @keyframes nebulaFloat {
    0%,
    100% {
      transform: translate(0, 0);
    }
    33% {
      transform: translate(30px, -20px);
    }
    66% {
      transform: translate(-20px, 30px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ORBITAL SYSTEM
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .orbital-system {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    border: 1px solid rgba(108, 92, 231, 0.15);
    transform: translate(-50%, -50%);
  }

  .orbit-1 {
    width: 300px;
    height: 300px;
    animation: orbitRotate 30s linear infinite;
  }

  .orbit-2 {
    width: 500px;
    height: 500px;
    border-color: rgba(255, 121, 198, 0.1);
    animation: orbitRotate 50s linear infinite reverse;
  }

  .orbit-3 {
    width: 700px;
    height: 700px;
    border-color: rgba(38, 222, 129, 0.08);
    animation: orbitRotate 70s linear infinite;
  }

  @keyframes orbitRotate {
    from {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  .orbit-particle {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    top: 50%;
    left: 50%;
  }

  .particle-1 {
    background: var(--color-primary);
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 0 30px var(--color-primary-glow);
    animation: orbitParticle1 30s linear infinite;
  }

  .particle-2 {
    background: var(--color-accent);
    box-shadow:
      0 0 15px var(--color-accent-glow),
      0 0 30px var(--color-accent-glow);
    animation: orbitParticle2 50s linear infinite reverse;
    width: 4px;
    height: 4px;
  }

  .particle-3 {
    background: var(--color-success);
    box-shadow:
      0 0 15px var(--color-success-glow),
      0 0 30px var(--color-success-glow);
    animation: orbitParticle3 70s linear infinite;
    width: 5px;
    height: 5px;
  }

  @keyframes orbitParticle1 {
    from {
      transform: rotate(0deg) translateX(150px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(150px) rotate(-360deg);
    }
  }

  @keyframes orbitParticle2 {
    from {
      transform: rotate(0deg) translateX(250px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(250px) rotate(-360deg);
    }
  }

  @keyframes orbitParticle3 {
    from {
      transform: rotate(0deg) translateX(350px) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(350px) rotate(-360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SHOOTING STARS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .shooting-star {
    position: absolute;
    width: 100px;
    height: 2px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.8) 50%,
      rgba(108, 92, 231, 1) 100%
    );
    border-radius: 100px;
    opacity: 0;
    pointer-events: none;
  }

  .shooting-star-1 {
    top: 15%;
    left: 10%;
    transform: rotate(-35deg);
    animation: shootingStar 8s ease-in-out infinite;
  }

  .shooting-star-2 {
    top: 35%;
    right: 20%;
    transform: rotate(-40deg);
    animation: shootingStar 12s ease-in-out infinite 3s;
  }

  .shooting-star-3 {
    bottom: 30%;
    left: 30%;
    transform: rotate(-30deg);
    animation: shootingStar 10s ease-in-out infinite 6s;
  }

  @keyframes shootingStar {
    0%,
    90%,
    100% {
      opacity: 0;
      transform: rotate(-35deg) translateX(0);
    }
    92% {
      opacity: 1;
    }
    95% {
      opacity: 1;
      transform: rotate(-35deg) translateX(300px);
    }
    96% {
      opacity: 0;
      transform: rotate(-35deg) translateX(350px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CENTRAL CONTENT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content {
    position: relative;
    z-index: 10;
    text-align: center;
    padding: 2rem;
    animation: contentReveal 1.2s ease-out forwards;
  }

  @keyframes contentReveal {
    0% {
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .greeting-wrapper {
    position: relative;
    display: inline-block;
    margin-bottom: 1.5rem;
  }

  .greeting-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    height: 150px;
    background: radial-gradient(
      ellipse,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.1) 50%,
      transparent 70%
    );
    filter: blur(40px);
    animation: greetingGlow 4s ease-in-out infinite;
  }

  @keyframes greetingGlow {
    0%,
    100% {
      opacity: 0.6;
      transform: translate(-50%, -50%) scale(1);
    }
    50% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.2);
    }
  }

  .greeting {
    position: relative;
    font-size: clamp(2.5rem, 8vw, 5rem);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .greeting-hello {
    color: var(--color-text-secondary);
    font-size: 0.5em;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 0.3s forwards;
    transition:
      opacity 0.3s ease-out,
      transform 0.3s ease-out;
  }

  /* Subtle fade transition when time greeting changes */
  .greeting-hello.greeting-transitioning {
    opacity: 0 !important;
    transform: translateY(-4px);
  }

  .greeting-name {
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 25%,
      var(--color-accent) 50%,
      var(--color-primary-light) 75%,
      var(--color-text) 100%
    );
    background-size: 300% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation:
      nameShimmer 8s linear infinite,
      fadeSlideIn 0.8s ease-out 0.5s forwards;
    opacity: 0;
    text-shadow: 0 0 80px rgba(108, 92, 231, 0.5);
  }

  @keyframes nameShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 300% center;
    }
  }

  @keyframes fadeSlideIn {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .compliment {
    font-size: clamp(1.125rem, 3vw, 1.5rem);
    color: var(--color-text-muted);
    font-weight: 500;
    letter-spacing: 0.01em;
    max-width: 500px;
    margin: 0 auto;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 0.8s forwards;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PWA INSTALL BUTTON
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .pwa-button {
    position: relative;
    margin-top: 1.25rem;
    padding: 0.75rem 1.75rem;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--color-text);
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.25) 0%, rgba(108, 92, 231, 0.1) 100%);
    border: 1px solid rgba(108, 92, 231, 0.4);
    border-radius: var(--radius-xl);
    cursor: pointer;
    overflow: hidden;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 1s forwards;
    transition: all 0.3s var(--ease-spring);
    box-shadow:
      0 0 20px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .pwa-button:hover {
    transform: translateY(-2px) scale(1.02);
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.35) 0%, rgba(108, 92, 231, 0.15) 100%);
    border-color: rgba(108, 92, 231, 0.6);
    box-shadow:
      0 0 30px rgba(108, 92, 231, 0.3),
      0 10px 40px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .pwa-button:active {
    transform: translateY(0) scale(0.98);
  }

  .pwa-button-text {
    position: relative;
    z-index: 1;
  }

  .pwa-button-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 100% 100% at 50% 0%,
      rgba(108, 92, 231, 0.4) 0%,
      transparent 70%
    );
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .pwa-button:hover .pwa-button-glow {
    opacity: 1;
    animation: buttonGlowPulse 2s ease-in-out infinite;
  }

  @keyframes buttonGlowPulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONSTELLATION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .constellation {
    position: relative;
    width: 200px;
    height: 100px;
    margin: 3rem auto 0;
    opacity: 0;
    animation: fadeSlideIn 0.8s ease-out 1s forwards;
  }

  .constellation-lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .star {
    position: absolute;
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
    animation: starPulse 2s ease-in-out infinite;
  }

  .star-1 {
    left: 10%;
    top: 50%;
    animation-delay: 0s;
  }
  .star-2 {
    left: 40%;
    top: 30%;
    animation-delay: 0.3s;
  }
  .star-3 {
    left: 50%;
    top: 70%;
    animation-delay: 0.6s;
    width: 3px;
    height: 3px;
  }
  .star-4 {
    left: 70%;
    top: 55%;
    animation-delay: 0.9s;
  }
  .star-5 {
    left: 90%;
    top: 25%;
    animation-delay: 1.2s;
    width: 3px;
    height: 3px;
  }

  @keyframes starPulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.3);
      box-shadow: 0 0 20px rgba(255, 255, 255, 1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FLOATING PARTICLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .particle {
    position: absolute;
    left: var(--x-start);
    top: var(--y-start);
    width: var(--size);
    height: var(--size);
    background: white;
    border-radius: 50%;
    opacity: var(--opacity);
    animation: particleFloat var(--duration) ease-in-out var(--delay) infinite;
  }

  @keyframes particleFloat {
    0%,
    100% {
      transform: translateY(0) translateX(0);
      opacity: var(--opacity);
    }
    25% {
      transform: translateY(-30px) translateX(15px);
    }
    50% {
      transform: translateY(-50px) translateX(-10px);
      opacity: calc(var(--opacity) * 1.5);
    }
    75% {
      transform: translateY(-20px) translateX(20px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* Tablet - still has top navbar */
  @media (max-width: 768px) {
    .orbit-1 {
      width: 200px;
      height: 200px;
    }
    .orbit-2 {
      width: 350px;
      height: 350px;
    }
    .orbit-3 {
      width: 500px;
      height: 500px;
    }

    @keyframes orbitParticle1 {
      from {
        transform: rotate(0deg) translateX(100px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(100px) rotate(-360deg);
      }
    }

    @keyframes orbitParticle2 {
      from {
        transform: rotate(0deg) translateX(175px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(175px) rotate(-360deg);
      }
    }

    @keyframes orbitParticle3 {
      from {
        transform: rotate(0deg) translateX(250px) rotate(0deg);
      }
      to {
        transform: rotate(360deg) translateX(250px) rotate(-360deg);
      }
    }

    .nebula-1 {
      width: 400px;
      height: 400px;
    }
    .nebula-2 {
      width: 350px;
      height: 350px;
    }
    .nebula-3 {
      width: 300px;
      height: 300px;
    }

    .content {
      padding: 1.5rem;
    }

    .constellation {
      width: 150px;
      height: 75px;
      margin-top: 2rem;
    }
  }

  @media (max-width: 480px) {
    .shooting-star {
      width: 60px;
    }

    .greeting-glow {
      width: 200px;
      height: 100px;
    }

    .pwa-button {
      padding: 0.625rem 1.5rem;
      font-size: 0.875rem;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .stars,
    .nebula,
    .orbit,
    .orbit-particle,
    .shooting-star,
    .particle,
    .star,
    .greeting-glow,
    .pwa-button-glow {
      animation: none;
    }

    .greeting-name {
      animation: fadeSlideIn 0.8s ease-out 0.5s forwards;
    }

    .greeting-hello,
    .compliment,
    .constellation,
    .pwa-button {
      animation: fadeSlideIn 0.5s ease-out forwards;
      opacity: 1;
    }
  }
</style>
