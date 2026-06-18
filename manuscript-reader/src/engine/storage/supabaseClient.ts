import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Env vars are set at build time by Vite (must be prefixed VITE_).
// In development add them to .env.local (gitignored).
// In production set them in your deployment config.
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      throw new Error('Supabase env vars not set (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _client;
}
