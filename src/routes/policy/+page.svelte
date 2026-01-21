<script lang="ts">
  import { onMount } from 'svelte';

  let isVisible = $state(false);
  let sectionsVisible = $state<boolean[]>([false, false, false, false, false, false]);

  onMount(() => {
    // Stagger the reveal animations
    setTimeout(() => isVisible = true, 100);

    // Reveal sections one by one
    sectionsVisible.forEach((_, i) => {
      setTimeout(() => {
        sectionsVisible[i] = true;
        sectionsVisible = [...sectionsVisible];
      }, 400 + (i * 150));
    });
  });
</script>

<svelte:head>
  <title>Privacy Policy - Stellar</title>
  <meta name="description" content="Stellar Privacy Policy - Your data, your control. We believe in transparency and protecting your privacy." />
</svelte:head>

<div class="policy-container" class:visible={isVisible}>
  <!-- Ambient Background Effects -->
  <div class="ambient">
    <div class="glow glow-1"></div>
    <div class="glow glow-2"></div>
    <div class="glow glow-3"></div>
    <div class="stars"></div>
  </div>

  <!-- Floating Orbs -->
  <div class="orbs">
    <span class="orb orb-1"></span>
    <span class="orb orb-2"></span>
    <span class="orb orb-3"></span>
  </div>

  <article class="policy-content">
    <!-- Hero Section -->
    <header class="hero">
      <div class="hero-badge">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>Privacy First</span>
      </div>
      <h1 class="hero-title">
        <span class="title-line">Your Data.</span>
        <span class="title-line title-accent">Your Control.</span>
      </h1>
      <p class="hero-subtitle">
        We believe privacy is a fundamental right, not a feature.
      </p>
    </header>

    <!-- Policy Sections -->
    <div class="sections">
      <section class="section" class:visible={sectionsVisible[0]}>
        <div class="section-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
        </div>
        <div class="section-content">
          <h2>What We Collect</h2>
          <p>
            Only what's essential. Your goals, tasks, routines, and focus sessions are stored to provide the service.
            We collect your email for authentication and basic account management.
          </p>
          <ul class="minimal-list">
            <li>Account information (email, name)</li>
            <li>Your productivity data (goals, tasks, routines)</li>
            <li>Usage patterns to improve your experience</li>
          </ul>
        </div>
      </section>

      <section class="section" class:visible={sectionsVisible[1]}>
        <div class="section-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="section-content">
          <h2>How We Protect It</h2>
          <p>
            Your data is encrypted in transit and at rest. We use industry-standard security practices
            and infrastructure provided by trusted partners.
          </p>
          <ul class="minimal-list">
            <li>End-to-end encryption for all data transfers</li>
            <li>Secure cloud infrastructure (Supabase, Vercel)</li>
            <li>Regular security audits and updates</li>
          </ul>
        </div>
      </section>

      <section class="section" class:visible={sectionsVisible[2]}>
        <div class="section-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div class="section-content">
          <h2>Who Has Access</h2>
          <p>
            Only you. We don't sell, share, or monetize your personal data. Your productivity journey
            is yours alone.
          </p>
          <ul class="minimal-list">
            <li>No third-party data sales, ever</li>
            <li>No advertising or tracking</li>
            <li>Limited access to essential service providers only</li>
          </ul>
        </div>
      </section>

      <section class="section" class:visible={sectionsVisible[3]}>
        <div class="section-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
        <div class="section-content">
          <h2>Your Rights</h2>
          <p>
            You own your data. Export it anytime, delete it completely, or request a full copy.
            No questions asked.
          </p>
          <ul class="minimal-list">
            <li>Export all your data at any time</li>
            <li>Request complete account deletion</li>
            <li>Access and correct your information</li>
          </ul>
        </div>
      </section>

      <section class="section" class:visible={sectionsVisible[4]}>
        <div class="section-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <div class="section-content">
          <h2>Browser Extension</h2>
          <p>
            The Stellar Focus extension only accesses data necessary to block distracting websites during
            your focus sessions. It does not track your browsing history.
          </p>
          <ul class="minimal-list">
            <li>Reads only your block list and focus session status</li>
            <li>Does not collect or store browsing history</li>
            <li>All data stays synced with your account</li>
          </ul>
        </div>
      </section>

      <section class="section" class:visible={sectionsVisible[5]}>
        <div class="section-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div class="section-content">
          <h2>Questions?</h2>
          <p>
            We're here to help. If you have any questions about your privacy or data,
            please reach out.
          </p>
          <a href="mailto:hello@prabhakar.dev" class="contact-link">
            hello@prabhakar.dev
          </a>
        </div>
      </section>
    </div>

    <!-- Footer -->
    <footer class="policy-footer">
      <p class="update-date">Last updated: January 2026</p>
      <a href="/" class="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to Stellar
      </a>
    </footer>
  </article>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .policy-container {
    min-height: 100vh;
    min-height: 100dvh;
    position: relative;
    overflow: hidden;
    padding: 2rem;
    padding-top: calc(80px + env(safe-area-inset-top, 0px));
    padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }

  .policy-container.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     AMBIENT BACKGROUND
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .ambient {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.4;
  }

  .glow-1 {
    width: 600px;
    height: 600px;
    top: -200px;
    left: -200px;
    background: radial-gradient(circle, rgba(108, 92, 231, 0.4) 0%, transparent 70%);
    animation: glowPulse 8s ease-in-out infinite;
  }

  .glow-2 {
    width: 500px;
    height: 500px;
    bottom: -150px;
    right: -150px;
    background: radial-gradient(circle, rgba(255, 121, 198, 0.3) 0%, transparent 70%);
    animation: glowPulse 10s ease-in-out infinite 2s;
  }

  .glow-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(38, 222, 129, 0.15) 0%, transparent 70%);
    animation: glowPulse 12s ease-in-out infinite 4s;
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
  }

  .glow-3 {
    animation: glowPulse 12s ease-in-out infinite 4s, glowFloat 20s ease-in-out infinite;
  }

  @keyframes glowFloat {
    0%, 100% { transform: translate(-50%, -50%); }
    50% { transform: translate(-50%, -55%); }
  }

  .stars {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 30% 70%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 50% 10%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 70% 50%, rgba(255, 255, 255, 0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 90% 80%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 25% 45%, rgba(108, 92, 231, 0.6) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 75% 35%, rgba(255, 121, 198, 0.5) 0%, transparent 100%);
    background-size: 400px 400px;
    animation: starsDrift 120s linear infinite;
  }

  @keyframes starsDrift {
    from { transform: translateY(0); }
    to { transform: translateY(-200px); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FLOATING ORBS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .orbs {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.3) 0%, rgba(255, 121, 198, 0.2) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    backdrop-filter: blur(2px);
  }

  .orb-1 {
    width: 120px;
    height: 120px;
    top: 20%;
    right: 10%;
    animation: orbFloat 15s ease-in-out infinite;
  }

  .orb-2 {
    width: 80px;
    height: 80px;
    bottom: 30%;
    left: 5%;
    animation: orbFloat 12s ease-in-out infinite 3s;
  }

  .orb-3 {
    width: 60px;
    height: 60px;
    top: 60%;
    right: 20%;
    animation: orbFloat 10s ease-in-out infinite 6s;
  }

  @keyframes orbFloat {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-30px) rotate(180deg); }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONTENT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .policy-content {
    position: relative;
    z-index: 10;
    max-width: 720px;
    margin: 0 auto;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HERO
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .hero {
    text-align: center;
    margin-bottom: 5rem;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-primary-light);
    margin-bottom: 2rem;
    animation: badgeGlow 3s ease-in-out infinite;
  }

  @keyframes badgeGlow {
    0%, 100% { box-shadow: 0 0 20px rgba(108, 92, 231, 0.2); }
    50% { box-shadow: 0 0 40px rgba(108, 92, 231, 0.4); }
  }

  .hero-title {
    font-size: clamp(2.5rem, 8vw, 4rem);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin: 0 0 1.5rem;
  }

  .title-line {
    display: block;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-text-secondary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .title-accent {
    background: linear-gradient(135deg,
      var(--color-primary-light) 0%,
      var(--color-accent) 50%,
      var(--color-primary-light) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: titleShimmer 6s linear infinite;
  }

  @keyframes titleShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .hero-subtitle {
    font-size: clamp(1.125rem, 3vw, 1.375rem);
    color: var(--color-text-muted);
    font-weight: 500;
    margin: 0;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SECTIONS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .sections {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .section {
    display: flex;
    gap: 1.5rem;
    padding: 2rem;
    background: linear-gradient(135deg,
      rgba(15, 15, 26, 0.8) 0%,
      rgba(26, 26, 46, 0.6) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    backdrop-filter: blur(20px);
    opacity: 0;
    transform: translateY(30px);
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .section.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .section:hover {
    border-color: rgba(108, 92, 231, 0.3);
    box-shadow: 0 8px 40px rgba(108, 92, 231, 0.15);
    transform: translateY(-4px);
  }

  .section-icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.2) 0%,
      rgba(108, 92, 231, 0.1) 100%);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-lg);
    color: var(--color-primary-light);
    transition: all 0.3s ease;
  }

  .section:hover .section-icon {
    background: linear-gradient(135deg,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(108, 92, 231, 0.15) 100%);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.3);
    transform: scale(1.05);
  }

  .section-content {
    flex: 1;
  }

  .section-content h2 {
    font-size: 1.375rem;
    font-weight: 700;
    margin: 0 0 0.75rem;
    color: var(--color-text);
  }

  .section-content p {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--color-text-secondary);
    margin: 0 0 1rem;
  }

  .minimal-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .minimal-list li {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    padding-left: 1.25rem;
    position: relative;
  }

  .minimal-list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.625em;
    width: 6px;
    height: 6px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--color-primary-glow);
  }

  .contact-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--gradient-primary);
    color: white;
    font-weight: 600;
    font-size: 0.9375rem;
    border-radius: var(--radius-lg);
    text-decoration: none;
    transition: all 0.3s ease;
    box-shadow: 0 4px 20px var(--color-primary-glow);
  }

  .contact-link:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 30px var(--color-primary-glow);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .policy-footer {
    margin-top: 4rem;
    padding-top: 2rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .update-date {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: all 0.3s ease;
  }

  .back-link:hover {
    color: var(--color-primary-light);
    transform: translateX(-4px);
  }

  .back-link svg {
    transition: transform 0.3s ease;
  }

  .back-link:hover svg {
    transform: translateX(-4px);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 768px) {
    .policy-container {
      padding: 1.5rem;
      padding-top: calc(80px + env(safe-area-inset-top, 0px));
    }

    .hero {
      margin-bottom: 3rem;
    }

    .section {
      flex-direction: column;
      padding: 1.5rem;
      gap: 1rem;
    }

    .section-icon {
      width: 44px;
      height: 44px;
    }

    .orb-1 { width: 80px; height: 80px; }
    .orb-2 { width: 60px; height: 60px; }
    .orb-3 { width: 40px; height: 40px; }
  }

  @media (max-width: 640px) {
    .policy-container {
      padding: 1rem;
      padding-top: calc(20px + env(safe-area-inset-top, 0px));
      padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
    }

    .hero-badge {
      font-size: 0.75rem;
      padding: 0.375rem 0.75rem;
    }

    .section-content h2 {
      font-size: 1.25rem;
    }

    .policy-footer {
      flex-direction: column;
      text-align: center;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .policy-container {
      transition: opacity 0.3s ease-out;
      transform: none;
    }

    .section {
      transition: opacity 0.3s ease-out;
      transform: none;
    }

    .section.visible {
      transform: none;
    }

    .section:hover {
      transform: none;
    }

    .glow,
    .stars,
    .orb,
    .hero-badge,
    .title-accent {
      animation: none;
    }
  }
</style>
