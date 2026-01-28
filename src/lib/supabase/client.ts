import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY } from '$env/static/public';

if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) {
  console.warn(
    'Supabase environment variables not set. Please create a .env file with PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'
  );
}

// Clear corrupted Supabase auth data from localStorage if it exists
// This prevents "can't access property 'hash'" errors during initialization
function clearCorruptedAuthData(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    // Supabase stores auth data with keys starting with 'sb-'
    const keysToCheck = Object.keys(localStorage).filter((key) => key.startsWith('sb-'));

    for (const key of keysToCheck) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          // Validate the parsed data has expected structure
          if (parsed && typeof parsed === 'object') {
            // Check for signs of corruption
            const hasCorruptedSession =
              // currentSession exists but missing required fields
              (parsed.currentSession && typeof parsed.currentSession !== 'object') ||
              // access_token exists but is not a string
              (parsed.access_token !== undefined && typeof parsed.access_token !== 'string') ||
              // expires_at exists but is not a number
              (parsed.expires_at !== undefined && typeof parsed.expires_at !== 'number');

            if (hasCorruptedSession) {
              console.warn('[Auth] Clearing corrupted session data:', key);
              localStorage.removeItem(key);
            }
          }
        } catch {
          // JSON parse failed - data is corrupted
          console.warn('[Auth] Clearing malformed session data:', key);
          localStorage.removeItem(key);
        }
      }
    }
  } catch (e) {
    console.error('[Auth] Error checking localStorage:', e);
  }
}

// Add global handler for unhandled Supabase auth errors
// This catches async initialization errors that we can't handle synchronously
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    // Check if this is a Supabase auth error
    if (reason && typeof reason === 'object' && 'message' in reason) {
      const message = String(reason.message || '');
      if (message.includes('hash') || message.includes("can't access property")) {
        console.warn('[Auth] Caught unhandled auth error, clearing storage');
        event.preventDefault(); // Prevent the error from showing in console
        // Clear Supabase storage
        try {
          const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));
          keys.forEach((k) => localStorage.removeItem(k));
          // Reload the page to get a fresh state
          window.location.reload();
        } catch {
          // Ignore storage errors
        }
      }
    }
  });
}

// Run cleanup before creating client
clearCorruptedAuthData();

export const supabase: SupabaseClient = createClient(
  PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'placeholder'
);
