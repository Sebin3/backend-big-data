# Esquema de Supabase — Big Data CRM

Documento completo y detallado de **todas las tablas** que necesita el backend
(Express) de Big Data CRM, con tipos, constraints, índices, relaciones y
políticas de seguridad (RLS) listas para pegar en el **SQL Editor** de Supabase.

> Al final de este documento está el **SQL completo** en un solo bloque para que
> lo copies y ejecutes de una vez. Léelo para entender cada tabla antes.

---

## 1. Resumen de tablas

| Tabla              | Descripción                                                            | Backend la usa en        |
| ------------------ | ---------------------------------------------------------------------- | ------------------------ |
| `users`            | Usuarios registrados (correo+contraseña o Google). Perfil editable.     | auth, `users`            |
| `otp_codes`        | Códigos OTP temporales de verificación por correo.                     | auth                     |
| `datasets`         | CSVs procesados por el usuario, con análisis completo (JSON).           | `/api/datasets`          |
| `user_tables`      | Tablas creadas desde el panel (ofertas, campañas, libres).             | `/api/tables`            |
| `pipeline_maps`    | Mapeo de columnas y probabilidades del pipeline de ventas por dataset. | `/api/pipelines`         |

Todas las tablas **pertenecen a un usuario** (`user_id`) y se consultan siempre
con ese filtro. El backend usa la **service_role key**, que ignora RLS; aun así
dejamos RLS habilitado con políticas abiertas para flexibilidad futura y buena
práctica.

---

## 2. Tabla `users`

Usuarios de la aplicación. La contraseña **nunca se guarda en texto plano**, solo
su hash (`password_hash`). Los usuarios creados solo con Google no tienen hash.

| Columna         | Tipo        | Constrains                          | Descripción                                  |
| --------------- | ----------- | ----------------------------------- | -------------------------------------------- |
| `id`            | `uuid`      | PK, default `gen_random_uuid()`     | Identificador único del usuario              |
| `name`          | `text`      | NOT NULL                            | Nombre completo                              |
| `email`         | `text`      | NOT NULL, UNIQUE                    | Correo (se guarda en minúsculas)             |
| `password_hash` | `text`      | NULL permitido                      | Hash bcrypt; NULL = cuenta solo Google       |
| `google_id`     | `text`      | UNIQUE                              | ID de Google (login con Gmail)               |
| `avatar_url`    | `text`      | NULL permitido                      | Foto de perfil (Google u otra)               |
| `company`       | `text`      | NULL permitido                      | Empresa del usuario (perfil)                 |
| `role`          | `text`      | DEFAULT `'user'`                    | Rol: `user` / `admin` (futuro)               |
| `created_at`    | `timestamptz`| DEFAULT `now()`                    | Fecha de alta                                |
| `updated_at`    | `timestamptz`| DEFAULT `now()`                    | Última modificación                          |

**Índices:** UNIQUE automáticos sobre `email` y `google_id`.

---

## 3. Tabla `otp_codes`

Códigos de 6 dígitos enviados por correo para verificar registro/login. Un
código se considera consumido (`used = true`) al validarlo, y al pedir uno nuevo
se invalidan los anteriores del mismo correo.

| Columna      | Tipo         | Constrains                       | Descripción                        |
| ------------ | ------------ | -------------------------------- | ---------------------------------- |
| `id`         | `uuid`       | PK, default `gen_random_uuid()`  | ID del registro                    |
| `email`      | `text`       | NOT NULL                         | Correo al que se envió             |
| `code`       | `text`       | NOT NULL                         | Código numérico (6 dígitos)        |
| `expires_at` | `timestamptz`| NOT NULL                         | Fecha de expiración                |
| `used`       | `boolean`    | DEFAULT `false`                  | `true` si ya fue validado          |
| `created_at` | `timestamptz`| DEFAULT `now()`                  | Cuándo se emitió                   |

**Índices:** `idx_otp_email` sobre `(email)`, `idx_otp_code` sobre `(code)` para
validar rápido.

---

## 4. Tabla `datasets`

Cada CSV procesado en el panel. **El análisis completo** del motor (tipos de
columna, estadísticos, insights, filas) se guarda como `jsonb`, así el backend
solo persiste lo que el frontend ya calculó.

