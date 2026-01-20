<script lang="ts">
  interface Props {
    icon?: string;
    title: string;
    description?: string;
    children?: import('svelte').Snippet;
  }

  let { icon = '📋', title, description, children }: Props = $props();
</script>

<div class="empty-state">
  <span class="empty-icon">{icon}</span>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-description">{description}</p>
  {/if}
  {#if children}
    <div class="empty-actions">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5rem 2rem;
    text-align: center;
    position: relative;
  }

  /* Main nebula glow */
  .empty-state::before {
    content: '';
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(ellipse at center,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.1) 40%,
      transparent 70%);
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    animation: nebulaFloat 8s var(--ease-smooth) infinite;
  }

  @keyframes nebulaFloat {
    0%, 100% {
      transform: translate(0, 0) scale(1);
      opacity: 0.6;
    }
    50% {
      transform: translate(-20px, -20px) scale(1.1);
      opacity: 0.8;
    }
  }

  /* Secondary accent glow */
  .empty-state::after {
    content: '';
    position: absolute;
    width: 200px;
    height: 200px;
    background: radial-gradient(ellipse at center,
      rgba(38, 222, 129, 0.15) 0%,
      transparent 60%);
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.5;
    top: 30%;
    right: 20%;
    animation: nebulaFloat 10s var(--ease-smooth) infinite reverse;
  }

  .empty-icon {
    font-size: 5rem;
    margin-bottom: 2rem;
    animation: iconOrbit 6s var(--ease-smooth) infinite;
    filter: drop-shadow(0 0 30px rgba(108, 92, 231, 0.4));
    position: relative;
    z-index: 1;
  }

  @keyframes iconOrbit {
    0%, 100% {
      transform: translateY(0) rotate(0deg);
    }
    25% {
      transform: translateY(-15px) rotate(5deg);
    }
    50% {
      transform: translateY(0) rotate(0deg);
    }
    75% {
      transform: translateY(-10px) rotate(-5deg);
    }
  }

  .empty-title {
    font-size: 1.75rem;
    font-weight: 800;
    margin-bottom: 1rem;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-accent) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    position: relative;
    z-index: 1;
    animation: textShimmer 6s linear infinite;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .empty-description {
    color: var(--color-text-muted);
    max-width: 360px;
    margin-bottom: 2.5rem;
    line-height: 1.8;
    position: relative;
    z-index: 1;
    font-size: 1rem;
  }

  .empty-actions {
    display: flex;
    gap: 1rem;
    position: relative;
    z-index: 1;
  }
</style>
