-- ============================================================================
-- BONK1ST - Per-user Sniper Configuration Persistence
-- Stores a user's saved sniper config keyed by session_id (same id used across app)
-- ============================================================================

create table if not exists public.sniper_configs (
  session_id text primary key,
  config jsonb not null,
  config_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sniper_configs_updated_at_idx
  on public.sniper_configs (updated_at desc);

-- Auto-update updated_at on any update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sniper_configs_set_updated_at on public.sniper_configs;
create trigger sniper_configs_set_updated_at
before update on public.sniper_configs
for each row
execute function public.set_updated_at();

