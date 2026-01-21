<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { singleBlockListStore, blockedWebsitesStore } from '$lib/stores/focus';
  import type { BlockList, BlockedWebsite, DayOfWeek } from '$lib/types';
  import BlockListForm from '$lib/components/focus/BlockListForm.svelte';

  let blockList = $state<BlockList | null>(null);
  let websites = $state<BlockedWebsite[]>([]);
  let loading = $state(true);
  let websitesLoading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let newWebsite = $state('');

  const blockListId = $derived($page.params.id);

  // Subscribe to stores
  $effect(() => {
    const unsubList = singleBlockListStore.subscribe((value) => {
      blockList = value;
    });
    const unsubLoading = singleBlockListStore.loading.subscribe((value) => {
      loading = value;
    });
    const unsubWebsites = blockedWebsitesStore.subscribe((value) => {
      websites = value;
    });
    const unsubWebsitesLoading = blockedWebsitesStore.loading.subscribe((value) => {
      websitesLoading = value;
    });

    return () => {
      unsubList();
      unsubLoading();
      unsubWebsites();
      unsubWebsitesLoading();
    };
  });

  onMount(async () => {
    await singleBlockListStore.load(blockListId);
    await blockedWebsitesStore.load(blockListId);
  });

  onDestroy(() => {
    singleBlockListStore.clear();
    blockedWebsitesStore.clear();
  });

  async function handleUpdateBlockList(data: {
    name: string;
    activeDays: DayOfWeek[] | null;
  }) {
    if (!blockList || saving) return;

    try {
      saving = true;
      await singleBlockListStore.update(blockList.id, {
        name: data.name,
        active_days: data.activeDays
      });
      goto('/focus');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update block list';
      saving = false;
    }
  }

  async function handleDeleteBlockList() {
    if (!blockList) return;
    if (!confirm('Delete this block list? All blocked websites in it will be removed.')) return;

    try {
      const { blockListStore } = await import('$lib/stores/focus');
      await blockListStore.delete(blockList.id);
      goto('/focus');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete block list';
    }
  }

  async function addWebsite() {
    if (!newWebsite.trim()) return;
    await blockedWebsitesStore.create(newWebsite.trim());
    newWebsite = '';
  }

  async function removeWebsite(id: string) {
    await blockedWebsitesStore.delete(id);
  }
</script>

<svelte:head>
  <title>Edit Block List - Stellar</title>
</svelte:head>

