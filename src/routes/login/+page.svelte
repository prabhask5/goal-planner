<script lang="ts">
  import { goto } from '$app/navigation';
  import { signIn, signUp } from '$lib/supabase/auth';

  let mode: 'login' | 'signup' = $state('login');
  let email = $state('');
  let password = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;
    success = null;

    if (mode === 'login') {
      const result = await signIn(email, password);
      if (result.error) {
        error = result.error;
      } else {
        goto('/');
      }
    } else {
      if (!firstName.trim()) {
        error = 'First name is required';
        loading = false;
        return;
      }
      const result = await signUp(email, password, firstName.trim(), lastName.trim());
      if (result.error) {
        error = result.error;
      } else if (result.session) {
        goto('/');
      } else {
        success = 'Check your email for the confirmation link!';
        mode = 'login';
      }
    }

    loading = false;
  }

  function toggleMode() {
    mode = mode === 'login' ? 'signup' : 'login';
    error = null;
    success = null;
  }
</script>

<div class="login-container">
  <div class="login-card card">
    <h1>{mode === 'login' ? 'Log In' : 'Sign Up'}</h1>

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
        <input
          type="password"
          id="password"
          bind:value={password}
          required
          disabled={loading}
          minlength="6"
          placeholder="Min 6 characters"
        />
      </div>

      {#if error}
        <div class="message error">{error}</div>
      {/if}

      {#if success}
        <div class="message success">{success}</div>
      {/if}

      <button type="submit" class="btn btn-primary submit-btn" disabled={loading}>
        {#if loading}
          Loading...
        {:else}
          {mode === 'login' ? 'Log In' : 'Sign Up'}
        {/if}
      </button>
    </form>

    <div class="toggle-mode">
      {#if mode === 'login'}
        Don't have an account?
        <button type="button" class="link-btn" onclick={toggleMode}>Sign up</button>
      {:else}
        Already have an account?
        <button type="button" class="link-btn" onclick={toggleMode}>Log in</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .login-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 85vh;
    padding: 2rem;
    position: relative;
  }

  /* Main nebula glow */
  .login-container::before {
    content: '';
    position: absolute;
    width: 450px;
    height: 450px;
    background: radial-gradient(ellipse at center,
      rgba(108, 92, 231, 0.35) 0%,
      rgba(255, 121, 198, 0.15) 40%,
      transparent 70%);
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.6;
    animation: nebulaFloat 8s var(--ease-smooth) infinite;
    pointer-events: none;
  }

  /* Secondary glow */
  .login-container::after {
    content: '';
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(ellipse at center,
      rgba(38, 222, 129, 0.2) 0%,
      transparent 60%);
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.4;
    top: 20%;
    right: 20%;
    animation: nebulaFloat 10s var(--ease-smooth) infinite reverse;
    pointer-events: none;
  }

  @keyframes nebulaFloat {
    0%, 100% {
      transform: translate(0, 0) scale(1);
      opacity: 0.6;
    }
    50% {
      transform: translate(-30px, -30px) scale(1.15);
      opacity: 0.8;
    }
  }

  .login-card {
    width: 100%;
    max-width: 440px;
    padding: 3rem;
    position: relative;
    z-index: 1;
    animation: fadeInUp 0.6s var(--ease-out);
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    backdrop-filter: blur(24px);
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5);
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
      rgba(108, 92, 231, 0.5),
      transparent);
  }

  h1 {
    text-align: center;
    margin-bottom: 2.5rem;
    font-size: 2.25rem;
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
    animation: textShimmer 8s linear infinite;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .name-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  label {
    font-weight: 700;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  input {
    width: 100%;
  }

  .message {
    padding: 1.125rem 1.25rem;
    border-radius: var(--radius-xl);
    font-size: 0.9rem;
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

  .submit-btn {
    width: 100%;
    padding: 1.125rem;
    margin-top: 1rem;
    font-size: 1rem;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .toggle-mode {
    text-align: center;
    margin-top: 2.5rem;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    padding-top: 2rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .link-btn {
    color: var(--color-primary-light);
    font-weight: 700;
    padding: 0.375rem 0.75rem;
    margin-left: 0.375rem;
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
     MOBILE RESPONSIVE STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .login-container {
      padding: 1.5rem;
      min-height: 80vh;
      align-items: flex-start;
      padding-top: 3rem;
    }

    .login-container::before {
      width: 300px;
      height: 300px;
      opacity: 0.4;
    }

    .login-container::after {
      width: 200px;
      height: 200px;
      opacity: 0.3;
    }

    .login-card {
      padding: 2rem;
      max-width: none;
      width: 100%;
    }

    h1 {
      font-size: 1.875rem;
      margin-bottom: 2rem;
    }

    form {
      gap: 1.25rem;
    }

    .name-row {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    label {
      font-size: 0.6875rem;
    }

    .message {
      padding: 1rem;
      font-size: 0.85rem;
    }

    .submit-btn {
      padding: 1rem;
      margin-top: 0.5rem;
    }

    .toggle-mode {
      margin-top: 2rem;
      padding-top: 1.5rem;
      font-size: 0.85rem;
    }
  }

  /* iPhone 14/15/16 Pro Max specific (430px) */
  @media (min-width: 430px) and (max-width: 640px) {
    .login-container {
      padding-top: 4rem;
    }

    .login-card {
      padding: 2.5rem;
    }

    h1 {
      font-size: 2rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .login-container {
      padding: 1rem;
      padding-top: 2rem;
    }

    .login-card {
      padding: 1.5rem;
    }

    h1 {
      font-size: 1.625rem;
      margin-bottom: 1.5rem;
    }

    .form-group {
      gap: 0.5rem;
    }

    .submit-btn {
      padding: 0.875rem;
    }
  }
</style>
