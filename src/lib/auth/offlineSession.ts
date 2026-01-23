/**
 * Offline Session Management
 * Handles creation, validation, and cleanup of offline sessions
 */

import { db } from '$lib/db/schema';
import type { OfflineSession } from '$lib/types';
import { generateToken } from './crypto';

const SESSION_ID = 'current_session';

// Session duration in milliseconds (matches typical Supabase session: 1 hour)
// This can be adjusted based on Supabase configuration
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create a new offline session
 * @param userId - The Supabase user ID
 * @returns The created session
 */
export async function createOfflineSession(userId: string): Promise<OfflineSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const session: OfflineSession = {
    id: SESSION_ID,
    userId: userId,
    offlineToken: generateToken(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
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
 * Get a valid (non-expired) offline session
 * Returns null if no valid session exists
 */
export async function getValidOfflineSession(): Promise<OfflineSession | null> {
  const session = await getOfflineSession();
  if (!session) {
    return null;
  }

  // Check if session is expired
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);

  if (now >= expiresAt) {
    // Session expired - clear it
    await clearOfflineSession();
    return null;
  }

  return session;
}

/**
 * Check if there is a valid offline session
 */
export async function hasValidOfflineSession(): Promise<boolean> {
  const session = await getValidOfflineSession();
  return session !== null;
}

/**
 * Extend the offline session (refresh expiration)
 * Called when user is actively using the app offline
 */
export async function extendOfflineSession(): Promise<void> {
  const session = await getOfflineSession();
  if (!session) {
    return;
  }

  const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.offlineSession.update(SESSION_ID, {
    expiresAt: newExpiresAt.toISOString()
  });
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
  expiresAt: Date;
  remainingMs: number;
} | null> {
  const session = await getValidOfflineSession();
  if (!session) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  const remainingMs = expiresAt.getTime() - now.getTime();

  return {
    userId: session.userId,
    createdAt: new Date(session.createdAt),
    expiresAt,
    remainingMs
  };
}
