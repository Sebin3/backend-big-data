-- ============================================================
--  Big Data CRM - Migración: sistema de roles y acceso a datasets
--  Ejecutar en SQL Editor de Supabase
-- ============================================================

-- 1) Columna de PERMISOS de módulo en users (jsonb, opcional)
alter table public.users
  add column if not exists permissions jsonb default '{}'::jsonb;

-- 2) TABLA: dataset_access (qué datasets puede ver cada analista)
create table if not exists public.dataset_access (
  id          uuid primary key default gen_random_uuid(),
  analyst_id  uuid not null references public.users (id) on delete cascade,
  dataset_id  uuid not null references public.datasets (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (analyst_id, dataset_id)
);

comment on table public.dataset_access is 'Acceso de analistas a datasets (el admin los asigna)';

create index if not exists idx_dataset_access_analyst on public.dataset_access (analyst_id);
create index if not exists idx_dataset_access_dataset on public.dataset_access (dataset_id);

-- 3) RLS (el backend usa service_role, que lo ignora; se mantiene para flexibilidad)
alter table public.dataset_access enable row level security;

drop policy if exists "service dataset_access all" on public.dataset_access;
create policy "service dataset_access all"
  on public.dataset_access
  for all
  using (true)
  with check (true);

-- 4) Marcar el PRIMER SUPERADMIN. Cambia el correo por el tuyo y descomenta:
-- update public.users set role = 'superadmin' where email = 'sebstianperezz9@gmail.com';
