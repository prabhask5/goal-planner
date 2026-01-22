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

  return session;
}

/**
 * Get the current offline session
 * Returns null if no session exists
 */
async function getOfflineSession(): Promise<OfflineSession | null> {
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
 * Clear the offline session (on logout or session invalidation)
 */
export async function clearOfflineSession(): Promise<void> {
  await db.offlineSession.delete(SESSION_ID);
}

