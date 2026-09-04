-- ============================================================
--  Big Data CRM - MIGRACIÓN DATASETS (copiar y pegar en SQL Editor)
--  Ejecutar DESPUÉS de la migración de roles (supabase_migracion.sql)
-- ============================================================

-- TABLA: cleaning_logs (historial de limpiezas de datasets)
create table if not exists public.cleaning_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  dataset_id  uuid not null references public.datasets (id) on delete cascade,
  action      text not null default 'clean',
  summary     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.cleaning_logs is 'Historial de operaciones de limpieza aplicadas a datasets';

create index if not exists idx_cleaning_logs_dataset on public.cleaning_logs (dataset_id);
create index if not exists idx_cleaning_logs_user on public.cleaning_logs (user_id);

alter table public.cleaning_logs enable row level security;

drop policy if exists "service cleaning_logs all" on public.cleaning_logs;
create policy "service cleaning_logs all"
  on public.cleaning_logs
  for all
  using (true)
  with check (true);
