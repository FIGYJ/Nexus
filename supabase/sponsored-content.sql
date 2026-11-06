create table if not exists public.figyj_sponsored_config (
  id integer primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.figyj_sponsored_config enable row level security;
