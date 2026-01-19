import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    'Supabase environment variables not set. Please create a .env file with PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY'
  );
}

export const supabase: SupabaseClient = createClient(
  PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
);