> El `id` lo genera el **cliente** (UUID v4) y se usa como llave primaria. Para
> que el upsert del backend sea seguro por usuario existe además la restricción
> UNIQUE `(user_id, id)`.

| Columna            | Tipo          | Constrains                       | Descripción                                    |
| ------------------ | ------------- | -------------------------------- | ---------------------------------------------- |
| `id`               | `uuid`        | PK (lo genera el cliente)        | Identificador del dataset (único global)       |
| `user_id`          | `uuid`        | NOT NULL, FK → `users(id)`, ON DELETE CASCADE | Dueño                            |
| `file_name`        | `text`        | NOT NULL                         | Nombre del archivo original                    |
| `size_bytes`       | `integer`     | NULL permitido                   | Peso del archivo en bytes                      |
| `uploaded_at`      | `timestamptz` | DEFAULT `now()`                  | Fecha de carga                                 |
| `process_ms`       | `real`        | NULL permitido                   | Milisegundos del procesamiento                 |
| `row_count`        | `integer`     | NULL permitido                   | Filas del dataset                              |
| `column_count`     | `integer`     | NULL permitido                   | Columnas detectadas                            |
| `total_cells`      | `integer`     | NULL permitido                   | Filas × columnas                               |
| `missing_cells`    | `integer`     | NULL permitido                   | Celdas vacías                                  |
| `duplicate_rows`   | `integer`     | DEFAULT `0`                      | Filas duplicadas detectadas                    |
| `completeness`     | `numeric`     | NULL permitido                   | Porcentaje de completitud (0–100)              |
| `delimiter`        | `text`        | NULL permitido                   | Separador del CSV (`,`, `;`, `\t`, `\|`)       |
| `headers`          | `jsonb`       | DEFAULT `'[]'`                   | Arreglo de nombres de columna                  |
| `columns`          | `jsonb`       | DEFAULT `'[]'`                   | Perfiles por columna (`ColumnProfile[]`)       |
| `roles`            | `jsonb`       | DEFAULT `'{}'`                   | Roles semánticos (`{date, revenue, category}`) |
| `insights`         | `jsonb`       | DEFAULT `'{}'`                   | Insights calculados (timeline, histograma…)    |
| `rows`             | `jsonb`       | DEFAULT `'[]'`                   | Filas completas (`Record<string,string>[]`)    |
| `parse_meta`       | `jsonb`       | DEFAULT `'null'`                 | Metadatos de lectura del archivo               |
| `created_at`       | `timestamptz` | DEFAULT `now()`                  | Inserción en BD                                |
| `updated_at`       | `timestamptz` | DEFAULT `now()`                  | Última actualización                           |

**Índices:**
- UNIQUE `(user_id, id)` — garantiza el upsert seguro por usuario.
- `idx_datasets_user_uploaded` sobre `(user_id, uploaded_at desc)` para el historial.

**Nota sobre `rows`:** con archivos grandes el `jsonb` puede pesar bastante.
Supabase maneja JSONB de decenas de MB sin problemas, pero es el único campo
que podría crecer mucho; si más adelante sobra espacio, se puede migrar a una
tabla hija `dataset_rows`.

---

## 5. Tabla `user_tables`

Tablas que el usuario crea en el panel: ofertas, campañas, tablas libres y la
tabla fija de **oportunidades manuales del pipeline** (`pipeline-oportunidades`).

> El `id` es **texto** porque el frontend lo genera así (ej.
> `tabla-ofertas-m3x9ab`, `pipeline-oportunidades`), no es UUID.

