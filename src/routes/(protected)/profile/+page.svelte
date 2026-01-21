<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { updateProfile, changePassword, getUserProfile } from '$lib/supabase/auth';
  import { authState, userDisplayInfo } from '$lib/stores/authState';
  import { isOnline } from '$lib/stores/network';

  // Form state
  let firstName = $state('');
  let lastName = $state('');
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');

  // UI state
  let profileLoading = $state(false);
  let passwordLoading = $state(false);
  let profileError = $state<string | null>(null);
  let profileSuccess = $state<string | null>(null);
  let passwordError = $state<string | null>(null);
  let passwordSuccess = $state<string | null>(null);

  // Get initial values from user data
  $effect(() => {
    if ($userDisplayInfo) {
      firstName = $userDisplayInfo.firstName;
      lastName = $userDisplayInfo.lastName;
    } else if ($page.data.session?.user) {
      const profile = getUserProfile($page.data.session.user);
      firstName = profile.firstName;
      lastName = profile.lastName;
    }
  });

  // Get email (read-only)
  const email = $derived(() => {
    if ($userDisplayInfo?.email) return $userDisplayInfo.email;
    return $page.data.session?.user?.email || '';
  });

  // Check if in offline mode
  const isOfflineMode = $derived($authState.mode === 'offline');

  async function handleProfileSubmit(e: Event) {
    e.preventDefault();
    if (isOfflineMode) {
      profileError = 'Profile changes require an internet connection';
      return;
    }

    profileLoading = true;
    profileError = null;
    profileSuccess = null;

    const result = await updateProfile(firstName.trim(), lastName.trim());

    if (result.error) {
      profileError = result.error;
    } else {
      profileSuccess = 'Profile updated successfully';
      setTimeout(() => profileSuccess = null, 3000);
    }

    profileLoading = false;
  }

  async function handlePasswordSubmit(e: Event) {
    e.preventDefault();
    if (isOfflineMode) {
      passwordError = 'Password changes require an internet connection';
      return;
    }

    // Validate
    if (newPassword !== confirmPassword) {
      passwordError = 'New passwords do not match';
      return;
    }

    if (newPassword.length < 6) {
      passwordError = 'New password must be at least 6 characters';
      return;
    }

    passwordLoading = true;
    passwordError = null;
    passwordSuccess = null;

    const result = await changePassword(currentPassword, newPassword);

    if (result.error) {
      passwordError = result.error;
    } else {
      passwordSuccess = 'Password changed successfully';
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      setTimeout(() => passwordSuccess = null, 3000);
    }

    passwordLoading = false;
  }

  function goBack() {
    goto('/tasks');
  }
</script>

<svelte:head>
  <title>Profile - Stellar</title>
</svelte:head>

