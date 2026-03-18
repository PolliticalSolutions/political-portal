create extension if not exists "pgcrypto";

create table if not exists public.model_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  model_version text,
  variant_key text,
  baseline_cycle integer,
  target_cycle integer,
  run_timestamp timestamptz not null,
  run_mode text not null,
  metrics jsonb not null default '{}'::jsonb,
  signal_coverage_summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  artifact_path text,
  status text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_model_backtest_runs_model_key
  on public.model_backtest_runs(model_key);

create index if not exists idx_model_backtest_runs_variant_key
  on public.model_backtest_runs(variant_key);

create index if not exists idx_model_backtest_runs_target_cycle
  on public.model_backtest_runs(target_cycle);

create index if not exists idx_model_backtest_runs_run_timestamp
  on public.model_backtest_runs(run_timestamp desc);

create unique index if not exists idx_model_backtest_runs_unique_artifact
  on public.model_backtest_runs(model_key, coalesce(variant_key, ''), target_cycle, artifact_path);
