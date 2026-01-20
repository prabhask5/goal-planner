import { supabase } from './client';
import type { User, Session } from '@supabase/supabase-js';

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

