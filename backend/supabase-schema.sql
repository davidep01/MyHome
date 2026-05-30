create table if not exists public.myhome_config (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.myhome_config enable row level security;

drop policy if exists "myhome_config_service_role_all" on public.myhome_config;
create policy "myhome_config_service_role_all"
on public.myhome_config
for all
to service_role
using (true)
with check (true);