<div class="container">
  <header class="page-header">
    <div class="header-left">
      <button class="back-btn" onclick={() => goto('/focus')} aria-label="Back to focus">
        ← Back
      </button>
      <h1>Edit Block List</h1>
    </div>
    <button class="btn btn-danger" onclick={handleDeleteBlockList}>
      Delete
    </button>
  </header>

  <!-- Extension Banner -->
  <div class="extension-banner">
    <div class="banner-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    </div>
    <div class="banner-content">
      <span class="banner-title">Browser Extension Required</span>
      <span class="banner-desc">Website blocking requires the Stellar Focus extension</span>
    </div>
    <a href="https://github.com/stellar-focus/extension/releases" target="_blank" rel="noopener" class="banner-btn">
      Get Extension
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </a>
  </div>

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <!-- Form Skeleton -->
    <div class="form-skeleton">
      <div class="form-skeleton-group">
        <div class="form-skeleton-label"></div>
        <div class="form-skeleton-input"></div>
      </div>
      <div class="form-skeleton-group">
        <div class="form-skeleton-label"></div>
        <div class="form-skeleton-days">
          {#each Array(7) as _}
            <div class="form-skeleton-day"></div>
          {/each}
        </div>
        <div class="form-skeleton-quick-btns">
          <div class="form-skeleton-quick-btn"></div>
          <div class="form-skeleton-quick-btn"></div>
          <div class="form-skeleton-quick-btn"></div>
        </div>
      </div>
      <div class="form-skeleton-help"></div>
      <div class="form-skeleton-actions">
        <div class="form-skeleton-btn secondary"></div>
        <div class="form-skeleton-btn primary"></div>
      </div>
      <div class="skeleton-shimmer"></div>
    </div>
  {:else if blockList}
    <div class="form-card">
      <BlockListForm
        name={blockList.name}
        activeDays={blockList.active_days}
        submitLabel={saving ? 'Saving...' : 'Save Changes'}
        onSubmit={handleUpdateBlockList}
        onCancel={() => goto('/focus')}
      />
    </div>

    <!-- Blocked Websites Section -->
    <section class="websites-section">
      <h2>Blocked Websites</h2>

      <form class="add-form" onsubmit={(e) => { e.preventDefault(); addWebsite(); }}>
        <input
          type="text"
          placeholder="Add website (e.g., twitter.com)"
          bind:value={newWebsite}
          class="input"
        />
        <button type="submit" class="add-btn" disabled={!newWebsite.trim()} aria-label="Add website to block list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </form>

      {#if websitesLoading}
        <div class="websites-loading">
          {#each Array(3) as _}
            <div class="website-skeleton"></div>
          {/each}
        </div>
      {:else}
        <div class="website-list">
          {#each websites as website}
            <div class="website-item">
              <span class="domain">{website.domain}</span>
              <button class="delete-btn" onclick={() => removeWebsite(website.id)} aria-label="Remove website">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {:else}
            <p class="empty-text">No websites added yet. Add websites to block during focus sessions.</p>
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <div class="error-state">
      <p>Block list not found.</p>
      <a href="/focus" class="btn btn-primary">Back to Focus</a>
    </div>
  {/if}
</div>

<style>
  /* Extension Banner */
  .extension-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    margin-bottom: 1.5rem;
    max-width: 600px;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.15) 0%, rgba(255, 121, 198, 0.1) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
    animation: fadeInDown 0.3s ease-out;
  }

  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .banner-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    border-radius: var(--radius-md);
    color: white;
    box-shadow: 0 4px 12px var(--color-primary-glow);
  }

  .banner-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .banner-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .banner-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    line-height: 1.3;
  }

  .banner-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
    background: var(--gradient-primary);
    border: none;
    border-radius: var(--radius-full);
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }

  .banner-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px var(--color-primary-glow);
  }

  .banner-btn:active {
    transform: translateY(0);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 2.5rem;
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-btn {
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius-xl);
    color: var(--color-text-muted);
    transition: all 0.35s var(--ease-spring);
    white-space: nowrap;
    border: 1px solid rgba(108, 92, 231, 0.15);
    font-weight: 600;
    background: linear-gradient(135deg,
      rgba(15, 15, 30, 0.8) 0%,
      rgba(20, 20, 40, 0.7) 100%);
  }

  .back-btn:hover {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(108, 92, 231, 0.1) 100%);
    border-color: rgba(108, 92, 231, 0.4);
    color: var(--color-text);
    transform: translateX(-6px);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 800;
    background: linear-gradient(135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    animation: textShimmer 8s linear infinite;
  }

  @keyframes textShimmer {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .error-banner {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.18) 0%, rgba(255, 107, 107, 0.06) 100%);
    border: 1px solid rgba(255, 107, 107, 0.4);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(16px);
    box-shadow: 0 0 30px rgba(255, 107, 107, 0.1);
  }

  .error-banner button {
    color: var(--color-red);
    font-weight: 600;
    padding: 0.375rem 1rem;
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-spring);
  }

  .error-banner button:hover {
    background: rgba(255, 107, 107, 0.25);
    transform: scale(1.05);
  }

  /* Form card */
  .form-card {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 2rem;
    max-width: 600px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
    position: relative;
    overflow: hidden;
  }

  .form-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      rgba(108, 92, 231, 0.4),
      rgba(255, 255, 255, 0.2),
      rgba(108, 92, 231, 0.4),
      transparent);
  }

  /* Websites Section */
  .websites-section {
    margin-top: 2rem;
    max-width: 600px;
  }

  .websites-section h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: var(--color-text);
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .add-form .input {
    flex: 1;
    background: rgba(26, 26, 46, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: var(--color-text);
    transition: all 0.2s;
  }

  .add-form .input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.1);
  }

  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
    border-radius: var(--radius-lg);
    color: white;
    transition: all 0.2s;
  }

  .add-btn:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .website-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .website-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(26, 26, 46, 0.5);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    transition: all 0.2s;
  }

  .website-item:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(26, 26, 46, 0.7);
  }

  .domain {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    transition: all 0.2s;
  }

  .delete-btn:hover {
    background: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
  }

  .empty-text {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    padding: 2rem;
    background: rgba(26, 26, 46, 0.3);
    border: 1px dashed rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
  }

  /* Loading skeletons */
  .websites-loading {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .website-skeleton {
    height: 52px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-lg);
    animation: pulse 2s ease-in-out infinite;
  }

  .form-skeleton {
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 2rem;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  .form-skeleton-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-skeleton-label {
    width: 100px;
    height: 0.75rem;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-sm);
  }

  .form-skeleton-input {
    height: 48px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-lg);
  }

  .form-skeleton-days {
    display: flex;
    gap: 0.375rem;
    justify-content: space-between;
  }

  .form-skeleton-day {
    flex: 1;
    height: 48px;
    min-width: 36px;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-md);
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .form-skeleton-quick-btns {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .form-skeleton-quick-btn {
    flex: 1;
    height: 32px;
    background: rgba(108, 92, 231, 0.06);
    border-radius: var(--radius-md);
    border: 1px solid rgba(108, 92, 231, 0.1);
  }

  .form-skeleton-help {
    height: 48px;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.08) 0%, rgba(108, 92, 231, 0.04) 100%);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(108, 92, 231, 0.1);
  }

  .form-skeleton-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .form-skeleton-btn {
    height: 44px;
    border-radius: var(--radius-lg);
  }

  .form-skeleton-btn.secondary {
    width: 100px;
    background: rgba(108, 92, 231, 0.1);
  }

  .form-skeleton-btn.primary {
    width: 140px;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.3) 0%, rgba(108, 92, 231, 0.2) 100%);
  }

  .skeleton-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.08) 20%,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(108, 92, 231, 0.08) 60%,
      transparent 100%
    );
    animation: shimmer 2.5s ease-in-out infinite;
  }

  @keyframes skeletonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 200%; }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .error-state {
    text-align: center;
    padding: 5rem 2rem;
    background: linear-gradient(165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    position: relative;
    overflow: hidden;
  }

  .error-state::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(108, 92, 231, 0.3), transparent);
  }

  .error-state p {
    color: var(--color-text-muted);
    margin-bottom: 2rem;
    font-size: 1.125rem;
    line-height: 1.6;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .header-left {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .back-btn {
      width: 100%;
      justify-content: center;
      padding: 0.875rem;
    }

    .back-btn:hover {
      transform: none;
    }

    .back-btn:active {
      transform: scale(0.98);
    }

    .page-header h1 {
      font-size: 1.5rem;
      text-align: center;
    }

    .page-header .btn {
      width: 100%;
      justify-content: center;
      padding: 1rem;
    }

    .form-card {
      padding: 1.5rem;
      border-radius: var(--radius-xl);
      max-width: none;
    }

    .websites-section {
      max-width: none;
    }

    .error-banner {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }

    .error-banner button {
      width: 100%;
    }

    .extension-banner {
      flex-direction: column;
      text-align: center;
      max-width: none;
    }

    .banner-btn {
      width: 100%;
      justify-content: center;
    }
  }

  /* iPhone 14/15/16 Pro Max specific (430px) */
  @media (min-width: 430px) and (max-width: 640px) {
    .page-header h1 {
      font-size: 1.75rem;
    }

    .form-card {
      padding: 2rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .page-header h1 {
      font-size: 1.25rem;
    }

    .form-card {
      padding: 1.25rem;
    }

    .error-state p {
      font-size: 0.9375rem;
    }
  }
</style>
