# Big Data CRM — Backend (Express + Supabase)

API REST de autenticación con **registro/login + verificación OTP por correo** y
**login con Google (Gmail)**, construida con **Express** y **Supabase** como base
de datos.

> Este repo es el backend. El frontend (React/Vite) se conecta por HTTP a esta API.

---

## 🚀 Puesta en marcha rápida

```bash
npm install          # instala dependencias
npm run dev          # arranca en modo desarrollo (puerto 4000)
```

El servidor arranca aunque Supabase aún no esté configurado (solo avisa por
consola). Sigue la **`SETUP.md`** para activar Supabase y el envío de OTP.

---

## 🗂️ Estructura del proyecto

```
backend-big-data/
├── .env.example          # Plantilla de variables de entorno
├── SETUP.md              # GUÍA COMPLETA: Supabase + OTP (léela)
├── README.md             # Este archivo
├── package.json
└── src/
    ├── server.js         # Punto de entrada (arranca el servidor)
    ├── app.js            # Configuración de Express (cors, json, rutas)
    ├── config/
    │   ├── index.js      # Centraliza variables del .env
    │   └── supabase.js   # Clientes de Supabase (public + admin)
    ├── routes/
    │   ├── index.js      # Monta los módulos de rutas
    │   ├── auth.routes.js# Rutas de autenticación
    │   ├── dataset.routes.js # Datasets (CSV procesados)
    │   ├── table.routes.js   # Tablas del panel (ofertas, campañas, libres)
    │   ├── pipeline.routes.js# Pipeline de ventas
    │   └── user.routes.js    # Perfil del usuario
    ├── controllers/
    │   ├── auth.controller.js  # Lógica de registr/login/verify/me
    │   ├── dataset.controller.js  # CRUD de datasets
    │   ├── table.controller.js     # CRUD de tablas de usuario
    │   ├── pipeline.controller.js  # Mapeos de pipeline
    │   └── profile.controller.js   # Perfil y contraseña
    ├── services/
    │   ├── user.service.js    # Operaciones sobre la tabla users
    │   ├── otp.service.js     # Generación/validación de OTP + envío
    │   ├── mailer.service.js  # Envío de correos (SMTP o Resend)
    │   ├── google-oauth.service.js  # Login/registro con Google (Gmail)
    │   ├── dataset.service.js # Operaciones sobre la tabla datasets
    │   ├── table.service.js   # Operaciones sobre user_tables
    │   ├── pipeline.service.js# Operaciones sobre pipeline_maps
    │   └── profile.service.js # Perfil y cambio de contraseña
    ├── middleware/
    │   ├── auth.js       # Protege rutas con JWT
    │   ├── validate.js   # Validación de body
    │   ├── rateLimit.js  # Límites de peticiones
    │   └── error.js      # Manejo central de errores
    └── utils/
        ├── ApiError.js   # Errores con estado y código
        └── jwt.js        # Firmar/verificar JWT
```

La estructura está pensada para **crecer**: nuevos módulos se agregan como
`routes/<modulo>.routes.js` + `controllers/<modulo>.controller.js` +
`services/<modulo>.service.js` y se montan en `routes/index.js`.

---

## 📡 API de datos (módulos autenticados)

Cada llamada a estos endpoints requiere el header `Authorization: Bearer <token>`
obtenido en `/api/auth/verify` o `/api/auth/google`.

### Datasets (`/api/datasets`)

| Método | Ruta            | Descripción                                              |
| ------ | --------------- | -------------------------------------------------------- |
| GET    | `/api/datasets`        | Historial (metadatos) de los datasets del usuario |
| GET    | `/api/datasets/:id`    | Dataset completo (filas + análisis)                |
| POST   | `/api/datasets`        | Guarda/actualiza un dataset (body = objeto `Dataset`) |
| DELETE | `/api/datasets/:id`    | Elimina un dataset                                 |

### Tablas de usuario (`/api/tables`)

