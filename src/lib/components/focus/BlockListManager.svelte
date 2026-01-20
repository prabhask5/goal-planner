<script lang="ts">
  import type { BlockList, BlockedWebsite } from '$lib/types';
  import { blockListStore, blockedWebsitesStore } from '$lib/stores/focus';

  interface Props {
    userId: string;
  }

  let { userId }: Props = $props();

  // Local state
  let isOpen = $state(false);
  let editingListId = $state<string | null>(null);
  let newListName = $state('');
  let newWebsite = $state('');
  let showCreateForm = $state(false);

  // Load block lists on mount
  $effect(() => {
    if (userId) {
      blockListStore.load(userId);
    }
  });

  // Load websites when editing a list
  $effect(() => {
    if (editingListId) {
      blockedWebsitesStore.load(editingListId);
    }
  });

  async function createList() {
    if (!newListName.trim()) return;
    await blockListStore.create(newListName.trim());
    newListName = '';
    showCreateForm = false;
  }

  async function deleteList(id: string) {
    await blockListStore.delete(id);
    if (editingListId === id) {
      editingListId = null;
    }
  }

  async function toggleList(id: string) {
    await blockListStore.toggle(id);
  }

  async function addWebsite() {
    if (!newWebsite.trim() || !editingListId) return;
    await blockedWebsitesStore.create(newWebsite.trim());
    newWebsite = '';
  }

  async function removeWebsite(id: string) {
    await blockedWebsitesStore.delete(id);
  }

  function openEditor(listId: string) {
    editingListId = listId;
  }

  function closeEditor() {
    editingListId = null;
    blockedWebsitesStore.clear();
  }
</script>

<div class="block-list-manager">
  <button class="manager-toggle" onclick={() => isOpen = !isOpen}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
    <span>Block Lists</span>
    <span class="badge">{$blockListStore.filter(l => l.is_enabled).length}</span>
    <svg class="chevron" class:open={isOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
      <polyline points="6,9 12,15 18,9"/>
    </svg>
  </button>

  {#if isOpen}
    <div class="panel">
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

      {#if editingListId}
        <!-- Editing a specific list -->
        {@const list = $blockListStore.find(l => l.id === editingListId)}
        {#if list}
          <div class="editor">
            <div class="editor-header">
              <button class="back-btn" onclick={closeEditor}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <polyline points="15,18 9,12 15,6"/>
                </svg>
              </button>
              <h4>{list.name}</h4>
            </div>

            <!-- Add website form -->
            <form class="add-form" onsubmit={(e) => { e.preventDefault(); addWebsite(); }}>
              <input
                type="text"
                placeholder="Add website (e.g., twitter.com)"
                bind:value={newWebsite}
                class="input"
              />
              <button type="submit" class="add-btn" disabled={!newWebsite.trim()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </form>

            <!-- Website list -->
            <div class="website-list">
              {#each $blockedWebsitesStore as website}
                <div class="website-item">
                  <span class="domain">{website.domain}</span>
                  <button class="delete-btn" onclick={() => removeWebsite(website.id)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              {:else}
                <p class="empty-text">No websites added yet</p>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <!-- List of block lists -->
        <div class="list-view">
          {#if showCreateForm}
            <form class="add-form" onsubmit={(e) => { e.preventDefault(); createList(); }}>
              <input
                type="text"
                placeholder="List name"
                bind:value={newListName}
                class="input"
              />
              <button type="submit" class="add-btn" disabled={!newListName.trim()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button type="button" class="cancel-btn" onclick={() => { showCreateForm = false; newListName = ''; }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </form>
          {:else}
            <button class="create-btn" onclick={() => showCreateForm = true}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Create Block List</span>
            </button>
          {/if}

          <div class="lists">
            {#each $blockListStore as list}
              <div class="list-item">
                <button
                  class="toggle-btn"
                  class:active={list.is_enabled}
                  onclick={() => toggleList(list.id)}
                  aria-pressed={list.is_enabled}
                >
                  <span class="toggle-knob"></span>
                </button>

                <button class="list-info" onclick={() => openEditor(list.id)}>
                  <span class="list-name">{list.name}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="9,18 15,12 9,6"/>
                  </svg>
                </button>

                <button class="delete-btn" onclick={() => deleteList(list.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
                  </svg>
                </button>
              </div>
            {:else}
              <p class="empty-text">No block lists yet. Create one to block distracting websites during focus sessions.</p>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .block-list-manager {
    margin-top: 1.5rem;
  }

  .manager-toggle {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 1rem 1.25rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
  }

  .manager-toggle:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(108, 92, 231, 0.1);
  }

  .badge {
    margin-left: auto;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    color: white;
  }

  .chevron {
    transition: transform 0.3s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .panel {
    margin-top: 0.5rem;
    padding: 1rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Editor view */
  .editor-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
  }

  .editor-header h4 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
  }

  /* Add form */
  .add-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .input {
    flex: 1;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    outline: none;
    transition: border-color 0.2s;
  }

  .input:focus {
    border-color: var(--color-primary);
  }

  .add-btn,
  .cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--gradient-primary);
    border: none;
    border-radius: var(--radius-lg);
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-btn {
    background: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
  }

  /* Website list */
  .website-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .website-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.875rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-lg);
  }

  .domain {
    font-size: 0.875rem;
    color: var(--color-text);
  }

  /* Create button */
  .create-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: rgba(108, 92, 231, 0.15);
    border: 1px dashed rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-lg);
    color: var(--color-primary-light);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .create-btn:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  /* Lists */
  .lists {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-lg);
  }

  .toggle-btn {
    position: relative;
    width: 40px;
    height: 24px;
    border-radius: 12px;
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
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    transition: transform 0.3s var(--ease-spring);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-btn.active .toggle-knob {
    transform: translateX(16px);
  }

  .list-info {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    padding: 0.25rem 0;
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
  }

  .list-name {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .delete-btn:hover {
    background: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
  }

  .empty-text {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: 1rem;
    margin: 0;
  }

  /* Extension Banner */
  .extension-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    margin-bottom: 1rem;
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
</style>
