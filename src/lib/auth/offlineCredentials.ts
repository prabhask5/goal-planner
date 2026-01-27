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
  // Validate inputs to prevent storing incomplete credentials
  if (!email || !password) {
    console.error('[Auth] Cannot cache credentials: email or password is empty');
    throw new Error('Cannot cache credentials: email or password is empty');
  }

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

  // Verify the credentials were stored correctly (paranoid check)
  const stored = await db.offlineCredentials.get(CREDENTIALS_ID);
  if (!stored || !stored.password) {
    console.error('[Auth] Credentials were not stored correctly - password missing');
    throw new Error('Failed to store credentials: password not persisted');
  }
}

/**
 * Get cached offline credentials
 * Returns null if no credentials are cached or if credentials are in old format
 */
export async function getOfflineCredentials(): Promise<OfflineCredentials | null> {
  const credentials = await db.offlineCredentials.get(CREDENTIALS_ID);
  if (!credentials) {
    return null;
  }

  // MIGRATION: Detect old-format credentials that used password hashing
  // Old format had 'passwordHash' and 'salt' fields instead of 'password'
  // These cannot be migrated (can't unhash), so we clear them and force re-login
  const legacyCredentials = credentials as Record<string, unknown>;
  if (legacyCredentials.passwordHash || legacyCredentials.salt || !credentials.password) {
    console.warn('[Auth] Detected old-format credentials (hashed password) - clearing and requiring fresh login');
    await db.offlineCredentials.delete(CREDENTIALS_ID);
    return null;
  }

  return credentials;
}

/**
 * Verify email and password against cached credentials
 * @param email - The email to verify
 * @param password - The password to verify
 * @param expectedUserId - The userId that the credentials should belong to
 * @returns Object with valid boolean and optional reason for failure
 */
export async function verifyOfflineCredentials(
  email: string,
  password: string,
  expectedUserId: string
): Promise<{ valid: boolean; reason?: string }> {
  const credentials = await getOfflineCredentials();
  if (!credentials) {
    console.warn('[Auth] No credentials found in database');
    return { valid: false, reason: 'no_credentials' };
  }

  // SECURITY: Verify all fields match
  if (credentials.userId !== expectedUserId) {
    console.warn('[Auth] Credential userId mismatch:', credentials.userId, '!==', expectedUserId);
    return { valid: false, reason: 'user_mismatch' };
  }

  if (credentials.email !== email) {
    console.warn('[Auth] Credential email mismatch:', credentials.email, '!==', email);
    return { valid: false, reason: 'email_mismatch' };
  }

  if (!credentials.password) {
    console.warn('[Auth] No password stored in credentials');
    return { valid: false, reason: 'no_stored_password' };
  }

  if (credentials.password !== password) {
    console.warn('[Auth] Password mismatch (stored length:', credentials.password.length, ', entered length:', password.length, ')');
    return { valid: false, reason: 'password_mismatch' };
  }

  return { valid: true };
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
