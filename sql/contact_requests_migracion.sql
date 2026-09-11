-- Módulo de solicitudes comerciales originadas en el landing.
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  name text not null,
  email text not null,
  phone text,
  company text,
  category text not null default 'informacion',
  preferred_channel text not null default 'email',
  status text not null default 'new' check (status in ('new','in_progress','answered','waiting_customer','closed','spam')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  assigned_to uuid references public.users(id) on delete set null,
  source text not null default 'landing',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.contact_requests(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null check (channel in ('web','email','internal')),
  body text not null,
  sender_email text,
  sender_user_id uuid references public.users(id) on delete set null,
  is_internal boolean not null default false,
  email_status text,
  provider_message_id text,
  created_at timestamptz not null default now()
);

-- Permite actualizar instalaciones donde las tablas ya fueron creadas.
alter table public.contact_messages
  add column if not exists provider_message_id text;
create unique index if not exists idx_contact_messages_provider
  on public.contact_messages(provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_contact_requests_status on public.contact_requests(status);
create index if not exists idx_contact_requests_last_message on public.contact_requests(last_message_at desc);
create index if not exists idx_contact_messages_request on public.contact_messages(request_id, created_at);

alter table public.contact_requests enable row level security;
alter table public.contact_messages enable row level security;
drop policy if exists "service contact requests all" on public.contact_requests;
drop policy if exists "service contact messages all" on public.contact_messages;

-- No se crean políticas para anon/authenticated: solo el backend con
-- service_role puede leer o escribir estos datos personales.
