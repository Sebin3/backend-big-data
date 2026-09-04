# Guía de configuración: Supabase + OTP

Este documento explica **paso a paso** qué hacer para que el backend funcione con
Supabase y el envío de códigos OTP por correo. Léelo completo antes de empezar.

---

## 1. Requisitos previos

- Node.js **18 o superior** (recomendado 20+). Verifica con `node -v`.
- Una cuenta en [supabase.com](https://supabase.com) (gratis).
- Una cuenta de correo para enviar los OTP (Gmail, Outlook, o una API como Resend).

---

## 2. Base de datos en Supabase

En Supabase, **una base de datos NO es un cofre; es un conjunto de tablas**. El
backend se conecta a tu proyecto de Supabase y opera sobre dos tablas:

- `users` → guarda los usuarios registrados.
- `otp_codes` → guarda los códigos de verificación temporal.

### 2.1 Crear el proyecto

1. Entra a https://supabase.com/dashboard.
2. **New project** → ponle un nombre (ej. `big-data-crm`).
3. Elige una contraseña de base de datos (no la olvides, se usa para el SQL).
4. Elige región y crea. Espera 1-2 minutos a que se inicialice.

### 2.2 Crear las tablas

Una vez creado el proyecto:

1. Ve al menú lateral → **SQL Editor** → **New query**.
2. Pega el SQL completo que aparece en el **`SUPABASE.md`** (sección 8).
3. Haz clic en **Run**.
4. Deberías ver `Success`. En **Table Editor** aparecerán `users`, `otp_codes`,
   `datasets`, `user_tables` y `pipeline_maps`.

> El SQL ya configura los índices, las fechas por defecto, las bases por
> usuario y los permisos (RLS) para que el servicio `service_role` pueda leer y
> escribir.

---

## 3. Obtener las credenciales de Supabase

En el menú lateral → **Project Settings** → **API**:

| Variable                    | Dónde está en Supabase                        | Qué es                                                       |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`              | `Project URL`                                 | Ej: `https://abcd1234.supabase.co`                           |
| `SUPABASE_ANON_KEY`         | `anon / public`                               | Es pública, se usa en el cliente del navegador.              |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` (botón con candado)            | **SECRETA.** Solo servidor. Da acceso total a las tablas.    |

> **IMPORTANTE sobre `service_role`:** esta key puede leer/escribir sin pasar por
> las reglas de seguridad (RLS). Por eso **solo debe usarse en el backend**, nunca
> en el HTML/JavaScript del frontend.

---

## 4. Configurar el archivo `.env`

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Edita `.env` y pega tus valores:
   ```ini
   SUPABASE_URL=tu_url_real
   SUPABASE_ANON_KEY=tu_anon_real
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_real
   ```

3. Genera un secreto JWT fuerte:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   Pega el resultado en `JWT_SECRET`.

---

## 5. Configurar el envío de OTP (correo)

Tienes dos opciones. Elige **una**.

### Opción A) SMTP con Gmail (recomendado para probar)

Usa una **App Password** de Gmail (NO tu contraseña normal):

1. Activa la **Verificación en 2 pasos** en tu cuenta de Google
   (https://myaccount.google.com/security).
2. Entra a https://myaccount.google.com/apppasswords.
3. Crea una app password (ej. nombre "BigData") → te da una clave de 16 caracteres.
4. En tu `.env`:
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=tu_correo@gmail.com
   SMTP_PASS=la_clave_de_16_caracteres
   SMTP_FROM=Big Data CRM <tu_correo@gmail.com>
   SMTP_SECURE=false
   EMAIL_PROVIDER=smtp
   ```

> Si tu proveedor es Outlook: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`.

### Opción B) Resend (API moderna de correo)

1. Crea una cuenta en https://resend.com.
2. Ve a **API Keys** → **Create API Key** → copia la key.
3. Verifica un dominio (o usa el dominio de prueba `@resend.dev` para desarrollo).
4. En tu `.env`:
   ```ini
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_tu_clave
   RESEND_FROM=Big Data CRM <onboarding@resend.dev>
   ```

---

## 6. Modo desarrollo: el código se imprime en consola

Cuando el backend corre con `NODE_ENV=development` (por defecto), **el código OTP
también se imprime en la consola del servidor**:

```
[OTP-DEV] Código para user@mail.com: 827391
```

Esto te permite probar el flujo completo aunque el correo no llegue todavía
(por ejemplo si usas un dominio no verificado en Resend). En producción el código
**no** se imprime.

---

## 7. Probar el flujo completo

1. Inicia el backend:
   ```bash
   npm run dev
   ```
2. Abre otra terminal y prueba con `curl` (o usa Thunder Client / Postman).
   La API base es `http://localhost:4000/api`.

   **Registro** (crea la cuenta y envía OTP):
   ```bash
   curl -X POST http://localhost:4000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Juan Pérez","email":"juan@correo.com","password":"secreto123"}'
   ```

   **Verificación** (apunta el `code` de la consola o de tu correo):
   ```bash
   curl -X POST http://localhost:4000/api/auth/verify \
     -H "Content-Type: application/json" \
     -d '{"email":"juan@correo.com","code":"827391"}'
   ```

   Devuelve:
   ```json
   {
     "success": true,
     "data": {
       "token": "eyJhbGci...",
       "user": { "id": "...", "name": "Juan Pérez", "email": "juan@correo.com" }
     }
   }
   ```

   **Login** con un usuario existente:
   ```bash
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"juan@correo.com","password":"secreto123"}'
   ```
   Luego verifica igual que en registro.

---

## 8. Login y registro con Google (Gmail)

El backend ya tiene implementado el flujo de **"Continuar con Google"**. Solo
tienes que crear las credenciales en Google y pegarlas en el `.env`:

### 8.1 Crear credenciales en Google Cloud

1. Ve a https://console.cloud.google.com
2. Crea un proyecto (o usa uno existente).
3. Menú → **APIs & Services** → **OAuth consent screen**:
   - Elige **External**, llena nombre y correo, guarda.
4. Menú → **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**:
   - Tipo: **Web application**.
   - En **Authorized JavaScript origins** agrega tu frontend:
     `http://localhost:5173`
   - En **Authorized redirect URIs** agrega:
     `http://localhost:4000/api/auth/google/callback`
5. Copia el **Client ID** y el **Client Secret**.

### 8.2 Pegar las credenciales en el `.env`

```ini
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

> Las credenciales **no son secretas en el frontend** (el Client ID es público),
> pero el **Client Secret solo debe ir en el backend**, nunca en el código del
> navegador.

### 8.3 Cómo usarlo (dos formas)

**Opción A — ID token desde el frontend (recomendada):**
El frontend usa el SDK de Google (Google Identity Services), obtiene un
`credential` (ID token) y lo envía al backend:

```bash
curl -X POST http://localhost:4000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken":"EY_JWT_DEL_NAVEGADOR"}'
```

El backend verifica el token, crea o inicia sesión del usuario y devuelve tu
`token` JWT de sesión + los datos del usuario (igual que `/verify`).

**Opción B — Redirección del servidor (OAuth2 completo):**
El frontend redirige el navegador a:

```
http://localhost:4000/api/auth/google/authorize
```

Google autentica al usuario y redirige al callback
(`/api/auth/google/callback`), que intercambia el código y devuelve el token por
JSON.

> El endpoint `/api/auth/google/authorize` (genera la URL de Google) está
> disponible en el servicio `google-oauth.service.js` (`getAuthorizationUrl`).
> Si no lo necesitas aún puedes ignorarlo.

### 8.4 Notas importantes

- Si el correo de Google ya tiene cuenta normal (con contraseña), se **vincula**
  automáticamente el `google_id` a esa cuenta (misma persona, mismo perfil).
- Los usuarios creados solo por Google no tienen contraseña (`password_hash =
  NULL` en la tabla `users`).
- Si Google aún **no está configurado** (falta `GOOGLE_CLIENT_ID`), el endpoint
  responde `GOOGLE_NOT_CONFIGURED` con un mensaje claro.
- La tabla `users` ya incluye las columnas `google_id` y `avatar_url` en el SQL
  del README.

---

## 9. Endpoints disponibles

| Método | Ruta                        | Descripción                              | Auth |
| ------ | --------------------------- | ---------------------------------------- | ---- |
| POST   | `/api/auth/register`        | Crea cuenta y envía OTP                  | No   |
| POST   | `/api/auth/login`           | Valida credenciales y envía OTP          | No   |
| POST   | `/api/auth/verify`          | Verifica OTP y emite token JWT           | No   |
| POST   | `/api/auth/resend`          | Reenvía un nuevo código OTP              | No   |
| POST   | `/api/auth/google`          | Login/registro con Google (ID token)     | No   |
| GET    | `/api/auth/google/authorize` | Devuelve la URL de autorización de Google| No   |
| GET    | `/api/auth/google/callback` | Callback OAuth2 de Google (redirección)  | No   |
| GET    | `/api/auth/me`              | Devuelve el usuario del token            | Sí   |
| GET    | `/api/health`               | Estado del servidor                      | No   |

> Además de las rutas de **auth**, hay rutas autenticadas para datos
> (`/api/datasets`, `/api/tables`, `/api/pipelines`) y perfil
> (`/api/users/me`). Consulta el `README.md` → "API de datos".

Para `/me` envía el header: `Authorization: Bearer <token>`.

---

## 10. Errores comunes

| Mensaje                                      | Causa y solución                                          |
| -------------------------------------------- | --------------------------------------------------------- |
| `Invalid supabaseUrl`                        | `SUPABASE_URL` no empieza con `https://`. Copia el URL real. |
| Error 401/403 al insertar en `users`         | Revisa que pusiste `SUPABASE_SERVICE_ROLE_KEY`, no la anon. |
| `Failed to fetch` en el frontend             | El frontend no apunta al backend o CORS no incluye su URL. |
| El correo no llega                           | Usa la `App Password` de Gmail, o el modo dev (paso 6).    |
| `duplicate key` / 409                        | Ya existe un registro con ese email.                       |

---

## 11. Conectar el frontend

El backend expone su API en `http://localhost:4000/api`. En tu frontend React,
configura una variable de entorno (por ejemplo en un `.env` del frontend):

```
VITE_API_URL=http://localhost:4000/api
```

El flujo de tu frontend debe:
1. Llamar `POST /api/auth/register` o `POST /api/auth/login`.
2. Redirigir a tu página de verificación OTP.
3. Llamar `POST /api/auth/verify` con `{ email, code }`.
4. Guardar el `token` (en memoria, localStorage, etc.) y usarlo en el header
   `Authorization: Bearer <token>` en las llamadas autenticadas.
