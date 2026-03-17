import { supabase } from "./supabaseClient.js";

export async function getModelPerformanceSummaries() {
  const { data, error } = await supabase
    .from("model_performance_backtests")
    .select("model_key, metric_name, metric_value, sample_size, last_evaluated_at, notes")
    .order("last_evaluated_at", { ascending: false });

  if (error) return [];
  return data ?? [];
}