| Método | Ruta            | Descripción                                              |
| ------ | --------------- | -------------------------------------------------------- |
| GET    | `/api/tables`         | Lista tablas (campos, sin filas)                   |
| GET    | `/api/tables/:id`     | Tabla completa (con filas)                         |
| POST   | `/api/tables`         | Crea/reemplaza una tabla                           |
| PUT    | `/api/tables/:id`     | Actualiza una tabla                                |
| DELETE | `/api/tables/:id`     | Elimina una tabla                                  |

### Pipeline (`/api/pipelines`)

| Método | Ruta                     | Descripción                                   |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/api/pipelines`         | Todos los mapeos del usuario                  |
| GET    | `/api/pipelines/:datasetId` | Mapeo de un dataset concreto               |
| PUT    | `/api/pipelines/:datasetId` | Crea/actualiza el mapeo del dataset         |
| DELETE | `/api/pipelines/:datasetId` | Elimina el mapeo de un dataset              |

### Usuario (`/api/users`)

| Método | Ruta                  | Descripción                                 |
| ------ | --------------------- | ------------------------------------------- |
| GET    | `/api/users/me`       | Perfil del usuario autenticado               |
| PUT    | `/api/users/me`       | Actualiza perfil (`name`, `avatarUrl`, `company`, `role`) |
| PUT    | `/api/users/me/password` | Cambia la contraseña (`currentPassword`, `newPassword`) |

---

## 🔐 Flujo de autenticación

```
[Registro]       name + email + password  →  /api/auth/register
[Login]          email + password         →  /api/auth/login
                      │
                      ▼
          (se envía código de 6 dígitos por correo)
                      │
                      ▼
[Verificar]      email + code  →  /api/auth/verify  →  { token, user }
                      │
                      ▼
          [Dashboard]  usa el token en el header:  Authorization: Bearer <token>
```

---

## ⚙️ Variables de entorno

Copia `.env.example` a `.env` y complétalo. Las claves principales:

| Variable                     | Descripción                                    |
| ---------------------------- | ---------------------------------------------- |
| `PORT`                       | Puerto del servidor (4000)                     |
| `FRONTEND_URL`               | URL del frontend para CORS                     |
| `SUPABASE_URL`               | URL de tu proyecto Supabase                    |
| `SUPABASE_ANON_KEY`          | Key pública (anon)                             |
| `SUPABASE_SERVICE_ROLE_KEY`  | Key secreta (solo servidor) para escritura     |
| `JWT_SECRET`                 | Secreto para firmar tokens de sesión           |
| `GOOGLE_CLIENT_ID`           | Client ID de Google (login con Gmail)          |
| `GOOGLE_CLIENT_SECRET`       | Client Secret de Google (flujo con redirección)|
| `OTP_EXPIRES_MINUTES`        | Minutos de validez del código (5)              |
| `SMTP_*` o `RESEND_*`        | Configuración del correo para el OTP           |

> En desarrollo el código OTP se imprime en la consola para poder probar sin
> esperar el correo. Consulta `SETUP.md` sección **6**.

---

## 📊 Tablas para copiar y pegar en Supabase

> **Doc completo y detallado: [`SUPABASE.md`](./SUPABASE.md)** (5 tablas: `users`,
> `otp_codes`, `datasets`, `user_tables`, `pipeline_maps`).

Abre tu proyecto en https://supabase.com/dashboard → **SQL Editor** → pega el
SQL de **`SUPABASE.md`** → **Run**.

El esquema mínimo de autenticación (solo `users` y `otp_codes`) es este:

```sql
-- ============================================================
--  Big Data CRM - Esquema inicial
--  Ejecutar en SQL Editor de Supabase
-- ============================================================

-- Extensión para generar UUIDs
create extension if not exists "pgcrypto";

-- ---------- TABLA: users ----------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text,                 -- null si el usuario se registró solo con Google
  google_id     text unique,          -- id del usuario en Google (login con Gmail)
  avatar_url    text,                 -- foto de perfil (Google) o null
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.users is 'Usuarios registrados de la aplicación';

-- ---------- TABLA: otp_codes ----------
create table if not exists public.otp_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used       boolean not null default false
);