| Columna       | Tipo         | Constrains                       | Descripción                                    |
| ------------- | ------------ | -------------------------------- | ---------------------------------------------- |
| `id`          | `text`       | PK (lo genera el cliente)        | Identificador de la tabla                      |
| `user_id`     | `uuid`       | NOT NULL, FK → `users(id)`, ON DELETE CASCADE | Dueño                            |
| `name`        | `text`       | NOT NULL                         | Nombre visible (ej. «Ofertas 2026»)            |
| `description` | `text`       | DEFAULT `''`                     | Descripción                                    |
| `icon`        | `text`       | DEFAULT `'table'`                | Ícono (`percent`, `megaphone`, `table`, …)     |
| `group_name`  | `text`       | DEFAULT `'libre'`                | Grupo: `ofertas`, `campanas`, `pipeline`, `libre` |
| `fields`      | `jsonb`      | DEFAULT `'[]'`                   | Definición de columnas (`FieldDef[]`)          |
| `rows`        | `jsonb`      | DEFAULT `'[]'`                   | Filas (`TableRow[]`, una por campo)            |
| `row_count`   | `integer`    | DEFAULT `0`                      | Denormalizado = `length(rows)`                 |
| `created_at`  | `timestamptz`| DEFAULT `now()`                  | Fecha de creación                              |
| `updated_at`  | `timestamptz`| DEFAULT `now()`                  | Última edición (el frontend la calcula)        |

**Índices:** UNIQUE `(user_id, id)`.

**Forma de un campo (`FieldDef`):**
```json
{
  "key": "descuento",
  "label": "Descuento",
  "kind": "percent",
  "options": ["Porcentaje", "2x1"],
  "locked": true
}
```

---

## 6. Tabla `pipeline_maps`

Configuración del **pipeline de ventas**: qué columna del dataset cumple cada
rol (etapa, monto, responsable, fecha de cierre) y las probabilidades de cierre
por etapa. Máximo **un mapeo por dataset y usuario**.

| Columna          | Tipo          | Constrains                       | Descripción                              |
| ---------------- | ------------- | -------------------------------- | ---------------------------------------- |
| `id`             | `uuid`        | PK, default `gen_random_uuid()`  | ID del mapeo                             |
| `user_id`        | `uuid`        | NOT NULL, FK → `users(id)`, ON DELETE CASCADE | Dueño                    |
| `dataset_id`     | `uuid`        | NOT NULL, FK → `datasets(id)`, ON DELETE CASCADE | Dataset al que aplica      |
| `stage`          | `text`        | DEFAULT `''`                     | Columna de etapa (o vacía)               |
| `amount`         | `text`        | DEFAULT `''`                     | Columna de monto                         |
| `owner`          | `text`        | DEFAULT `''`                     | Columna de responsable                   |
| `close_date`     | `text`        | DEFAULT `''`                     | Columna de fecha de cierre               |
| `probabilities`  | `jsonb`       | DEFAULT `'{}'`                   | `{ "Propuesta": 50, "Ganado": 100 }`     |
| `created_at`     | `timestamptz` | DEFAULT `now()`                  | Fecha de creación                        |
| `updated_at`     | `timestamptz` | DEFAULT `now()`                  | Última actualización                     |

**Índices:** UNIQUE `(user_id, dataset_id)` — es la llave de upsert del backend.

---

## 7. Políticas de seguridad (RLS)

El backend opera con la `service_role key`, que **no pasa por RLS**. Habilitamos
RLS con políticas abiertas para que *si* algún día se conecta el frontend
directo (anon key), no falle; y como buena práctica de seguridad.

| Tabla          | Política                              | Operaciones |
| -------------- | ------------------------------------- | ----------- |
| `users`        | `service users`                       | ALL (open)  |
| `otp_codes`    | `service read otp` / `service write otp` | ALL     |
| `datasets`     | `service datasets`                    | ALL (open)  |
| `user_tables`  | `service user_tables`                 | ALL (open)  |
| `pipeline_maps`| `service pipeline_maps`               | ALL (open)  |

> Si en el futuro quieres que el **frontend** acceda directo, crea políticas
> `USING (user_id = auth.uid())`. Para el backend actual con service_role, las
> políticas abiertas son suficientes.

---

## 8. SQL completo para Supabase

Copia todo este bloque en **Supabase → SQL Editor → Run**:

