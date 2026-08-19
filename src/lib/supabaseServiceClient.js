// Privileged Supabase access is intentionally unavailable in browser code.
// A service-role credential bypasses Row Level Security and must only be used
// by a trusted backend after it has verified the caller's Cognito identity.
export function getSupabaseServiceClient() {
  return null;
}
