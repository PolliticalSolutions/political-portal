create extension if not exists "pgcrypto";

create table if not exists public.event_source_registry (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_url text,
  source_confidence_default text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_type_definitions (
  id uuid primary key default gen_random_uuid(),
  event_type_key text not null unique,
  label text not null,
  category text not null,
  suggested_severity_min integer,
  suggested_severity_max integer,
  default_weight_for_by_election_risk numeric,
  default_weight_for_vulnerability numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_history (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_date date not null,
  event_type text not null,
  event_severity integer,
  subject_type text not null,
  subject_name text,
  summary text not null,
  source_url text,
  source_confidence text not null,
  structured_tags jsonb not null default '[]'::jsonb,
  affects_by_election_risk boolean not null default false,
  affects_vulnerability boolean not null default false,
  notes text,
  source_registry_id uuid references public.event_source_registry(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.constituency_event_links (
  id uuid primary key default gen_random_uuid(),
  event_history_id uuid not null references public.event_history(id) on delete cascade,
  constituency_identifier text not null,
  constituency_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_history_event_date
  on public.event_history(event_date desc);

create index if not exists idx_event_history_event_type
  on public.event_history(event_type);

create index if not exists idx_constituency_event_links_constituency_identifier
  on public.constituency_event_links(constituency_identifier);
