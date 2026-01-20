/**
 * Supabase client for Firefox extension
 * Uses the same project as the main Stellar app
 */

import browser from 'webextension-polyfill';
import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js';
import { config } from '../config';

const SUPABASE_URL = config.supabaseUrl;
const SUPABASE_ANON_KEY = config.supabaseAnonKey;

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storage: {
          // Use browser.storage.local for Firefox extension
          getItem: async (key: string) => {
            const result = await browser.storage.local.get(key);
            return result[key] || null;
          },
          setItem: async (key: string, value: string) => {
            await browser.storage.local.set({ [key]: value });
          },
          removeItem: async (key: string) => {
            await browser.storage.local.remove(key);
          },
        },
      },
    });
  }
  return supabaseInstance;
}

export async function signIn(email: string, password: string): Promise<{
  user: User | null;
  session: Session | null;
  error: Error | null;
}> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return {
    user: data?.user || null,
    session: data?.session || null,
    error: error ? new Error(error.message) : null,
  };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function getUser(): Promise<User | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

export type { Session, User };
