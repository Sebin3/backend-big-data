import { ApiError } from '../utils/ApiError.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import { findUserById } from '../services/user.service.js'
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  sendInvitationEmail,
} from '../services/invitation.service.js'

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

/**
 * Pide que el usuario pueda gestionar invitaciones:
 * - superadmin siempre puede.
 * - admin/analyst solo si tiene el permiso invitations.gestionar (asignado por el superadmin).
 */
export async function requireInvitePermission(req, _res, next) {
  try {
    const user = await findUserById(req.user.id)
    if (!user) return next(ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND'))
    req.user.role = user.role

    if (user.role === 'superadmin') return next()

    const perms = user.permissions ?? {}
    if (perms.invitations?.gestionar === true) return next()

    return next(ApiError.forbidden('No tienes permiso para gestionar invitaciones.', 'FORBIDDEN'))
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/invitations
 * Crea una invitación y, si hay email, envía el correo automáticamente.
 * Cuerpo: { email?, role?, maxUses?, expiresAt? }
 */
export async function create(req, res, next) {
  try {
    requireSupabase()
    const { email, role, maxUses, expiresAt } = req.body ?? {}
    const invitation = await createInvitation(req.user.id, { email, role, maxUses, expiresAt })

    let emailResult = null
    if (invitation.email) {
      try {
        emailResult = await sendInvitationEmail({
          to: invitation.email,
          code: invitation.code,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        })
      } catch {
        emailResult = { emailSent: false }
      }
    }

    res.status(201).json({
      success: true,
      data: { invitation, emailSent: emailResult?.emailSent ?? null },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/invitations
 * Lista las invitaciones creadas por el usuario.
 */
export async function index(req, res, next) {
  try {
    requireSupabase()
    const invitations = await listInvitations(req.user.id)
    res.json({ success: true, data: { invitations } })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/invitations/:id
 * Revoca una invitación.
 */
export async function destroy(req, res, next) {
  try {
    requireSupabase()
    const invitation = await revokeInvitation(req.user.id, req.params.id)
    if (!invitation) {
      throw ApiError.notFound('Invitación no encontrada.', 'INVITATION_NOT_FOUND')
    }
    res.json({ success: true, data: { invitation } })
  } catch (err) {
    next(err)
  }
}
