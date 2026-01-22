/**
 * Auth State Store
 * Tracks the current authentication mode (supabase/offline/none)
 */

import { writable, derived, type Readable } from 'svelte/store';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  mode: AuthMode;
  session: Session | null;          // Supabase session (when mode is 'supabase')
  offlineProfile: OfflineCredentials | null;  // Cached profile (when mode is 'offline')
  isLoading: boolean;
  authKickedMessage: string | null; // Message to show when user is kicked back to login
}

function createAuthStateStore() {
  const { subscribe, set, update } = writable<AuthState>({
    mode: 'none',
    session: null,
    offlineProfile: null,
    isLoading: true,
    authKickedMessage: null
  });

  return {
    subscribe,

    /**
     * Set auth mode to Supabase with session
     */
    setSupabaseAuth(session: Session): void {
      update(state => ({
        ...state,
        mode: 'supabase',
        session,
        offlineProfile: null,
        isLoading: false,
        authKickedMessage: null
      }));
    },

    /**
     * Set auth mode to offline with cached profile
     */
    setOfflineAuth(profile: OfflineCredentials): void {
      update(state => ({
        ...state,
        mode: 'offline',
        session: null,
        offlineProfile: profile,
        isLoading: false,
        authKickedMessage: null
      }));
    },

    /**
     * Set auth mode to none (no session)
     */
    setNoAuth(kickedMessage?: string): void {
      update(state => ({
        ...state,
        mode: 'none',
        session: null,
        offlineProfile: null,
        isLoading: false,
        authKickedMessage: kickedMessage || null
      }));
    },

    /**
     * Set loading state
     */
    setLoading(isLoading: boolean): void {
      update(state => ({ ...state, isLoading }));
    },

    /**
     * Clear the auth kicked message
     */
    clearKickedMessage(): void {
      update(state => ({ ...state, authKickedMessage: null }));
    },

    /**
     * Update the Supabase session (for token refresh)
     */
    updateSession(session: Session | null): void {
      update(state => {
        if (!session) {
          // Session was cleared - if online, set no auth
          // If offline and was in supabase mode, we'll check offline session elsewhere
          return {
            ...state,
            session: null
          };
        }
        return {
          ...state,
          session,
          mode: 'supabase'
        };
      });
    },

    /**
     * Update user profile info in the session
     * Used when profile is updated to immediately reflect changes in UI
     */
    updateUserProfile(firstName: string, lastName: string): void {
      update(state => {
        if (state.mode === 'supabase' && state.session) {
          return {
            ...state,
            session: {
              ...state.session,
              user: {
                ...state.session.user,
                user_metadata: {
                  ...state.session.user.user_metadata,
                  first_name: firstName,
                  last_name: lastName
                }
              }
            }
          };
        }
        if (state.mode === 'offline' && state.offlineProfile) {
          return {
            ...state,
            offlineProfile: {
              ...state.offlineProfile,
              firstName,
              lastName
            }
          };
        }
        return state;
      });
    },

    /**
     * Reset to initial state
     */
    reset(): void {
      set({
        mode: 'none',
        session: null,
        offlineProfile: null,
        isLoading: true,
        authKickedMessage: null
      });
    }
  };
}

export const authState = createAuthStateStore();

// Derived store for getting user display info
export const userDisplayInfo: Readable<{
  firstName: string;
  lastName: string;
  email: string;
} | null> = derived(
  authState,
  $authState => {
    if ($authState.mode === 'supabase' && $authState.session) {
      const user = $authState.session.user;
      return {
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        email: user.email || ''
      };
    }
    if ($authState.mode === 'offline' && $authState.offlineProfile) {
      return {
        firstName: $authState.offlineProfile.firstName,
        lastName: $authState.offlineProfile.lastName,
        email: $authState.offlineProfile.email
      };
    }
    return null;
  }
);
