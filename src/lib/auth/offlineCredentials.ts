/**
 * Offline Credentials Management
 * Handles caching, retrieval, and verification of user credentials for offline login
 */

import { db } from '$lib/db/schema';
import type { OfflineCredentials } from '$lib/types';
import type { User, Session } from '@supabase/supabase-js';

const CREDENTIALS_ID = 'current_user';

/**
 * Cache user credentials for offline login
 * Called after successful Supabase login
 */
export async function cacheOfflineCredentials(
  email: string,
  password: string,
  user: User,
  _session: Session
): Promise<void> {
  const credentials: OfflineCredentials = {
    id: CREDENTIALS_ID,
    userId: user.id,
    email: email,
    password: password,
    firstName: user.user_metadata?.first_name || '',
    lastName: user.user_metadata?.last_name || '',
    cachedAt: new Date().toISOString()
  };

  // Use put to insert or update the singleton record
  await db.offlineCredentials.put(credentials);
}

/**
 * Get cached offline credentials
 * Returns null if no credentials are cached
 */
export async function getOfflineCredentials(): Promise<OfflineCredentials | null> {
  const credentials = await db.offlineCredentials.get(CREDENTIALS_ID);
  return credentials || null;
}

/**
 * Verify email and password against cached credentials
 * @param email - The email to verify
 * @param password - The password to verify
 * @param expectedUserId - The userId that the credentials should belong to
 * @returns true if credentials exist, belong to the expected user, and email/password match
 */
export async function verifyOfflineCredentials(
  email: string,
  password: string,
  expectedUserId: string
): Promise<boolean> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    return false;
  }

  // SECURITY: Verify all fields match
  if (credentials.userId !== expectedUserId) {
    console.warn('[Auth] Credential userId mismatch');
    return false;
  }

  if (credentials.email !== email) {
    console.warn('[Auth] Credential email mismatch');
    return false;
  }

  if (credentials.password !== password) {
    return false;
  }

  return true;
}

/**
 * Update the cached password (after online password change)
 * @param newPassword - The new password to cache
 */
export async function updateOfflineCredentialsPassword(newPassword: string): Promise<void> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    return;
  }

  await db.offlineCredentials.update(CREDENTIALS_ID, {
    password: newPassword,
    cachedAt: new Date().toISOString()
  });
}

/**
 * Update user profile in cached credentials (after online profile update)
 */
export async function updateOfflineCredentialsProfile(
  firstName: string,
  lastName: string
): Promise<void> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    return;
  }

  await db.offlineCredentials.update(CREDENTIALS_ID, {
    firstName,
    lastName,
    cachedAt: new Date().toISOString()
  });
}

/**
 * Clear all cached offline credentials (on logout)
 */
export async function clearOfflineCredentials(): Promise<void> {
  await db.offlineCredentials.delete(CREDENTIALS_ID);
}
