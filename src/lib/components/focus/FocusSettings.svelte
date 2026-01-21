<script lang="ts">
  import type { FocusSettings } from '$lib/types';

  interface Props {
    settings: FocusSettings | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<FocusSettings>) => void;
  }

  let { settings, isOpen, onClose, onSave }: Props = $props();

  // Local state for form
  let focusDuration = $state(settings?.focus_duration || 25);
  let breakDuration = $state(settings?.break_duration || 5);
  let longBreakDuration = $state(settings?.long_break_duration || 15);
  let cyclesBeforeLongBreak = $state(settings?.cycles_before_long_break || 4);
  let autoStartBreaks = $state(settings?.auto_start_breaks || false);
  let autoStartFocus = $state(settings?.auto_start_focus || false);

  // Update local state when settings change
  $effect(() => {
    if (settings) {
      focusDuration = settings.focus_duration;
      breakDuration = settings.break_duration;
      longBreakDuration = settings.long_break_duration;
      cyclesBeforeLongBreak = settings.cycles_before_long_break;
      autoStartBreaks = settings.auto_start_breaks;
      autoStartFocus = settings.auto_start_focus;
    }
  });

  function handleSave() {
    onSave({
      focus_duration: focusDuration,
      break_duration: breakDuration,
      long_break_duration: longBreakDuration,
      cycles_before_long_break: cyclesBeforeLongBreak,
      auto_start_breaks: autoStartBreaks,
      auto_start_focus: autoStartFocus
    });
    onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal">
      <div class="modal-header">
        <h2>Focus Settings</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Focus Duration -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="label-text">Focus Duration</span>
            <span class="label-value">{focusDuration} min</span>
          </label>
          <input
            type="range"
            min="15"
            max="240"
            step="15"
            bind:value={focusDuration}
            class="slider"
          />
        </div>

        <!-- Break Duration -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="label-text">Short Break</span>
            <span class="label-value">{breakDuration} min</span>
          </label>
          <input
            type="range"
            min="3"
            max="20"
            step="1"
            bind:value={breakDuration}
            class="slider break"
          />
        </div>

        <!-- Long Break Duration -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="label-text">Long Break</span>
            <span class="label-value">{longBreakDuration} min</span>
          </label>
          <input
            type="range"
            min="10"
            max="60"
            step="5"
            bind:value={longBreakDuration}
            class="slider long-break"
          />
        </div>

        <!-- Cycles Before Long Break -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="label-text">Cycles Before Long Break</span>
            <span class="label-value">{cyclesBeforeLongBreak}</span>
          </label>
          <input
            type="range"
            min="2"
            max="6"
            step="1"
            bind:value={cyclesBeforeLongBreak}
            class="slider"
          />
        </div>

        <hr class="divider"/>

        <!-- Auto-start toggles -->
        <div class="setting-group toggle-group">
          <label class="toggle-label">
            <span class="label-text">Auto-start Breaks</span>
            <span class="label-desc">Automatically start break timer after focus</span>
          </label>
          <button
            class="toggle-btn"
            class:active={autoStartBreaks}
            onclick={() => autoStartBreaks = !autoStartBreaks}
            aria-pressed={autoStartBreaks}
          >
            <span class="toggle-knob"></span>
          </button>
        </div>

        <div class="setting-group toggle-group">
          <label class="toggle-label">
            <span class="label-text">Auto-start Focus</span>
            <span class="label-desc">Automatically start focus timer after break</span>
          </label>
          <button
            class="toggle-btn"
            class:active={autoStartFocus}
            onclick={() => autoStartFocus = !autoStartFocus}
            aria-pressed={autoStartFocus}
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={onClose}>Cancel</button>
        <button class="btn btn-primary" onclick={handleSave}>Save Settings</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: calc(64px + 1.5rem) 1.5rem 1.5rem 1.5rem;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: fadeIn 0.2s ease-out;
    overflow-y: auto;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    width: 100%;
    max-width: 420px;
    max-height: calc(100vh - 64px - 3rem);
    overflow-y: auto;
    background: linear-gradient(135deg, rgba(20, 20, 35, 0.98) 0%, rgba(15, 15, 26, 0.98) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-xl);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px var(--color-primary-glow);
    animation: modalSlideIn 0.3s var(--ease-spring);
    margin-bottom: 1.5rem;
    flex-shrink: 0;
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
  }

  .modal-header h2 {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .setting-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .label-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-primary-light);
  }

  /* Slider styles */
  .slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(108, 92, 231, 0.2);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--gradient-primary);
    cursor: pointer;
    box-shadow: 0 2px 8px var(--color-primary-glow);
    transition: transform 0.2s;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .slider.break::-webkit-slider-thumb {
    background: linear-gradient(135deg, #26de81 0%, #00d4ff 100%);
    box-shadow: 0 2px 8px rgba(38, 222, 129, 0.5);
  }

  .slider.long-break::-webkit-slider-thumb {
    background: linear-gradient(135deg, #00d4ff 0%, #6c5ce7 100%);
    box-shadow: 0 2px 8px rgba(0, 212, 255, 0.5);
  }

  .divider {
    border: none;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
    margin: 0.5rem 0;
  }

  /* Toggle styles */
  .toggle-group {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .label-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .toggle-btn {
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: 14px;
    background: rgba(108, 92, 231, 0.2);
    border: 1px solid rgba(108, 92, 231, 0.3);
    cursor: pointer;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .toggle-btn.active {
    background: var(--gradient-primary);
    border-color: transparent;
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    transition: transform 0.3s var(--ease-spring);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-btn.active .toggle-knob {
    transform: translateX(20px);
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .btn {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-secondary {
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    color: var(--color-text);
  }

  .btn-secondary:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .btn-primary {
    background: var(--gradient-primary);
    border: none;
    color: white;
    box-shadow: 0 4px 12px var(--color-primary-glow);
  }

  .btn-primary:hover {
    box-shadow: 0 6px 20px var(--color-primary-glow);
    transform: translateY(-1px);
  }

  /* Tablet responsive toggles */
  @media (min-width: 641px) and (max-width: 900px) {
    .modal-backdrop {
      padding: calc(64px + 1rem) 1rem 1rem 1rem;
    }

    .modal {
      max-height: calc(100vh - 64px - 2rem);
    }

    .toggle-btn {
      width: 44px;
      height: 26px;
    }

    .toggle-knob {
      width: 20px;
      height: 20px;
    }

    .toggle-btn.active .toggle-knob {
      transform: translateX(18px);
    }
  }

  /* Mobile */
  @media (max-width: 640px) {
    .modal-backdrop {
      padding: calc(env(safe-area-inset-top, 20px) + 1rem) 1rem calc(80px + env(safe-area-inset-bottom, 0) + 1rem) 1rem;
      align-items: center;
    }

    .modal {
      max-width: 100%;
      max-height: calc(100vh - env(safe-area-inset-top, 20px) - 80px - env(safe-area-inset-bottom, 0) - 2rem);
      margin-bottom: 0;
    }
  }
</style>
