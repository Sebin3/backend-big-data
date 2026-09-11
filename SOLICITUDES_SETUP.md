# Activar el módulo de solicitudes

## 1. Crear las tablas

Abre **Supabase → SQL Editor**, copia el contenido de
`sql/contact_requests_migracion.sql` y ejecútalo una sola vez.

## 2. Variables de Railway

Agrega estas variables al servicio del backend:

```env
SUPABASE_CONTACT_REQUESTS_TABLE=contact_requests
SUPABASE_CONTACT_MESSAGES_TABLE=contact_messages
CONTACT_NOTIFICATION_EMAIL=ventas@tu-dominio.com
CONTACT_REPLY_TO=ventas@tu-dominio.com
GOOGLE_GMAIL_REFRESH_TOKEN=...
GMAIL_INBOX_EMAIL=stvinpz@gmail.com
```

`CONTACT_NOTIFICATION_EMAIL` recibe cada contacto nuevo. `CONTACT_REPLY_TO`
es el buzón al que llegarán las respuestas normales mientras no se configure
el webhook de correo entrante.

Las variables de Brevo existentes también son obligatorias para enviar correo:

```env
BREVO_API_KEY=...
BREVO_FROM=remitente-verificado@tu-dominio.com
BREVO_FROM_NAME=Big Data CRM
```

## 3. Desplegar

Despliega primero el backend y después el frontend. El formulario público usa
`POST /api/contact-requests`; la bandeja privada está en
`/dashboard/solicitudes`.

Los roles `superadmin` y `admin` tienen acceso automáticamente. Otros usuarios
necesitan permisos `solicitudes.view`, `solicitudes.reply` y/o
`solicitudes.manage` desde **Usuarios y permisos**.

## Alcance de esta entrega

- Formulario público y protección honeypot/rate limit.
- Persistencia de solicitudes y mensajes.
- Confirmación al visitante y aviso al buzón comercial.
- Bandeja conversacional, notas internas, responsable, prioridad y estado.
- Respuesta al cliente mediante Brevo.

La sincronización automática de una respuesta enviada desde Gmail/Outlook hacia
la conversación está implementada mediante Gmail API. La bandeja consulta cada
60 segundos los mensajes con un código `SOL-...` en el asunto y también permite
sincronizar manualmente.

## Autorizar Gmail API

1. En el mismo proyecto de Google Cloud usado para el login, habilita **Gmail API**.
2. En la pantalla de consentimiento OAuth agrega `stvinpz@gmail.com` como usuario
   de prueba si la aplicación continúa en modo Testing.
3. Genera un refresh token con el alcance
   `https://www.googleapis.com/auth/gmail.readonly` usando el Client ID y Client
   Secret existentes.
4. Guarda el token solamente como `GOOGLE_GMAIL_REFRESH_TOKEN` en Railway.

No publiques el refresh token ni lo coloques en Vercel: permite leer el buzón y
debe existir únicamente en el backend.
