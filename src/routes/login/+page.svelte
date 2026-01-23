<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { signIn, signUp, getSession, resendConfirmationEmail } from '$lib/supabase/auth';
  import { getOfflineCredentials, verifyOfflinePassword } from '$lib/auth/offlineCredentials';
  import { createOfflineSession, getValidOfflineSession } from '$lib/auth/offlineSession';
  import { isOnline } from '$lib/stores/network';
  import type { OfflineCredentials } from '$lib/types';

  let mode: 'login' | 'signup' = $state('login');
  let email = $state('');
  let password = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let showPassword = $state(false);

  // Get redirect URL from query params
  const redirectUrl = $derived($page.url.searchParams.get('redirect') || '/');

  // Offline login state
  let cachedCredentials = $state<OfflineCredentials | null>(null);
  let isOfflineLoginMode = $derived(!$isOnline && cachedCredentials !== null);
  let showNoInternetMessage = $derived(!$isOnline && cachedCredentials === null);

  // Resend confirmation email state
  let pendingConfirmationEmail = $state<string | null>(null);
  let resendCooldown = $state(0);
  let resendLoading = $state(false);
  let resendIntervalId: ReturnType<typeof setInterval> | null = null;

  // BroadcastChannel for inter-tab communication
  const AUTH_CHANNEL_NAME = 'stellar-auth-channel';
  let authChannel: BroadcastChannel | null = null;

  // Check for cached credentials and existing auth on mount
  onMount(async () => {
    const cached = await getOfflineCredentials();
    cachedCredentials = cached;

    // Check if user is already authenticated (Supabase session or offline session)
    const session = await getSession();
    if (session) {
      // Use hard navigation to ensure full page reload with proper auth state
      window.location.href = redirectUrl;
      return;
    }

    // Also check for valid offline session - user might already be logged in offline
    const offlineSession = await getValidOfflineSession();
    if (offlineSession) {
      // Already authenticated offline - redirect to intended destination
      window.location.href = redirectUrl;
      return;
    }

    // Listen for auth confirmation from other tabs
    if ('BroadcastChannel' in window) {
      authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);

      authChannel.onmessage = async (event) => {
        if (event.data.type === 'FOCUS_REQUEST' && event.data.authConfirmed) {
          // Another tab confirmed auth - check our session independently (don't trust the message)
          const session = await getSession();
          if (session) {
            // Auth is valid, navigate to home
            goto(redirectUrl);
          }
        }
      };
    }
  });

  onDestroy(() => {
    authChannel?.close();
    if (resendIntervalId) {
      clearInterval(resendIntervalId);
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;
    success = null;

    // Handle offline login
    if (isOfflineLoginMode && cachedCredentials) {
      await handleOfflineLogin();
      loading = false;
      return;
    }

    if (mode === 'login') {
      const result = await signIn(email, password);
      if (result.error) {
        error = result.error;
      } else {
        goto(redirectUrl);
      }
    } else {
      if (!firstName.trim()) {
        error = 'First name is required';
        loading = false;
        return;
      }
      const signupEmail = email; // Store before clearing
      const result = await signUp(email, password, firstName.trim(), lastName.trim());
      if (result.error) {
        error = result.error;
      } else if (result.session) {
        goto(redirectUrl);
      } else {
        success = 'Check your email for the confirmation link!';
        pendingConfirmationEmail = signupEmail;
        mode = 'login';
        // Clear form fields
        email = '';
        password = '';
        firstName = '';
        lastName = '';
      }
    }

    loading = false;
  }

  async function handleResendEmail() {
    if (!pendingConfirmationEmail || resendCooldown > 0 || resendLoading) return;

    resendLoading = true;
    error = null;

    const result = await resendConfirmationEmail(pendingConfirmationEmail);

    if (result.error) {
      error = result.error;
    } else {
      // Start 30 second cooldown
      resendCooldown = 30;
      resendIntervalId = setInterval(() => {
        resendCooldown--;
        if (resendCooldown <= 0) {
          if (resendIntervalId) {
            clearInterval(resendIntervalId);
            resendIntervalId = null;
          }
        }
      }, 1000);
    }

    resendLoading = false;
  }

  async function handleOfflineLogin() {
    if (!cachedCredentials) return;

    const valid = await verifyOfflinePassword(password);
    if (!valid) {
      error = 'Invalid password';
      return;
    }

    // Create offline session
    await createOfflineSession(cachedCredentials.userId);

    // Use hard navigation to ensure layout load functions re-run
    // (goto() may not properly re-evaluate auth state after offline session creation)
    window.location.href = redirectUrl;
  }

  function toggleMode() {
    // Don't allow toggling to signup when offline
    if (!$isOnline && mode === 'login') {
      return;
    }
    mode = mode === 'login' ? 'signup' : 'login';
    error = null;
    success = null;
  }
</script>

<svelte:head>
  <title>{mode === 'login' ? 'Sign In' : 'Sign Up'} - Stellar</title>
</svelte:head>

<div class="login-page">
  <!-- Starfield (fixed, always covers viewport even when scrolling) -->
  <div class="starfield">
    <div class="stars stars-small"></div>
    <div class="stars stars-medium"></div>
    <div class="stars stars-large"></div>
  </div>

  <!-- Nebula Effects (fixed, always covers viewport even when scrolling) -->
  <div class="nebula nebula-1"></div>
  <div class="nebula nebula-2"></div>
  <div class="nebula nebula-3"></div>

  <!-- Background Effects (clipped separately to allow content to grow) -->
  <div class="background-effects">
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

    <!-- Floating Particles -->
    <div class="particles">
      {#each Array(15) as _, i}
        <span
          class="particle"
          style="
            --delay: {Math.random() * 5}s;
            --duration: {5 + Math.random() * 10}s;
            --x-start: {Math.random() * 100}%;
            --y-start: {Math.random() * 100}%;
            --size: {2 + Math.random() * 3}px;
            --opacity: {0.2 + Math.random() * 0.4};
          "
        ></span>
      {/each}
    </div>
  </div>

  <!-- Login Content -->
  <div class="login-content">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-icon">
        <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="45" stroke="url(#loginBrandGrad)" stroke-width="5" fill="none"/>
          <path d="M30 52 L45 67 L72 35" stroke="url(#loginCheckGrad)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <defs>
            <linearGradient id="loginBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6c5ce7"/>
              <stop offset="100%" stop-color="#ff79c6"/>
            </linearGradient>
            <linearGradient id="loginCheckGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#26de81"/>
              <stop offset="100%" stop-color="#00d4ff"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h1 class="brand-title">Stellar</h1>
      <p class="brand-tagline">Your universe of productivity awaits</p>
    </div>

    <!-- No Internet Message (offline with no cached credentials) -->
    {#if showNoInternetMessage}
      <div class="login-card">
        <div class="offline-message">
          <div class="offline-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          </div>
          <h2 class="card-title">Internet Required</h2>
          <p class="offline-description">
            Please connect to the internet to sign in. Once you've signed in online first, you'll be able to sign offline in the future.
          </p>
        </div>
      </div>

    <!-- Offline Login Form (offline with cached credentials) -->
    {:else if isOfflineLoginMode && cachedCredentials}
      <div class="login-card">
        <div class="offline-user-info">
          <div class="offline-avatar">
            {cachedCredentials.firstName.charAt(0).toUpperCase()}
          </div>
          <h2 class="card-title">Continue as {cachedCredentials.firstName}</h2>
          <p class="offline-email">{cachedCredentials.email}</p>
        </div>

        <form onsubmit={handleSubmit}>
          <div class="form-group">
            <label for="password">Password</label>
            <div class="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                bind:value={password}
                required
                disabled={loading}
                minlength="6"
                placeholder="Enter your password"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="password-toggle"
                onclick={() => showPassword = !showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {#if showPassword}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <p class="offline-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
            You're offline. Enter your password to continue.
          </p>

          {#if error}
            <div class="message error">{error}</div>
          {/if}

          <button type="submit" class="btn btn-primary submit-btn" disabled={loading}>
            {#if loading}
              <span class="loading-spinner"></span>
              Signing in...
            {:else}
              Continue Offline
            {/if}
          </button>
        </form>

        <div class="offline-switch-account">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Different account? Connect to internet to switch.
        </div>
      </div>

    <!-- Normal Online Login/Signup Form -->
    {:else}
      <div class="login-card">
        <h2 class="card-title">{mode === 'login' ? 'Welcome Back' : 'Sign up'}</h2>

        <form onsubmit={handleSubmit}>
          {#if mode === 'signup'}
            <div class="name-row">
              <div class="form-group">
                <label for="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  bind:value={firstName}
                  required
                  disabled={loading}
                  placeholder="John"
                />
              </div>

              <div class="form-group">
                <label for="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  bind:value={lastName}
                  disabled={loading}
                  placeholder="Doe"
                />
              </div>
            </div>
          {/if}

          <div class="form-group">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              bind:value={email}
              required
              disabled={loading}
              placeholder="you@example.com"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <div class="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                bind:value={password}
                required
                disabled={loading}
                minlength="6"
                placeholder="Min 6 characters"
              />
              <button
                type="button"
                class="password-toggle"
                onclick={() => showPassword = !showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {#if showPassword}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          {#if error}
            <div class="message error">{error}</div>
          {/if}

          {#if success}
            <div class="message success">
              <div class="success-content">
                <svg class="success-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>{success}</span>
              </div>
              {#if pendingConfirmationEmail}
                <div class="resend-section">
                  <span class="resend-text">Didn't receive it?</span>
                  <button
                    type="button"
                    class="resend-btn"
                    onclick={handleResendEmail}
                    disabled={resendCooldown > 0 || resendLoading}
                  >
                    {#if resendLoading}
                      <span class="resend-spinner"></span>
                      Sending...
                    {:else if resendCooldown > 0}
                      Resend in {resendCooldown}s
                    {:else}
                      Resend email
                    {/if}
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          <button type="submit" class="btn btn-primary submit-btn" disabled={loading}>
            {#if loading}
              <span class="loading-spinner"></span>
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            {:else}
              {mode === 'login' ? 'Log In' : 'Sign Up'}
            {/if}
          </button>
        </form>

        <div class="toggle-mode">
          {#if mode === 'login'}
            Don't have an account?
            {#if $isOnline}
              <button type="button" class="link-btn" onclick={toggleMode}>Create account</button>
            {:else}
              <span class="signup-disabled">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                  <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
                Internet required to create account
              </span>
            {/if}
          {:else}
            Already have an account?
            <button type="button" class="link-btn" onclick={toggleMode}>Log in</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN PAGE CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-page {
    inset: 0;
    z-index: 200; /* Above navbar to prevent any flickering */
    position: fixed;
    /* Extend into safe areas */
    height: calc(100vh + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px));
    margin-top: calc(-1 * env(safe-area-inset-top, 0px));
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto; /* Allow scrolling when content is larger than viewport */
    background: radial-gradient(ellipse at center,
      rgba(15, 15, 35, 1) 0%,
      rgba(5, 5, 16, 1) 50%,
      rgba(0, 0, 5, 1) 100%);
  }

  /* Background effects container - clips decorative elements without affecting content */
  .background-effects {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STAR FIELD
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .starfield {
    position: fixed;
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
    animation: starsTwinkle 4s ease-in-out infinite, starsDrift 200s linear infinite;
  }

  @keyframes starsDrift {
    from { transform: translateY(0) translateX(0); }
    to { transform: translateY(-100px) translateX(-50px); }
  }

  @keyframes starsTwinkle {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NEBULA EFFECTS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .nebula {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.5;
    pointer-events: none;
  }

  .nebula-1 {
    width: 700px;
    height: 700px;
    top: -250px;
    right: -200px;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.6) 0%, transparent 70%);
    animation: nebulaPulse 8s ease-in-out infinite, nebulaFloat 20s ease-in-out infinite;
  }

  .nebula-2 {
    width: 600px;
    height: 600px;
    bottom: -200px;
    left: -150px;
    background: radial-gradient(ellipse, rgba(255, 121, 198, 0.5) 0%, transparent 70%);
    animation: nebulaPulse 10s ease-in-out infinite 2s, nebulaFloat 25s ease-in-out infinite reverse;
  }

  .nebula-3 {
    width: 500px;
    height: 500px;
    top: 40%;
    left: 60%;
    transform: translate(-50%, -50%);
    background: radial-gradient(ellipse, rgba(38, 222, 129, 0.25) 0%, transparent 70%);
    animation: nebulaPulse 12s ease-in-out infinite 4s;
  }

  @keyframes nebulaPulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.1); }
  }

  @keyframes nebulaFloat {
    0%, 100% { transform: translate(0, 0); }
    33% { transform: translate(30px, -20px); }
    66% { transform: translate(-20px, 30px); }
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
    border: 1px solid rgba(108, 92, 231, 0.12);
    transform: translate(-50%, -50%);
  }

  .orbit-1 {
    width: 400px;
    height: 400px;
    animation: orbitRotate 40s linear infinite;
  }

  .orbit-2 {
    width: 600px;
    height: 600px;
    border-color: rgba(255, 121, 198, 0.08);
    animation: orbitRotate 60s linear infinite reverse;
  }

  .orbit-3 {
    width: 800px;
    height: 800px;
    border-color: rgba(38, 222, 129, 0.06);
    animation: orbitRotate 80s linear infinite;
  }

  @keyframes orbitRotate {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
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
    box-shadow: 0 0 15px var(--color-primary-glow), 0 0 30px var(--color-primary-glow);
    animation: orbitParticle1 40s linear infinite;
  }

  .particle-2 {
    background: var(--color-accent);
    box-shadow: 0 0 15px var(--color-accent-glow), 0 0 30px var(--color-accent-glow);
    animation: orbitParticle2 60s linear infinite reverse;
    width: 4px;
    height: 4px;
  }

  .particle-3 {
    background: var(--color-success);
    box-shadow: 0 0 15px var(--color-success-glow), 0 0 30px var(--color-success-glow);
    animation: orbitParticle3 80s linear infinite;
    width: 5px;
    height: 5px;
  }

  @keyframes orbitParticle1 {
    from { transform: rotate(0deg) translateX(200px) rotate(0deg); }
    to { transform: rotate(360deg) translateX(200px) rotate(-360deg); }
  }

  @keyframes orbitParticle2 {
    from { transform: rotate(0deg) translateX(300px) rotate(0deg); }
    to { transform: rotate(360deg) translateX(300px) rotate(-360deg); }
  }

  @keyframes orbitParticle3 {
    from { transform: rotate(0deg) translateX(400px) rotate(0deg); }
    to { transform: rotate(360deg) translateX(400px) rotate(-360deg); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SHOOTING STARS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .shooting-star {
    position: absolute;
    width: 120px;
    height: 2px;
    background: linear-gradient(90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.8) 50%,
      rgba(108, 92, 231, 1) 100%);
    border-radius: 100px;
    opacity: 0;
    pointer-events: none;
  }

  .shooting-star-1 {
    top: 20%;
    left: 5%;
    transform: rotate(-35deg);
    animation: shootingStar 10s ease-in-out infinite;
  }

  .shooting-star-2 {
    top: 40%;
    right: 10%;
    transform: rotate(-40deg);
    animation: shootingStar 14s ease-in-out infinite 5s;
  }

  @keyframes shootingStar {
    0%, 90%, 100% { opacity: 0; transform: rotate(-35deg) translateX(0); }
    92% { opacity: 1; }
    95% { opacity: 1; transform: rotate(-35deg) translateX(350px); }
    96% { opacity: 0; transform: rotate(-35deg) translateX(400px); }
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
    0%, 100% { transform: translateY(0) translateX(0); opacity: var(--opacity); }
    25% { transform: translateY(-30px) translateX(15px); }
    50% { transform: translateY(-50px) translateX(-10px); opacity: calc(var(--opacity) * 1.5); }
    75% { transform: translateY(-20px) translateX(20px); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN CONTENT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center; /* Center children vertically */
    gap: 2rem;
    padding: 2rem;
    width: 100%;
    max-width: 440px;
    margin: auto;
    animation: contentReveal 1s ease-out forwards;
  }

  @keyframes contentReveal {
    0% { opacity: 0; transform: translateY(30px) scale(0.95); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BRAND
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-icon {
    animation: brandFloat 4s ease-in-out infinite;
    filter: drop-shadow(0 0 30px var(--color-primary-glow));
  }

  @keyframes brandFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  .brand-title {
    font-size: 2.5rem;
    font-weight: 800;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    animation: textShimmer 6s linear infinite;
    margin: 0;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .brand-tagline {
    color: var(--color-text-muted);
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
    opacity: 0.8;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN CARD
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-card {
    width: 100%;
    padding: 2.5rem;
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.9) 0%,
      rgba(20, 20, 40, 0.85) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 32px 80px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 0 100px rgba(108, 92, 231, 0.1);
    position: relative;
  }

  /* Top glow line */
  .login-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 255, 255, 0.3),
      rgba(255, 121, 198, 0.4),
      transparent);
  }

  .card-title {
    text-align: center;
    margin: 0 0 2rem 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.02em;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .name-row {
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
  }

  .password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input-wrapper input {
    padding-right: 3rem;
  }

  .password-toggle {
    position: absolute;
    right: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .password-toggle:hover {
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.15);
  }

  .password-toggle:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--color-primary-glow);
  }

  .message {
    padding: 1rem;
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 600;
    backdrop-filter: blur(16px);
  }

  .error {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.2) 0%, rgba(255, 107, 107, 0.06) 100%);
    color: var(--color-red);
    border: 1px solid rgba(255, 107, 107, 0.4);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.1);
  }

  .success {
    background: linear-gradient(135deg, rgba(38, 222, 129, 0.2) 0%, rgba(38, 222, 129, 0.06) 100%);
    color: var(--color-green);
    border: 1px solid rgba(38, 222, 129, 0.4);
    box-shadow: 0 0 20px rgba(38, 222, 129, 0.1);
  }

  .success-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .success-icon {
    flex-shrink: 0;
  }

  .resend-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(38, 222, 129, 0.2);
  }

  .resend-text {
    font-size: 0.8125rem;
    opacity: 0.9;
  }

  .resend-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-green);
    background: rgba(38, 222, 129, 0.15);
    border: 1px solid rgba(38, 222, 129, 0.3);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .resend-btn:hover:not(:disabled) {
    background: rgba(38, 222, 129, 0.25);
    border-color: rgba(38, 222, 129, 0.5);
  }

  .resend-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .resend-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(38, 222, 129, 0.3);
    border-top-color: var(--color-green);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .submit-btn {
    width: 100%;
    padding: 1rem;
    margin-top: 0.75rem;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .submit-btn:disabled {
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

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .toggle-mode {
    text-align: center;
    margin-top: 1.75rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    padding-top: 1.75rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .link-btn {
    color: var(--color-primary-light);
    font-weight: 700;
    padding: 0.375rem 0.75rem;
    margin-left: 0.25rem;
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
  }

  .link-btn:hover {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(108, 92, 231, 0.1) 100%);
    border-color: rgba(108, 92, 231, 0.3);
    box-shadow: 0 0 20px var(--color-primary-glow);
    transform: scale(1.05);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE - Large Screens and Tablets
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* Large screens - more dramatic effects */
  @media (min-width: 1200px) {
    .login-content {
      max-width: 480px;
    }

    .brand-icon svg {
      width: 56px;
      height: 56px;
    }

    .brand-title {
      font-size: 3rem;
    }

    .brand-tagline {
      font-size: 1.125rem;
    }

    .login-card {
      padding: 3rem;
    }

    .orbit-1 { width: 500px; height: 500px; }
    .orbit-2 { width: 750px; height: 750px; }
    .orbit-3 { width: 1000px; height: 1000px; }

    .nebula-1 { width: 800px; height: 800px; }
    .nebula-2 { width: 700px; height: 700px; }
    .nebula-3 { width: 600px; height: 600px; }
  }

  /* Tablets */
  @media (min-width: 768px) and (max-width: 1199px) {
    .login-content {
      max-width: 460px;
    }

    .brand-icon svg {
      width: 52px;
      height: 52px;
    }

    .brand-title {
      font-size: 2.75rem;
    }

    .login-card {
      padding: 2.75rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE - Mobile Devices
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 767px) {
    .login-content {
      padding: 1.5rem;
      gap: 1.5rem;
    }

    .brand-icon svg {
      width: 44px;
      height: 44px;
    }

    .brand-title {
      font-size: 2.25rem;
    }

    .brand-tagline {
      font-size: 0.9375rem;
    }

    .login-card {
      padding: 2rem;
    }

    .card-title {
      font-size: 1.375rem;
      margin-bottom: 1.75rem;
    }

    .orbit-1 { width: 320px; height: 320px; }
    .orbit-2 { width: 480px; height: 480px; }
    .orbit-3 { width: 640px; height: 640px; }

    @keyframes orbitParticle1 {
      from { transform: rotate(0deg) translateX(160px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(160px) rotate(-360deg); }
    }

    @keyframes orbitParticle2 {
      from { transform: rotate(0deg) translateX(240px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(240px) rotate(-360deg); }
    }

    @keyframes orbitParticle3 {
      from { transform: rotate(0deg) translateX(320px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(320px) rotate(-360deg); }
    }

    .nebula-1 { width: 500px; height: 500px; }
    .nebula-2 { width: 450px; height: 450px; }
    .nebula-3 { width: 400px; height: 400px; }
  }

  /* iPhone 16 Pro / 15 Pro / 14 Pro (393px width) */
  @media (min-width: 390px) and (max-width: 429px) {
    .login-content {
      padding: 1.25rem;
      gap: 1.75rem;
    }

    .brand-icon svg {
      width: 48px;
      height: 48px;
    }

    .brand-title {
      font-size: 2.5rem;
    }

    .brand-tagline {
      font-size: 1rem;
    }

    .login-card {
      padding: 2rem;
      border-radius: 24px;
    }

    .card-title {
      font-size: 1.5rem;
      margin-bottom: 1.75rem;
    }

    input {
      padding: 1rem 1.125rem;
      font-size: 1rem;
      border-radius: 14px;
    }

    .submit-btn {
      padding: 1.125rem;
      font-size: 1.0625rem;
      border-radius: 14px;
    }

    .offline-avatar {
      width: 72px;
      height: 72px;
      font-size: 1.75rem;
    }

    .offline-hint {
      padding: 1rem;
      font-size: 0.875rem;
    }
  }

  /* iPhone 16 Pro Max / 15 Pro Max (430px width) */
  @media (min-width: 430px) and (max-width: 480px) {
    .login-content {
      padding: 1.5rem;
      gap: 2rem;
    }

    .brand-icon svg {
      width: 52px;
      height: 52px;
    }

    .brand-title {
      font-size: 2.75rem;
    }

    .login-card {
      padding: 2.25rem;
    }

    .card-title {
      font-size: 1.5rem;
    }

    .offline-avatar {
      width: 76px;
      height: 76px;
      font-size: 1.875rem;
    }
  }

  /* Small devices (iPhone SE, older phones) */
  @media (max-width: 389px) {
    .login-content {
      padding: 1rem;
      gap: 1.25rem;
    }

    .brand-icon svg {
      width: 40px;
      height: 40px;
    }

    .brand-title {
      font-size: 2rem;
    }

    .brand-tagline {
      font-size: 0.8125rem;
    }

    .login-card {
      padding: 1.5rem;
    }

    .card-title {
      font-size: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .name-row {
      grid-template-columns: 1fr;
    }

    input {
      padding: 0.75rem 0.875rem;
      font-size: 0.9375rem;
    }

    .submit-btn {
      padding: 0.875rem;
      font-size: 0.9375rem;
    }

    .offline-avatar {
      width: 56px;
      height: 56px;
      font-size: 1.375rem;
    }

    .offline-hint {
      font-size: 0.75rem;
      padding: 0.625rem;
    }

    .orbit-1 { width: 240px; height: 240px; }
    .orbit-2 { width: 360px; height: 360px; }
    .orbit-3 { width: 480px; height: 480px; }

    @keyframes orbitParticle1 {
      from { transform: rotate(0deg) translateX(120px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
    }

    @keyframes orbitParticle2 {
      from { transform: rotate(0deg) translateX(180px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(180px) rotate(-360deg); }
    }

    @keyframes orbitParticle3 {
      from { transform: rotate(0deg) translateX(240px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(240px) rotate(-360deg); }
    }

    .nebula-1 { width: 350px; height: 350px; }
    .nebula-2 { width: 300px; height: 300px; }
    .nebula-3 { width: 250px; height: 250px; }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .stars,
    .nebula,
    .orbit,
    .orbit-particle,
    .shooting-star,
    .particle,
    .brand-icon {
      animation: none;
    }

    .brand-title {
      animation: none;
    }

    .login-content {
      animation: none;
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     OFFLINE LOGIN STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .offline-message {
    text-align: center;
    padding: 1rem 0;
  }

  .offline-icon {
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
    opacity: 0.7;
  }

  .offline-description {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    line-height: 1.6;
    margin: 1rem 0 0;
  }

  .offline-user-info {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .offline-avatar {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gradient-primary);
    color: white;
    font-weight: 700;
    font-size: 1.5rem;
    border-radius: 50%;
    margin: 0 auto 1rem;
    box-shadow: 0 4px 20px var(--color-primary-glow);
  }

  .offline-email {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0.5rem 0 0;
  }

  .offline-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    margin: 0.5rem 0 1rem;
    padding: 0.75rem;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .offline-switch-account {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1.75rem;
    padding-top: 1.75rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
    color: var(--color-text-muted);
    font-size: 0.8125rem;
  }

  .signup-disabled {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    opacity: 0.7;
    margin-left: 0.25rem;
  }

  .offline-user-info .card-title {
    margin-bottom: 0;
  }
</style>