```sql
-- ============================================================
--  Big Data CRM - Esquema completo
--  Ejecutar en SQL Editor de Supabase (idempotente)
-- ============================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ============================================================
--  TABLA: users
-- ============================================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text,
  google_id     text unique,
  avatar_url    text,
  company       text,
  role          text not null default 'user',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.users is 'Usuarios registrados de la aplicación';

-- ============================================================
--  TABLA: otp_codes
-- ============================================================
create table if not exists public.otp_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used       boolean not null default false
);

comment on table public.otp_codes is 'Códigos OTP de verificación temporal';

create index if not exists idx_otp_email on public.otp_codes (email);
create index if not exists idx_otp_code  on public.otp_codes (code);

-- ============================================================
--  TABLA: datasets  (CSV procesados con su análisis completo)
-- ============================================================
create table if not exists public.datasets (
  id              uuid primary key,
  user_id         uuid not null references public.users (id) on delete cascade,
  file_name       text not null,
  size_bytes      integer,
  uploaded_at     timestamptz not null default now(),
  process_ms      real,
  row_count       integer,
  column_count    integer,
  total_cells     integer,
  missing_cells   integer,
  duplicate_rows  integer not null default 0,
  completeness    numeric,
  delimiter       text,
  headers         jsonb not null default '[]'::jsonb,
  columns         jsonb not null default '[]'::jsonb,
  roles           jsonb not null default '{}'::jsonb,
  insights        jsonb not null default '{}'::jsonb,
  rows            jsonb not null default '[]'::jsonb,
  parse_meta      jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.datasets is 'Datasets (CSV) procesados por el usuario, con análisis completo';

-- Llave única compuesta: permite upsert seguro sin pisar datos de otro usuario
create unique index if not exists uq_datasets_user_id
  on public.datasets (user_id, id);

-- Historial por usuario (más reciente primero)
create index if not exists idx_datasets_user_uploaded
  on public.datasets (user_id, uploaded_at desc);

-- ============================================================
--  TABLA: user_tables  (tablas del panel: ofertas, campañas, libres)
-- ============================================================
create table if not exists public.user_tables (
  id          text not null,
  user_id     uuid not null references public.users (id) on delete cascade,
  name        text not null,
  description text not null default '',
  icon        text not null default 'table',
  group_name  text not null default 'libre',
  fields      jsonb not null default '[]'::jsonb,
  rows        jsonb not null default '[]'::jsonb,
  row_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.user_tables is 'Tablas creadas por el usuario en el panel';

create unique index if not exists uq_user_tables_user_id
  on public.user_tables (user_id, id);

-- ============================================================
--  TABLA: pipeline_maps  (mapeo de columnas y probabilidades)
-- ============================================================
create table if not exists public.pipeline_maps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  dataset_id    uuid not null references public.datasets (id) on delete cascade,
  stage         text not null default '',
  amount        text not null default '',
  owner         text not null default '',
  close_date    text not null default '',
  probabilities jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.pipeline_maps is 'Configuración del pipeline de ventas por dataset';

-- Un solo mapeo por dataset y usuario (llave de upsert)
create unique index if not exists uq_pipeline_user_dataset
  on public.pipeline_maps (user_id, dataset_id);

-- ============================================================
--  SEGURIDAD (RLS)
--  El backend usa la service_role key (ignora RLS). Habilitamos RLS
--  con políticas abiertas para no bloquear accesos futuros.
-- ============================================================
alter table public.users         enable row level security;
alter table public.otp_codes     enable row level security;
alter table public.datasets      enable row level security;
alter table public.user_tables   enable row level security;
alter table public.pipeline_maps enable row level security;

create policy "service users"         on public.users         for all using (true) with check (true);
create policy "service read otp"      on public.otp_codes     for select using (true);
create policy "service write otp"     on public.otp_codes     for all using (true) with check (true);
create policy "service datasets"      on public.datasets      for all using (true) with check (true);
create policy "service user_tables"   on public.user_tables   for all using (true) with check (true);
create policy "service pipeline_maps" on public.pipeline_maps for all using (true) with check (true);
```

---

## 9. Verificación rápida

Después de ejecutar el SQL, ve a **Table Editor** y comprueba que existen las 5
tablas. Prueba también en SQL Editor:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Debería devolver: `datasets`, `otp_codes`, `pipeline_maps`, `user_tables`,
`users`.

> El backend no necesita más configuración: las claves `SUPABASE_URL`,
> `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del `.env` son las mismas
> que ya usabas para auth.