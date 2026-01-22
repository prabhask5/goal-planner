/**
 * Offline Credentials Management
 * Handles caching, retrieval, and verification of user credentials for offline login
 */

import { db } from '$lib/db/schema';
import type { OfflineCredentials } from '$lib/types';
import type { User, Session } from '@supabase/supabase-js';
import { hashPassword, generateSalt, verifyPassword } from './crypto';

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
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const credentials: OfflineCredentials = {
    id: CREDENTIALS_ID,
    userId: user.id,
    email: email,
    passwordHash: passwordHash,
    salt: salt,
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
 * Verify a password against cached credentials
 * @returns true if password matches the cached hash
 */
export async function verifyOfflinePassword(password: string): Promise<boolean> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    return false;
  }

  return verifyPassword(password, credentials.salt, credentials.passwordHash);
}

/**
 * Update the cached password hash (after online password change)
 * @param newPassword - The new plaintext password to hash and cache
 */
export async function updateOfflineCredentialsPassword(newPassword: string): Promise<void> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    return;
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  await db.offlineCredentials.update(CREDENTIALS_ID, {
    passwordHash: newHash,
    salt: newSalt,
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
