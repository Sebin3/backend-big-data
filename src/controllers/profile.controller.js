import { ApiError } from '../utils/ApiError.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import {
  getProfile,
  updateProfile,
  changePassword as updateUserPassword,
} from '../services/profile.service.js';

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

/**
 * GET /api/users/me
 * Perfil completo del usuario autenticado.
 */
export async function me(req, res, next) {
  try {
    requireSupabase()
    const profile = await getProfile(req.user.id)
    if (!profile) {
      throw ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND')
    }
    res.json({ success: true, data: { user: profile } })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/users/me
 * Actualiza el perfil del usuario autenticado.
 * Cuerpo: { name?, avatarUrl?, company?, role? }
 */
export async function update(req, res, next) {
  try {
    requireSupabase()
    const profile = await updateProfile(req.user.id, req.body ?? {})
    res.json({ success: true, data: { user: profile } })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/users/me/password
 * Cambia la contraseña del usuario autenticado.
 * Cuerpo: { currentPassword, newPassword }
 */
export async function changePassword(req, res, next) {
  try {
    requireSupabase()
    const { currentPassword = '', newPassword = '' } = req.body ?? {}
    if (String(newPassword).length < 6) {
      throw ApiError.badRequest(
        'La nueva contraseña debe tener al menos 6 caracteres.',
        'VALIDATION_ERROR',
      )
    }
    const result = await updateUserPassword(req.user.id, { currentPassword, newPassword })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}