comment on table public.otp_codes is 'Códigos OTP de verificación temporal';

-- Índices para búsquedas rápidas
create index if not exists idx_otp_email on public.otp_codes (email);
create index if not exists idx_otp_code  on public.otp_codes (code);

-- ---------- Seguridad (RLS) ----------
-- El backend usa la service_role key, que ignora RLS. Para evitar
-- bloqueos y mantenerlo simple, habilitamos RLS pero permitimos
-- el acceso público de solo lectura al backend NO es necesario
-- porque service_role lo ignora. Aun así dejamos RLS habilitado
-- con políticas abiertas para flexibilidad futura.

alter table public.users    enable row level security;
alter table public.otp_codes enable row level security;

create policy "service read users"     on public.users    for select using (true);
create policy "service insert users"         on public.users    for insert with check (true);
create policy "service update users"         on public.users    for update using (true);
create policy "service delete users"         on public.users    for delete using (true);

create policy "service read otp"  on public.otp_codes for select using (true);
create policy "service write otp" on public.otp_codes for all using (true) with check (true);
```

> Nota: si prefieres no usar `service_role`, hay que crear políticas más estrictas
> basadas en `auth.uid()`. El flujo actual usa `service_role` en el servidor, que
> es el enfoque recomendado para backends.

---

## 🧪 Probar la API

Ver estado del servidor:

```bash
curl http://localhost:4000/api/health
```

Ver la guía completa de pruebas con `curl` en **`SETUP.md`** (sección 7).

---

## ☁️ Despliegue en Railway

El repo ya incluye `Procfile` y `railway.json`. Railway inicia con `npm start` y escucha en `0.0.0.0:$PORT`.

### 1. Subir a GitHub (sin credenciales)

```bash
git init
git add .
git commit -m "chore: backend listo para deploy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

> `.gitignore` ya excluye `.env` (credenciales). Solo se sube `.env.example` (con placeholders).

### 2. Crear servicio en Railway

1. Railway → **New Project** → **Deploy from GitHub repo** → elige tu repo.
2. Railway detecta el `Procfile`/`railway.json` automáticamente.

### 3. Configurar variables de entorno en Railway

En Railway → tu servicio → **Variables** agrega TODAS estas (pega tus valores reales del `.env` local):

```
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://tu-frontend.vercel.app
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_USERS_TABLE=users
SUPABASE_DATASETS_TABLE=datasets
SUPABASE_TABLES_TABLE=user_tables
SUPABASE_PIPELINES_TABLE=pipeline_maps
SUPABASE_DATASET_ACCESS_TABLE=dataset_access
SUPABASE_CLEANING_LOGS_TABLE=cleaning_logs
SUPABASE_INVITATIONS_TABLE=invitations
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://TU-SERVICIO.up.railway.app/api/auth/google/callback
JWT_SECRET=una_larga_secreta_aleatoria
JWT_EXPIRES_IN=7d
OTP_EXPIRES_MINUTES=5
OTP_LENGTH=6
BREVO_API_KEY=...
BREVO_FROM=...
BREVO_FROM_NAME=SendAquaLM
```

> **Importante — Google OAuth:** tras desplegar, tu URL cambia a `https://TU-SERVICIO.up.railway.app`. Actualiza el `GOOGLE_REDIRECT_URI` y agrégalo a las URIs autorizadas en Google Cloud → Credentials → tu OAuth Client ID. También actualiza `FRONTEND_URL` en el frontend y en el CORS.

### 4. Verificar

```bash
curl https://TU-SERVICIO.up.railway.app/api/health
```

Debe responder `{ "success": true, "status": "ok" }`.

### CORS

El backend ya acepta un `FRONTEND_URL` o varios separados por coma:
`FRONTEND_URL=https://a.net,https://b.net`

---

## 🛠️ Scripts

| Comando        | Descripción                          |
| -------------- | ------------------------------------ |
| `npm run dev`  | Arranca con recarga automática       |
| `npm start`    | Arranca en producción                |
| `npm run lint` | Ejecuta linter                        |
