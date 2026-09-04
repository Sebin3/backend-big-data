import bcrypt from 'bcryptjs'
import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'
import { ApiError } from '../utils/ApiError.js'

const TABLE = () => config.supabase.usersTable || 'users'

/**
 * Devuelve el perfil público de un usuario.
 */
export async function getProfile(userId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .select('id, name, email, avatar_url, company, role, permissions, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Actualiza campos editables del perfil del usuario.
 * Nunca permite cambiar email ni password por aquí.
 */
export async function updateProfile(userId, patches) {
  const db = getDbClient()

  const updates = {}
  if (patches.name !== undefined && patches.name !== null) {
    const name = String(patches.name).trim()
    if (name) updates.name = name
  }
  if (patches.avatarUrl !== undefined) updates.avatar_url = patches.avatarUrl
  if (patches.company !== undefined) updates.company = patches.company

  if (Object.keys(updates).length === 0) {
    return getProfile(userId)
  }

  const { data, error } = await db
    .from(TABLE())
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, name, email, avatar_url, company, role, permissions, created_at')
    .single()
  if (error) throw error
  return data
}

const saltRounds = 10

/**
 * Cambia la contraseña de un usuario validando la actual.
 * A los usuarios creados solo con Google (sin contraseña) se les permite
 * establecer una por primera vez enviando currentPassword vacío.
 */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const db = getDbClient()

  const { data: user, error } = await db
    .from(TABLE())
    .select('password_hash')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!user) {
    throw ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND')
  }

  const hasHash = Boolean(user.password_hash)
  if (hasHash) {
    const valid = await bcrypt.compare(currentPassword ?? '', user.password_hash)
    if (!valid) {
      throw ApiError.badRequest('La contraseña actual es incorrecta.', 'INVALID_CREDENTIALS')
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, saltRounds)
  const { error: updateError } = await db
    .from(TABLE())
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (updateError) throw updateError

  return { changed: true }
}
