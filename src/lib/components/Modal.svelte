<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';

  interface Props {
    open: boolean;
    title: string;
    onClose: () => void;
    children?: import('svelte').Snippet;
    /** Use sheet-style on mobile (slides up from bottom) */
    mobileSheet?: boolean;
  }

  let { open, title, onClose, children, mobileSheet = true }: Props = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  // Check if mobile
  let isMobile = $state(false);
  $effect(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth <= 640;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop"
    class:mobile-sheet={mobileSheet && isMobile}
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 150 }}
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <!-- Depth layers for cinematic effect -->
    <div class="modal-depth-layer modal-depth-1"></div>
    <div class="modal-depth-layer modal-depth-2"></div>

    {#if mobileSheet && isMobile}
      <!-- Sheet-style modal for mobile -->
      <div
        class="modal-sheet"
        in:fly={{ y: 300, duration: 350, easing: backOut }}
        out:fly={{ y: 300, duration: 250, easing: cubicOut }}
      >
        <!-- Drag handle indicator -->
        <div class="sheet-handle">
          <div class="sheet-handle-bar"></div>
        </div>

        <div class="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button class="close-btn" onclick={onClose} aria-label="Close modal">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-content">
          {@render children?.()}
        </div>
      </div>
    {:else}
      <!-- Centered modal for desktop/tablet -->
      <div
        class="modal"
        in:fly={{ y: 30, duration: 350, easing: backOut }}
        out:fly={{ y: -10, duration: 200, easing: cubicOut }}
      >
        <div class="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button class="close-btn" onclick={onClose} aria-label="Close modal">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-content">
          {@render children?.()}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    /* Account for navbar height (64px) + gap */
    padding: calc(64px + 1.5rem) 1.5rem 1.5rem 1.5rem;
    z-index: 1000;
    overflow-y: auto;
  }

  /* Sheet-style backdrop on mobile */
  .modal-backdrop.mobile-sheet {
    align-items: flex-end;
    padding: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  /* Depth layers for parallax/3D effect */
  .modal-depth-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
  }

  .modal-depth-1 {
    background: radial-gradient(
      ellipse 120% 60% at 50% 0%,
      rgba(108, 92, 231, 0.08) 0%,
      transparent 60%
    );
    animation: depthFloat1 8s ease-in-out infinite;
  }

  .modal-depth-2 {
    background: radial-gradient(
      ellipse 80% 80% at 50% 100%,
      rgba(255, 121, 198, 0.05) 0%,
      transparent 50%
    );
    animation: depthFloat2 10s ease-in-out infinite reverse;
  }

  @keyframes depthFloat1 {
    0%,
    100% {
      transform: translateY(0) scale(1);
      opacity: 0.8;
    }
    50% {
      transform: translateY(-10px) scale(1.02);
      opacity: 1;
    }
  }

  @keyframes depthFloat2 {
    0%,
    100% {
      transform: translateY(0) scale(1);
      opacity: 0.6;
    }
    50% {
      transform: translateY(8px) scale(1.01);
      opacity: 0.8;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     CENTERED MODAL (Desktop/Tablet)
     ═══════════════════════════════════════════════════════════════════════════════ */

  .modal {
    background: linear-gradient(
      165deg,
      rgba(18, 18, 36, 0.98) 0%,
      rgba(12, 12, 26, 0.95) 50%,
      rgba(18, 18, 36, 0.98) 100%
    );
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl);
    width: 100%;
    max-width: 500px;
    max-height: calc(100vh - 64px - 3rem);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.04) inset,
      0 25px 50px -12px rgba(0, 0, 0, 0.6),
      0 0 80px rgba(108, 92, 231, 0.15),
      0 0 160px rgba(108, 92, 231, 0.08);
    position: relative;
    margin-bottom: 1.5rem;
    flex-shrink: 0;
  }

  /* Top glow line */
  .modal::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 255, 255, 0.3),
      rgba(255, 121, 198, 0.4),
      transparent
    );
    border-radius: var(--radius-full);
    animation: glowPulse 3s ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%,
    100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }

  /* Nebula background effect */
  .modal::after {
    content: '';
    position: absolute;
    top: -100%;
    left: -50%;
    width: 200%;
    height: 300%;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(108, 92, 231, 0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 80%, rgba(38, 222, 129, 0.03) 0%, transparent 40%),
      radial-gradient(ellipse at 50% 50%, rgba(255, 121, 198, 0.02) 0%, transparent 60%);
    pointer-events: none;
    animation: nebulaFloat 20s ease-in-out infinite;
    z-index: 0;
  }

  @keyframes nebulaFloat {
    0%,
    100% {
      transform: translate(0, 0) rotate(0deg);
    }
    50% {
      transform: translate(-3%, 3%) rotate(3deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     SHEET-STYLE MODAL (Mobile)
     ═══════════════════════════════════════════════════════════════════════════════ */

  .modal-sheet {
    background: linear-gradient(180deg, rgba(18, 18, 36, 0.98) 0%, rgba(12, 12, 26, 0.99) 100%);
    backdrop-filter: blur(40px) saturate(200%);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-bottom: none;
    border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top, 60px) - 20px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 -20px 60px rgba(0, 0, 0, 0.5),
      0 0 100px rgba(108, 92, 231, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    position: relative;
    /* Account for home indicator */
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  /* Top glow line for sheet */
  .modal-sheet::before {
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
    border-radius: var(--radius-full);
  }

  /* Drag handle */
  .sheet-handle {
    display: flex;
    justify-content: center;
    padding: 12px 0 8px;
    cursor: grab;
  }

  .sheet-handle-bar {
    width: 36px;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-full);
    transition: all 0.2s;
  }

  .sheet-handle:hover .sheet-handle-bar {
    background: rgba(255, 255, 255, 0.35);
    transform: scaleX(1.1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     MODAL HEADER
     ═══════════════════════════════════════════════════════════════════════════════ */

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.12);
    background: linear-gradient(180deg, rgba(108, 92, 231, 0.08) 0%, transparent 100%);
    position: relative;
    z-index: 1;
  }

  .modal-sheet .modal-header {
    padding: 0.75rem 1.25rem 1rem;
  }

  .modal-header h2 {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: textShimmer 6s linear infinite;
  }

  @keyframes textShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    color: var(--color-text-muted);
    border: 1px solid transparent;
    background: rgba(108, 92, 231, 0.08);
  }

  .close-btn:hover {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.2) 0%,
      rgba(255, 107, 107, 0.08) 100%
    );
    border-color: rgba(255, 107, 107, 0.35);
    color: var(--color-red);
    transform: rotate(90deg) scale(1.1);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.25);
  }

  .close-btn:active {
    transform: rotate(90deg) scale(0.95);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     MODAL CONTENT
     ═══════════════════════════════════════════════════════════════════════════════ */

  .modal-content {
    padding: 1.5rem;
    overflow-y: auto;
    position: relative;
    z-index: 1;
    flex: 1;
  }

  .modal-sheet .modal-content {
    padding: 1.25rem;
    /* Extra padding at bottom for home indicator */
    padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0));
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     RESPONSIVE ADJUSTMENTS
     ═══════════════════════════════════════════════════════════════════════════════ */

  /* Tablet */
  @media (min-width: 641px) and (max-width: 900px) {
    .modal-backdrop {
      padding: calc(64px + 1rem) 1rem 1rem 1rem;
    }

    .modal {
      max-height: calc(100vh - 64px - 2rem);
    }
  }

  /* Mobile - when not using sheet style */
  @media (max-width: 640px) {
    .modal-backdrop:not(.mobile-sheet) {
      padding: calc(env(safe-area-inset-top, 20px) + 1rem) 0.75rem
        calc(80px + env(safe-area-inset-bottom, 0) + 1rem) 0.75rem;
      align-items: center;
    }

    .modal {
      max-width: 100%;
      max-height: calc(
        100dvh - env(safe-area-inset-top, 20px) - 100px - env(safe-area-inset-bottom, 0)
      );
      border-radius: var(--radius-xl);
      margin-bottom: 0;
    }

    .modal-header {
      padding: 1rem 1.25rem;
    }

    .modal-header h2 {
      font-size: 1.125rem;
    }

    .modal-content {
      padding: 1.25rem;
    }
  }

  /* Very short viewports */
  @media (max-height: 600px) and (min-width: 641px) {
    .modal-backdrop {
      padding-top: calc(64px + 0.75rem);
      padding-bottom: 0.75rem;
    }

    .modal {
      max-height: calc(100vh - 64px - 1.5rem);
    }

    .modal-header {
      padding: 0.875rem 1.25rem;
    }

    .modal-content {
      padding: 1rem 1.25rem;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .modal::after,
    .modal-depth-1,
    .modal-depth-2 {
      animation: none;
    }

    .modal-header h2 {
      animation: none;
    }
  }
</style>
