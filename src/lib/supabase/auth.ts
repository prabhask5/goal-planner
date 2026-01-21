import { supabase } from './client';
import type { User, Session } from '@supabase/supabase-js';
import { cacheOfflineCredentials, clearOfflineCredentials, updateOfflineCredentialsPassword, updateOfflineCredentialsProfile } from '$lib/auth/offlineCredentials';
import { clearOfflineSession } from '$lib/auth/offlineSession';

export interface UserProfile {
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: string | null;
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  // Cache credentials for offline use on successful login
  if (!error && data.session && data.user) {
    try {
      await cacheOfflineCredentials(email, password, data.user, data.session);
    } catch (e) {
      // Don't fail login if credential caching fails
      console.error('[Auth] Failed to cache offline credentials:', e);
    }
  }

  return {
    user: data.user,
    session: data.session,
    error: error?.message || null
  };
}

export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<AuthResponse> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName
      }
    }
  });

  return {
    user: data.user,
    session: data.session,
    error: error?.message || null
  };
}

export async function signOut(): Promise<{ error: string | null }> {
  // Clear offline credentials and session first
  try {
    await clearOfflineCredentials();
    await clearOfflineSession();
  } catch (e) {
    console.error('[Auth] Failed to clear offline data:', e);
  }

  const { error } = await supabase.auth.signOut();
  return { error: error?.message || null };
}

export async function getSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[Auth] getSession error:', error.message);
      // If session retrieval fails, it might be corrupted - try to sign out to clear it
      if (error.message?.includes('hash') || error.message?.includes('undefined')) {
        console.warn('[Auth] Detected corrupted session, attempting to clear');
        await supabase.auth.signOut();
      }
      return null;
    }
    return data.session;
  } catch (e) {
    console.error('[Auth] Unexpected error getting session:', e);
    // Attempt to clear any corrupted state
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut errors
    }
    return null;
  }
}

export function getUserProfile(user: User | null): UserProfile {
  return {
    firstName: user?.user_metadata?.first_name || '',
    lastName: user?.user_metadata?.last_name || ''
  };
}

/**
 * Update user profile (first name, last name)
 * Also updates cached offline credentials
 */
export async function updateProfile(
  firstName: string,
  lastName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: firstName,
      last_name: lastName
    }
  });

  if (!error) {
    // Update offline cache
    try {
      await updateOfflineCredentialsProfile(firstName, lastName);
    } catch (e) {
      console.error('[Auth] Failed to update offline profile:', e);
    }
  }

  return { error: error?.message || null };
}

/**
 * Change user password
 * Verifies current password first, then updates
 * Also updates cached offline credentials
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  // Get current user email
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: 'No authenticated user found' };
  }

  // Verify current password by attempting to sign in
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  });

  if (verifyError) {
    return { error: 'Current password is incorrect' };
  }

  // Update password
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (!error) {
    // Update offline cache with new password
    try {
      await updateOfflineCredentialsPassword(newPassword);
    } catch (e) {
      console.error('[Auth] Failed to update offline password:', e);
    }
  }

  return { error: error?.message || null };
}

/**
 * Resend confirmation email for signup
 * Should be rate-limited on the client side (30 second cooldown)
 */
export async function resendConfirmationEmail(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email
  });

  return { error: error?.message || null };
}

