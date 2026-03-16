import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
