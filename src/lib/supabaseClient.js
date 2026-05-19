import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

// Fall back to placeholder values so the module loads in environments (e.g. CI
// test runs) where VITE_SUPABASE_URL is not set. Tests that exercise Supabase
// calls should mock this module directly.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
