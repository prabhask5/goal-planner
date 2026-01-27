/**
 * Offline Session Management
 * Handles creation, validation, and cleanup of offline sessions
 */

import { db } from '$lib/db/schema';
import type { OfflineSession } from '$lib/types';

const SESSION_ID = 'current_session';

// Offline sessions do NOT expire automatically (like Supabase refresh tokens)
// They are only revoked when:
// 1. User comes back online and re-authenticates successfully
// 2. User signs out while offline
// Security: All offline changes require re-auth before syncing to server

/**
 * Create a new offline session
 * @param userId - The Supabase user ID
 * @returns The created session
 */
export async function createOfflineSession(userId: string): Promise<OfflineSession> {
  const now = new Date();

  const session: OfflineSession = {
    id: SESSION_ID,
    userId: userId,
    offlineToken: crypto.randomUUID(),
    createdAt: now.toISOString()
  };

  // Use put to insert or update the singleton record
  await db.offlineSession.put(session);

  // Verify the session was persisted by reading it back
  // This ensures IndexedDB has flushed the write before we return
  const verified = await db.offlineSession.get(SESSION_ID);
  if (!verified) {
    throw new Error('Failed to persist offline session');
  }

  return session;
}

/**
 * Get the current offline session
 * Returns null if no session exists
 */
export async function getOfflineSession(): Promise<OfflineSession | null> {
  const session = await db.offlineSession.get(SESSION_ID);
  return session || null;
}

/**
 * Get a valid offline session
 * Returns null if no session exists
 * Note: Sessions don't expire - they're only revoked on re-auth or logout
 */
export async function getValidOfflineSession(): Promise<OfflineSession | null> {
  return await getOfflineSession();
}

/**
 * Check if there is a valid offline session
 */
export async function hasValidOfflineSession(): Promise<boolean> {
  const session = await getValidOfflineSession();
  return session !== null;
}

/**
 * Clear the offline session (on logout or session invalidation)
 */
export async function clearOfflineSession(): Promise<void> {
  await db.offlineSession.delete(SESSION_ID);
}

/**
 * Get session info for display purposes
 * Returns null if no valid session
 */
export async function getOfflineSessionInfo(): Promise<{
  userId: string;
  createdAt: Date;
} | null> {
  const session = await getValidOfflineSession();
  if (!session) {
    return null;
  }

  return {
    userId: session.userId,
    createdAt: new Date(session.createdAt)
  };
}
