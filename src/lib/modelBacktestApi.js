import { getCanonicalValidationKey } from "../config/modelValidationSpecs.js";
import { getModelPerformanceSummaries } from "./modelPerformanceApi.js";

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

export async function getModelBacktestAvailability() {
  try {
    const rows = await getModelPerformanceSummaries();
    const grouped = {};

    for (const row of rows ?? []) {
      const modelKey = getCanonicalValidationKey(row.model_key);
      if (!grouped[modelKey]) grouped[modelKey] = [];
      grouped[modelKey].push(row);
    }

    const models = Object.fromEntries(
      Object.entries(grouped).map(([modelKey, modelRows]) => {
        const sortedRows = [...modelRows].sort((left, right) => {
          const leftTime = new Date(left.last_evaluated_at ?? 0).getTime();
          const rightTime = new Date(right.last_evaluated_at ?? 0).getTime();
          return rightTime - leftTime;
        });

        const latest = sortedRows[0] ?? null;

        return [
          modelKey,
          {
            modelKey,
            hasRuntimeMetrics: sortedRows.length > 0,
            runtimeSource: "supabase:model_performance_backtests",
            latestEvaluatedAt: latest?.last_evaluated_at ?? null,
            metricCount: sortedRows.length,
            metricNames: unique(sortedRows.map((row) => row.metric_name)),
            notes: unique(sortedRows.map((row) => row.notes)),
            rows: sortedRows,
          },
        ];
      })
    );

    return {
      ok: true,
      hasRuntimeMetrics: rows.length > 0,
      models,
      limitations: rows.length
        ? [
            "Runtime status is derived from Supabase metric rows, not direct frontend access to local backtest artifact files.",
          ]
        : [
            "No runtime backtest metric rows are available in Supabase.",
            "Local dry-run artifacts are not exposed directly to the browser runtime in the current app architecture.",
          ],
    };
  } catch {
    return {
      ok: false,
      hasRuntimeMetrics: false,
      models: {},
      limitations: [
        "Backtest runtime metadata could not be loaded.",
        "The page can still render from validation specs, signal audit data, and model confidence metadata.",
      ],
    };
  }
}
