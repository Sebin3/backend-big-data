import crypto from 'node:crypto'
import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'
import { ApiError } from '../utils/ApiError.js'
import { sendEmail } from './mailer.service.js'

const TABLE = () => config.supabase.invitationsTable || 'invitations'

const INVITATION_ROLES = ['analyst', 'admin', 'auditor']

const DAYS = 4

/**
 * Genera un código de invitación alfanumérico legible: INV-XXXX-XXXX
 */
export function generateInvitationCode() {
  const block = () =>
    crypto.randomBytes(2).toString('hex').toUpperCase()
  return `INV-${block()}-${block()}`
}

/**
 * Crea una invitación, guarda en Supabase y (si hay email) envía el correo.
 * Cuerpo: { email?, role?, maxUses?, expiresAt? }
 */
export async function createInvitation(createdBy, { email, role = 'analyst', maxUses = 1, expiresAt = null }) {
  const db = getDbClient()

  if (!INVITATION_ROLES.includes(role)) {
    throw ApiError.badRequest(
      `Rol de invitación no válido (${INVITATION_ROLES.join(', ')}).`,
      'INVALID_ROLE',
    )
  }
  if (email) {
    const normEmail = String(email).trim().toLowerCase()
    const { data: existing } = await db.from(config.supabase.usersTable).select('id').eq('email', normEmail).maybeSingle()
    if (existing) {
      throw ApiError.conflict('Ya existe una cuenta con este correo.', 'EMAIL_IN_USE')
    }
    email = normEmail
  }

  const code = generateInvitationCode()
  const finalMax = Math.max(1, Number(maxUses) || 1)
  const expires = expiresAt ? new Date(expiresAt).toISOString() : new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from(TABLE())
    .insert({
      code,
      email: email ?? null,
      role,
      max_uses: finalMax,
      used_count: 0,
      expires_at: expires,
      active: true,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error

  return toPublic(data)
}

/**
 * Lista las invitaciones (ordenadas por creación desc).
 */
export async function listInvitations(createdBy) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .select('*')
    .eq('created_by', createdBy)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toPublic)
}

/**
 * Revoca una invitación (la desactiva).
 */
export async function revokeInvitation(createdBy, id) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .update({ active: false })
    .eq('id', id)
    .eq('created_by', createdBy)
    .select('*')
    .single()
  if (error) throw error
  return data ? toPublic(data) : null
}

/**
 * Valida un código de invitación para el registro.
 * - Debe existir, estar activo, no vencido y no agotado.
 * - Si la invitación tiene email, el email del registro debe coincidir.
 * Consume un uso y, si llega al máximo, la desactiva.
 */
export async function consumeInvitation({ code, email }) {
  const db = getDbClient()
  const normalizedCode = String(code || '').trim().toUpperCase()

  const { data: inv, error } = await db
    .from(TABLE())
    .select('*')
    .eq('code', normalizedCode)
    .maybeSingle()
  if (error) throw error

  if (!inv) {
    throw ApiError.badRequest('Código de invitación inválido.', 'INVALID_INVITE_CODE')
  }
  if (!inv.active) {
    throw ApiError.badRequest('La invitación ya no está activa.', 'INVITE_INACTIVE')
  }
  if (inv.expires_at && inv.expires_at < new Date().toISOString()) {
    throw ApiError.badRequest('La invitación ha expirado.', 'INVITE_EXPIRED')
  }
  if (inv.used_count >= inv.max_uses) {
    throw ApiError.badRequest('La invitación ya ha sido utilizada.', 'INVITE_USED')
  }
  if (inv.email) {
    const normEmail = String(email || '').trim().toLowerCase()
    if (normEmail !== inv.email) {
      throw ApiError.badRequest(
        'El código de invitación no corresponde a este correo.',
        'INVITE_EMAIL_MISMATCH',
      )
    }
  }

  const newCount = inv.used_count + 1
  const nextActive = newCount >= inv.max_uses ? false : true

  await db
    .from(TABLE())
    .update({ used_count: newCount, active: nextActive })
    .eq('id', inv.id)

  return { role: inv.role, email: inv.email ?? null }
}

/**
 * Envía el correo de invitación vía Brevo (con enlace de registro del frontend).
 */
export async function sendInvitationEmail({ to, code, role, expiresAt }) {
  const brand = config.email.brevo.name || 'SendAquaLM'
  const appUrl = config.publicAppUrl.replace(/\/+$/, '')
  const registerUrl = `${appUrl}/register?code=${encodeURIComponent(code)}&email=${encodeURIComponent(to)}`
  const roleLabel = { analyst: 'Analista', admin: 'Administrador', auditor: 'Auditor' }[role] || role
  const exp = expiresAt
    ? new Date(expiresAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  const subject = `Has sido invitado a ${brand}`
  const text = [
    `Equipo ${brand}`,
    '',
    'Hola,',
    '',
    `Has sido invitado a unirte a ${brand} como ${roleLabel}.`,
    '',
    `Tu código de invitación es:`,
    '',
    `   ${code}`,
    '',
    `Ingresa a: ${registerUrl}`,
    '',
    `La invitación expira el ${exp}.`,
    'Si no esperabas esta invitación, ignora este correo.',
    '',
    `Equipo ${brand}`,
  ].join('\n')

  const html = `
    <div style="background-color:#f6f8fa;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <table role="presentation" width="100%" style="max-width:460px;background-color:#ffffff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden;">
            <tr><td align="center" style="padding:28px 32px 8px 32px;">
              <div style="font-size:34px;line-height:1;">💧</div>
              <div style="margin-top:10px;font-size:22px;font-weight:600;color:#1a1a2e;">${brand}</div>
            </td></tr>
            <tr><td align="center" style="padding:20px 32px 0 32px;">
              <div style="font-size:15px;color:#24292f;"><b>Has sido invitado a ${brand}</b></div>
              <div style="margin-top:6px;font-size:14px;color:#57606a;">Se te ha invitado a unirte como <b>${roleLabel}</b>.</div>
            </td></tr>
            <tr><td align="center" style="padding:20px 32px;">
              <div style="font-size:13px;color:#57606a;margin-bottom:8px;">Tu código de invitación:</div>
              <div style="display:inline-block;font-size:22px;font-weight:700;letter-spacing:3px;background:#f1f3f9;padding:12px 22px;border-radius:6px;border:1px solid #d0d7de;color:#1a1a2e;">${code}</div>
            </td></tr>
            <tr><td align="center" style="padding:0 32px 20px 32px;">
              <a href="${registerUrl}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Regístrate ahora</a>
              <div style="margin-top:12px;font-size:12px;color:#8b949e;">La invitación expira el ${exp}.</div>
            </td></tr>
            <tr><td align="center" style="padding:16px 32px;background-color:#f6f8fa;border-top:1px solid #d0d7de;">
              <div style="font-size:12px;color:#57606a;">© ${new Date().getFullYear()} ${brand}. Todos los derechos reservados.</div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </div>
  `

  let emailResult = null
  try {
    emailResult = await sendEmail({ to, subject, text, html })
  } catch {
    emailResult = { sent: false }
  }

  // En desarrollo exponemos el código para poder probar sin correo real.
  if (config.env !== 'production') {
    console.log(`[INV-CODE] ${to}: ${code}`)
  }

  return { emailSent: emailResult.sent !== false, code }
}

function toPublic(row) {
  return {
    id: row.id,
    code: row.code,
    email: row.email ?? null,
    role: row.role,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    active: row.active,
    createdAt: row.created_at,
  }
}
