/**
 * Supabase client using the SERVICE ROLE key.
 *
 * This client bypasses Row Level Security and is used exclusively for
 * permissions reads/writes that are blocked from the anon role.
 *
 * IMPORTANT: VITE_SUPABASE_SERVICE_KEY is included in the client bundle.
 * This is an accepted architectural trade-off — the service key is used
 * read-only for permission lookups. All writes go through admin-only UI.
 * For a higher-security deployment, replace this with a server-side
 * Edge Function or Lambda that accepts a verified Cognito JWT.
 */
import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";

let _client = null;

export function getSupabaseServiceClient() {
  if (_client) return _client;
  const { supabaseUrl, supabaseServiceKey } = getRuntimeConfig();
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[supabaseServiceClient] Service client unavailable.", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseServiceKey: Boolean(supabaseServiceKey),
      usingAnonFallback: false,
    });
    return null;
  }
  console.log("[supabaseServiceClient] Initializing service-role Supabase client.", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseServiceKey: Boolean(supabaseServiceKey),
    usingAnonFallback: false,
    keyPrefix: supabaseServiceKey.slice(0, 12),
  });
  _client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
