-- ============================================================
--  Big Data CRM - MIGRACIÓN INVITACIONES (copiar y pegar en SQL Editor)
--  Ejecutar DESPUÉS de supabase_migracion.sql
-- ============================================================

-- TABLA: invitations (registro controlado por código de invitación)
create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,              -- código compartido (INV-XXXX-XXXX)
  email        text,                              -- email del invitado (opcional; si va, el correo se envía automático)
  role         text not null default 'analyst',   -- rol que otorga: analyst | admin | auditor
  max_uses     int  not null default 1,           -- usos permitidos (default 1)
  used_count   int  not null default 0,           -- usos consumidos
  expires_at   timestamptz,                       -- fecha de expiración
  active       boolean not null default true,     -- activa / revocada
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.invitations is 'Códigos de invitación para el registro controlado de miembros';

create index if not exists idx_invitations_code on public.invitations (code);
create index if not exists idx_invitations_email on public.invitations (email);

alter table public.invitations enable row level security;

drop policy if exists "service invitations all" on public.invitations;
create policy "service invitations all"
  on public.invitations
  for all
  using (true)
  with check (true);
