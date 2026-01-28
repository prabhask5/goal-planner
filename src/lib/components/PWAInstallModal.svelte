<script lang="ts">
  import Modal from './Modal.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open = $bindable(), onClose }: Props = $props();

  type Platform = 'android' | 'ios';
  let selectedPlatform = $state<Platform>('android');
</script>

<Modal {open} title="Install Stellar" {onClose}>
  <div class="pwa-install-content">
    <p class="intro">
      Add Stellar to your home screen for quick access and an app-like experience.
    </p>

    <!-- Platform Selector -->
    <div class="platform-selector">
      <button
        class="platform-tab"
        class:active={selectedPlatform === 'android'}
        onclick={() => (selectedPlatform = 'android')}
      >
        <svg class="platform-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17.523 2.047a.5.5 0 0 0-.866.5l.857 1.485c-1.396.615-2.479 1.643-3.014 2.968h-5c-.535-1.325-1.618-2.353-3.014-2.968l.857-1.485a.5.5 0 0 0-.866-.5l-.97 1.68C4.195 4.715 3.5 6.062 3.5 7.5V8h17v-.5c0-1.438-.695-2.785-2.007-3.773l-.97-1.68zM8 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"
          />
          <path
            d="M3.5 9v10.5A1.5 1.5 0 0 0 5 21h1V9H3.5zm15.5 0v12h1a1.5 1.5 0 0 0 1.5-1.5V9H19zm-11 0v12h8V9H8z"
          />
        </svg>
        <span>Android</span>
      </button>
      <button
        class="platform-tab"
        class:active={selectedPlatform === 'ios'}
        onclick={() => (selectedPlatform = 'ios')}
      >
        <svg class="platform-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
          />
        </svg>
        <span>iOS</span>
      </button>
    </div>

    <!-- Instructions -->
    <div class="instructions">
      {#if selectedPlatform === 'android'}
        <div class="instruction-card">
          <div class="step-number">1</div>
          <div class="step-content">
            <p class="step-title">Open in Chrome</p>
            <p class="step-desc">Open this website in Chrome, Firefox, or Edge.</p>
          </div>
        </div>
        <div class="instruction-card">
          <div class="step-number">2</div>
          <div class="step-content">
            <p class="step-title">Open menu</p>
            <p class="step-desc">
              Tap the <strong>three-dot menu</strong> in the upper-right corner.
            </p>
          </div>
        </div>
        <div class="instruction-card">
          <div class="step-number">3</div>
          <div class="step-content">
            <p class="step-title">Add to Home screen</p>
            <p class="step-desc">Select <strong>"Add to Home screen"</strong> from the menu.</p>
          </div>
        </div>
        <div class="instruction-card">
          <div class="step-number">4</div>
          <div class="step-content">
            <p class="step-title">Confirm</p>
            <p class="step-desc">
              Tap <strong>"Add"</strong> in the pop-up to place Stellar on your home screen.
            </p>
          </div>
        </div>
      {:else}
        <div class="instruction-card">
          <div class="step-number">1</div>
          <div class="step-content">
            <p class="step-title">Open in Safari</p>
            <p class="step-desc">
              Open this website in Safari (or Chrome/Edge/Firefox on iOS 16.4+).
            </p>
          </div>
        </div>
        <div class="instruction-card">
          <div class="step-number">2</div>
          <div class="step-content">
            <p class="step-title">Tap Share</p>
            <p class="step-desc">
              Tap the <strong>Share button</strong> (square with an upward arrow) at the bottom.
            </p>
          </div>
        </div>
        <div class="instruction-card">
          <div class="step-number">3</div>
          <div class="step-content">
            <p class="step-title">Add to Home Screen</p>
            <p class="step-desc">Scroll down and select <strong>"Add to Home Screen"</strong>.</p>
          </div>
        </div>
        <div class="instruction-card">
          <div class="step-number">4</div>
          <div class="step-content">
            <p class="step-title">Confirm</p>
            <p class="step-desc">Tap <strong>"Add"</strong> in the top right corner to finish.</p>
          </div>
        </div>
      {/if}
    </div>

    <div class="footer-note">
      <div class="glow-dot"></div>
      <span>Stellar will launch like a native app from your home screen</span>
    </div>
  </div>
</Modal>

<style>
  .pwa-install-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .intro {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.6;
    text-align: center;
    margin: 0;
  }

  /* Platform Selector */
  .platform-selector {
    display: flex;
    gap: 0.75rem;
    padding: 0.375rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-xl);
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .platform-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-lg);
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .platform-tab:hover:not(.active) {
    color: var(--color-text-secondary);
    background: rgba(108, 92, 231, 0.05);
  }

  .platform-tab.active {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.3) 0%, rgba(108, 92, 231, 0.15) 100%);
    border-color: rgba(108, 92, 231, 0.4);
    color: var(--color-text);
    box-shadow:
      0 0 20px rgba(108, 92, 231, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .platform-icon {
    width: 18px;
    height: 18px;
    transition: transform 0.3s var(--ease-spring);
  }

  .platform-tab.active .platform-icon {
    transform: scale(1.1);
  }

  /* Instructions */
  .instructions {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .instruction-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.08) 0%, rgba(108, 92, 231, 0.02) 100%);
    border: 1px solid rgba(108, 92, 231, 0.12);
    border-radius: var(--radius-lg);
    transition: all 0.3s ease;
  }

  .instruction-card:hover {
    border-color: rgba(108, 92, 231, 0.25);
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.12) 0%, rgba(108, 92, 231, 0.04) 100%);
    transform: translateX(4px);
  }

  .step-number {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    border-radius: 50%;
    font-size: 0.85rem;
    font-weight: 700;
    color: white;
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .step-content {
    flex: 1;
    min-width: 0;
  }

  .step-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 0.25rem 0;
    line-height: 1.3;
  }

  .step-desc {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .step-desc strong {
    color: var(--color-primary-light);
    font-weight: 600;
  }

  /* Footer Note */
  .footer-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.1) 0%, rgba(38, 222, 129, 0.03) 100%);
    border: 1px solid rgba(38, 222, 129, 0.2);
    border-radius: var(--radius-lg);
    font-size: 0.85rem;
    color: var(--color-success);
  }

  .glow-dot {
    width: 8px;
    height: 8px;
    background: var(--color-success);
    border-radius: 50%;
    box-shadow: 0 0 10px var(--color-success-glow);
    animation: dotPulse 2s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  /* Mobile Adjustments */
  @media (max-width: 480px) {
    .platform-tab {
      padding: 0.625rem 0.75rem;
      font-size: 0.85rem;
    }

    .platform-icon {
      width: 16px;
      height: 16px;
    }

    .instruction-card {
      padding: 0.875rem 1rem;
    }

    .step-number {
      width: 24px;
      height: 24px;
      font-size: 0.8rem;
    }

    .step-title {
      font-size: 0.9rem;
    }

    .step-desc {
      font-size: 0.8rem;
    }

    .footer-note {
      font-size: 0.8rem;
      padding: 0.75rem;
    }
  }
</style>
