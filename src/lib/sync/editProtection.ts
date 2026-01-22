/**
 * Edit Protection System
 *
 * Protects actively-edited entities from being overwritten by remote changes.
 * When a user is editing an entity (e.g., typing in a text field), incoming
 * remote updates for that entity are deferred until editing is complete.
 *
 * This prevents the jarring experience of having your text field contents
 * replaced while you're typing.
 */

// Protection constants
const EDIT_PROTECTION_MS = 5000; // 5 seconds after last activity on an entity
const CLEANUP_INTERVAL_MS = 10000; // Clean up expired entries every 10 seconds

// Track actively edited entities
interface ActiveEdit {
  startedAt: number;
  lastActivityAt: number;
  field?: string; // Optional: which field is being edited
}

const activeEdits = new Map<string, ActiveEdit>();

// Track deferred updates that should be applied after editing completes
interface DeferredUpdate {
  table: string;
  entityId: string;
  data: Record<string, unknown>;
  remoteUpdatedAt: string;
  deferredAt: number;
}

const deferredUpdates = new Map<string, DeferredUpdate>();

// Callback for applying deferred updates
let applyDeferredCallback: ((update: DeferredUpdate) => Promise<void>) | null = null;

// Create a unique key for table + entity
function makeKey(table: string, entityId: string): string {
  return `${table}:${entityId}`;
}

/**
 * Mark an entity as being actively edited.
 * Call this when a user focuses on an input field.
 */
export function markEditing(table: string, entityId: string, field?: string): void {
  const key = makeKey(table, entityId);
  const now = Date.now();

  const existing = activeEdits.get(key);
  if (existing) {
    // Update activity time
    existing.lastActivityAt = now;
    if (field) existing.field = field;
  } else {
    activeEdits.set(key, {
      startedAt: now,
      lastActivityAt: now,
      field
    });
  }
}

/**
 * Update activity time for an entity being edited.
 * Call this on each keystroke/change to extend protection.
 */
export function updateEditActivity(table: string, entityId: string): void {
  const key = makeKey(table, entityId);
  const edit = activeEdits.get(key);
  if (edit) {
    edit.lastActivityAt = Date.now();
  }
}

/**
 * Clear editing status for an entity.
 * Call this when the user blurs from the input field.
 * Any deferred updates will be applied.
 */
export function clearEditing(table: string, entityId: string): void {
  const key = makeKey(table, entityId);
  activeEdits.delete(key);

  // Check if there's a deferred update to apply
  const deferred = deferredUpdates.get(key);
  if (deferred) {
    deferredUpdates.delete(key);
    applyDeferredUpdate(deferred);
  }
}

/**
 * Check if an entity is currently being edited.
 * Returns true if the entity should be protected from remote overwrites.
 */
export function isBeingEdited(table: string, entityId: string): boolean {
  const key = makeKey(table, entityId);
  const edit = activeEdits.get(key);

  if (!edit) return false;

  const timeSinceActivity = Date.now() - edit.lastActivityAt;
  if (timeSinceActivity > EDIT_PROTECTION_MS) {
    // Protection expired, clean up
    activeEdits.delete(key);
    return false;
  }

  return true;
}

/**
 * Defer a remote update for later application.
 * Call this when a remote update arrives for an entity being edited.
 */
export function deferUpdate(
  table: string,
  entityId: string,
  data: Record<string, unknown>,
  remoteUpdatedAt: string
): void {
  const key = makeKey(table, entityId);

  // Check if there's already a deferred update
  const existing = deferredUpdates.get(key);
  if (existing) {
    // Only keep the newer update
    if (remoteUpdatedAt > existing.remoteUpdatedAt) {
      existing.data = data;
      existing.remoteUpdatedAt = remoteUpdatedAt;
      existing.deferredAt = Date.now();
    }
  } else {
    deferredUpdates.set(key, {
      table,
      entityId,
      data,
      remoteUpdatedAt,
      deferredAt: Date.now()
    });
  }
}

/**
 * Apply a deferred update.
 */
async function applyDeferredUpdate(update: DeferredUpdate): Promise<void> {
  if (applyDeferredCallback) {
    try {
      await applyDeferredCallback(update);
    } catch (e) {
      console.error('[EditProtection] Failed to apply deferred update:', e);
    }
  }
}

/**
 * Set the callback for applying deferred updates.
 * The callback should update the local database with the deferred data.
 */
export function setApplyDeferredCallback(
  callback: (update: DeferredUpdate) => Promise<void>
): void {
  applyDeferredCallback = callback;
}

/**
 * Get all currently deferred updates.
 * Useful for debugging.
 */
function getDeferredUpdates(): DeferredUpdate[] {
  return Array.from(deferredUpdates.values());
}

/**
 * Get all currently active edits.
 * Useful for debugging.
 */
function getActiveEdits(): Array<{
  table: string;
  entityId: string;
  field?: string;
  startedAt: number;
  lastActivityAt: number;
}> {
  return Array.from(activeEdits.entries()).map(([key, edit]) => {
    const [table, entityId] = key.split(':');
    return {
      table,
      entityId,
      ...edit
    };
  });
}

/**
 * Clean up expired entries.
 * Called periodically to prevent memory leaks.
 */
function cleanupExpired(): void {
  const now = Date.now();

  // Clean up expired active edits
  for (const [key, edit] of activeEdits) {
    if (now - edit.lastActivityAt > EDIT_PROTECTION_MS) {
      activeEdits.delete(key);

      // Check for deferred updates to apply
      const deferred = deferredUpdates.get(key);
      if (deferred) {
        deferredUpdates.delete(key);
        applyDeferredUpdate(deferred);
      }
    }
  }

  // Clean up very old deferred updates (>1 minute) as a safety net
  // These shouldn't exist normally, but could if editing was never cleared
  const maxDeferredAge = 60000;
  for (const [key, update] of deferredUpdates) {
    if (now - update.deferredAt > maxDeferredAge) {
      deferredUpdates.delete(key);
      // Don't apply - too old, probably stale
      console.warn('[EditProtection] Discarding stale deferred update:', key);
    }
  }
}

// Start periodic cleanup
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startEditProtection(): void {
  if (typeof window === 'undefined') return;

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  cleanupInterval = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
}

export function stopEditProtection(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  activeEdits.clear();
  deferredUpdates.clear();
}

// Expose for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__stellarEditProtection = () => {
    console.log('=== STELLAR EDIT PROTECTION ===');
    console.log('Active edits:');
    for (const edit of getActiveEdits()) {
      const age = Math.round((Date.now() - edit.lastActivityAt) / 1000);
      console.log(`  ${edit.table}:${edit.entityId}${edit.field ? ` (${edit.field})` : ''} - ${age}s ago`);
    }
    console.log('');
    console.log('Deferred updates:');
    for (const update of getDeferredUpdates()) {
      const age = Math.round((Date.now() - update.deferredAt) / 1000);
      console.log(`  ${update.table}:${update.entityId} - deferred ${age}s ago`);
    }
    return {
      activeEdits: getActiveEdits(),
      deferredUpdates: getDeferredUpdates()
    };
  };
}