<div class="profile-page">
  <!-- Header -->
  <header class="profile-header">
    <button class="back-btn" onclick={goBack}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5"/>
        <path d="M12 19l-7-7 7-7"/>
      </svg>
      <span>Back</span>
    </button>
    <h1 class="profile-title">Profile</h1>
    <div class="header-spacer"></div>
  </header>

  <!-- Offline Warning -->
  {#if isOfflineMode || !$isOnline}
    <div class="offline-warning">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
      <span>You're offline. Changes require an internet connection.</span>
    </div>
  {/if}

  <!-- Profile Avatar -->
  <div class="profile-avatar-section">
    <div class="avatar-container">
      <div class="avatar-ring"></div>
      <div class="avatar">
        {firstName.charAt(0).toUpperCase() || '?'}
      </div>
    </div>
    <div class="avatar-particles">
      {#each Array(6) as _, i}
        <span class="particle" style="--delay: {i * 0.5}s; --angle: {i * 60}deg;"></span>
      {/each}
    </div>
  </div>

  <!-- Profile Form Card -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Personal Information</h2>
      <p class="card-subtitle">Update your personal details</p>
    </div>

    <form onsubmit={handleProfileSubmit}>
      <div class="form-group">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          value={email()}
          disabled
          class="input-disabled"
        />
        <span class="input-hint">Email cannot be changed</span>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="firstName">First Name</label>
          <input
            type="text"
            id="firstName"
            bind:value={firstName}
            disabled={profileLoading || isOfflineMode}
            required
            placeholder="John"
          />
        </div>

        <div class="form-group">
          <label for="lastName">Last Name</label>
          <input
            type="text"
            id="lastName"
            bind:value={lastName}
            disabled={profileLoading || isOfflineMode}
            placeholder="Doe"
          />
        </div>
      </div>

      {#if profileError}
        <div class="message error">{profileError}</div>
      {/if}

      {#if profileSuccess}
        <div class="message success">{profileSuccess}</div>
      {/if}

      <button
        type="submit"
        class="btn btn-primary"
        disabled={profileLoading || isOfflineMode}
      >
        {#if profileLoading}
          <span class="loading-spinner"></span>
          Saving...
        {:else}
          Save Changes
        {/if}
      </button>
    </form>
  </div>

  <!-- Password Change Card -->
  <div class="profile-card">
    <div class="card-header">
      <h2 class="card-title">Change Password</h2>
      <p class="card-subtitle">Update your account password</p>
    </div>

    <form onsubmit={handlePasswordSubmit}>
      <div class="form-group">
        <label for="currentPassword">Current Password</label>
        <input
          type="password"
          id="currentPassword"
          bind:value={currentPassword}
          disabled={passwordLoading || isOfflineMode}
          required
          autocomplete="current-password"
        />
      </div>

      <div class="form-group">
        <label for="newPassword">New Password</label>
        <input
          type="password"
          id="newPassword"
          bind:value={newPassword}
          disabled={passwordLoading || isOfflineMode}
          required
          minlength="6"
          autocomplete="new-password"
          placeholder="Min 6 characters"
        />
      </div>

      <div class="form-group">
        <label for="confirmPassword">Confirm New Password</label>
        <input
          type="password"
          id="confirmPassword"
          bind:value={confirmPassword}
          disabled={passwordLoading || isOfflineMode}
          required
          autocomplete="new-password"
        />
      </div>

      {#if passwordError}
        <div class="message error">{passwordError}</div>
      {/if}

      {#if passwordSuccess}
        <div class="message success">{passwordSuccess}</div>
      {/if}

      <button
        type="submit"
        class="btn btn-secondary"
        disabled={passwordLoading || isOfflineMode}
      >
        {#if passwordLoading}
          <span class="loading-spinner"></span>
          Updating...
        {:else}
          Update Password
        {/if}
      </button>
    </form>
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     PROFILE PAGE - Space-themed layout
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-page {
    max-width: 600px;
    margin: 0 auto;
    padding-bottom: 2rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.2);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .back-btn:hover {
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.1);
    border-color: rgba(108, 92, 231, 0.2);
  }

  .profile-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }

  .header-spacer {
    width: 80px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     OFFLINE WARNING
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .offline-warning {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    margin-bottom: 1.5rem;
    background: rgba(255, 165, 2, 0.1);
    border: 1px solid rgba(255, 165, 2, 0.3);
    border-radius: var(--radius-lg);
    color: var(--color-orange);
    font-size: 0.875rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     AVATAR SECTION - Cosmic orb effect
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-avatar-section {
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
    padding: 1.5rem 0;
  }

  .avatar-container {
    position: relative;
    z-index: 2;
  }

  .avatar {
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gradient-primary);
    color: white;
    font-weight: 700;
    font-size: 2.5rem;
    border-radius: 50%;
    box-shadow:
      0 8px 32px var(--color-primary-glow),
      0 0 60px rgba(108, 92, 231, 0.3);
    position: relative;
    z-index: 2;
  }

  .avatar-ring {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 2px solid rgba(108, 92, 231, 0.4);
    animation: ringPulse 3s ease-in-out infinite;
  }

  @keyframes ringPulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.1); opacity: 0.3; }
  }

  .avatar-particles {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .avatar-particles .particle {
    position: absolute;
    width: 6px;
    height: 6px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 10px var(--color-primary-glow);
    animation: orbitParticle 8s linear infinite;
    animation-delay: var(--delay);
    transform: rotate(var(--angle)) translateX(70px);
  }

  @keyframes orbitParticle {
    from { transform: rotate(var(--angle)) translateX(70px); }
    to { transform: rotate(calc(var(--angle) + 360deg)) translateX(70px); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PROFILE CARD - Cosmic glass card
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-card {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.9) 0%,
      rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    padding: 2rem;
    margin-bottom: 1.5rem;
    position: relative;
    overflow: hidden;
  }

  /* Top glow line */
  .profile-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 255, 255, 0.3),
      rgba(255, 121, 198, 0.4),
      transparent);
  }

  .card-header {
    margin-bottom: 1.5rem;
  }

  .card-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 0.25rem;
  }

  .card-subtitle {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 700;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 1rem;
    color: var(--color-text);
    background: rgba(10, 10, 18, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    transition: all 0.3s;
  }

  input:focus {
    outline: none;
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .input-disabled {
    background: rgba(10, 10, 18, 0.3);
    border-color: rgba(108, 92, 231, 0.1);
  }

  .input-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MESSAGES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .message {
    padding: 0.875rem 1rem;
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .error {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.15) 0%, rgba(255, 107, 107, 0.05) 100%);
    color: var(--color-red);
    border: 1px solid rgba(255, 107, 107, 0.3);
  }

  .success {
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.15) 0%, rgba(38, 222, 129, 0.05) 100%);
    color: var(--color-green);
    border: 1px solid rgba(38, 222, 129, 0.3);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BUTTONS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    border: none;
    margin-top: 0.5rem;
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 16px var(--color-primary-glow);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px var(--color-primary-glow);
  }

  .btn-secondary {
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light);
    border: 1px solid rgba(108, 92, 231, 0.3);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .loading-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .btn-secondary .loading-spinner {
    border-color: rgba(108, 92, 231, 0.3);
    border-top-color: var(--color-primary-light);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .profile-page {
      padding: 0 0.5rem 2rem;
    }

    .profile-header {
      padding: 0 0.5rem 1rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .profile-card {
      padding: 1.5rem;
      border-radius: var(--radius-xl);
    }

    .avatar {
      width: 80px;
      height: 80px;
      font-size: 2rem;
    }

    .avatar-ring {
      inset: -6px;
    }

    .avatar-particles .particle {
      transform: rotate(var(--angle)) translateX(55px);
    }

    @keyframes orbitParticle {
      from { transform: rotate(var(--angle)) translateX(55px); }
      to { transform: rotate(calc(var(--angle) + 360deg)) translateX(55px); }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .avatar-ring,
    .avatar-particles .particle,
    .loading-spinner {
      animation: none;
    }
  }
</style>
