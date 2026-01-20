<script lang="ts">
  import { fade, scale } from 'svelte/transition';

  interface Props {
    open: boolean;
    title: string;
    onClose: () => void;
    children?: import('svelte').Snippet;
  }

  let { open, title, onClose, children }: Props = $props();

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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop"
    transition:fade={{ duration: 150 }}
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="modal" transition:scale={{ duration: 150, start: 0.95 }}>
      <div class="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">×</button>
      </div>
      <div class="modal-content">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 100% 100% at 50% 0%, rgba(108, 92, 231, 0.1) 0%, transparent 50%),
      radial-gradient(ellipse at center, rgba(5, 5, 16, 0.9) 0%, rgba(0, 0, 0, 0.98) 100%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    z-index: 1000;
  }

  .modal {
    background: linear-gradient(165deg,
      rgba(20, 20, 40, 0.98) 0%,
      rgba(15, 15, 30, 0.95) 50%,
      rgba(20, 20, 40, 0.98) 100%);
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-2xl);
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 30px 60px -15px rgba(0, 0, 0, 0.6),
      0 0 100px rgba(108, 92, 231, 0.2),
      0 0 200px rgba(108, 92, 231, 0.1);
    position: relative;
    animation: modalAppear 0.4s var(--ease-spring);
  }

  @keyframes modalAppear {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* Top glow line */
  .modal::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.6),
      rgba(255, 255, 255, 0.4),
      rgba(255, 121, 198, 0.5),
      transparent);
    border-radius: var(--radius-full);
    animation: glowPulse 3s ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
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
      radial-gradient(ellipse at 30% 20%, rgba(108, 92, 231, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 80%, rgba(38, 222, 129, 0.04) 0%, transparent 40%),
      radial-gradient(ellipse at 50% 50%, rgba(255, 121, 198, 0.03) 0%, transparent 60%);
    pointer-events: none;
    animation: nebulaFloat 20s ease-in-out infinite;
  }

  @keyframes nebulaFloat {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(-5%, 5%) rotate(5deg); }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.75rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
    background: linear-gradient(180deg,
      rgba(108, 92, 231, 0.1) 0%,
      rgba(108, 92, 231, 0.02) 100%);
    position: relative;
    z-index: 1;
  }

  .modal-header h2 {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: textShimmer 6s linear infinite;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .close-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    color: var(--color-text-muted);
    border: 1px solid transparent;
    background: rgba(108, 92, 231, 0.05);
  }

  .close-btn:hover {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.25) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.4);
    color: var(--color-red);
    transform: rotate(90deg) scale(1.1);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  }

  .modal-content {
    padding: 1.75rem;
    overflow-y: auto;
    position: relative;
    z-index: 1;
  }

  @media (max-width: 640px) {
    .modal {
      max-width: 100%;
      max-height: 85vh;
      border-radius: var(--radius-xl);
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
    }

    .modal-content {
      padding: 1.5rem;
    }
  }
</style>
