import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'

const tb = () => config.supabase.usersTable

/**
 * Busca un usuario por id.
 * Devuelve el registro o null si no existe.
 */
export async function findUserById(id) {
  const db = getDbClient()
  const { data, error } = await db
    .from(tb())
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Busca un usuario por email.
 * Devuelve el registro o null si no existe.
 */
export async function findUserByEmail(email) {
  const db = getDbClient()
  const { data, error } = await db
    .from(tb())
    .select('*')
    .eq('email', email)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Crea un usuario en Supabase.
 */
export async function createUser({ name, email, passwordHash, role = 'user', googleId = null, avatarUrl = null }) {
  const db = getDbClient()
  const { data, error } = await db
    .from(tb())
    .insert({
      name,
      email,
      password_hash: passwordHash,
      role,
      google_id: googleId,
      avatar_url: avatarUrl,
    })
    .select('id, name, email, created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Encuentra un usuario por su Google ID.
 */
export async function findUserByGoogleId(googleId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(tb())
    .select('*')
    .eq('google_id', googleId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Busca un usuario por Google; si no existe lo crea.
 * - Si ya existe uno con el mismo email, le vincula el google_id.
 * - Si no existe, crea una cuenta sin contraseña (acceso solo por Google).
 */
export async function findOrCreateGoogleUser(profile) {
  const byGoogleId = await findUserByGoogleId(profile.googleId)
  if (byGoogleId) return byGoogleId

  const byEmail = await findUserByEmail(profile.email)
  if (byEmail) {
    // Vincular google_id al usuario existente
    const db = getDbClient()
    const { data, error } = await db
      .from(tb())
      .update({ google_id: profile.googleId, avatar_url: profile.picture || null })
      .eq('id', byEmail.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  // Nuevo usuario (sin contraseña, solo Google)
  return createUser({
    name: profile.name,
    email: profile.email,
    passwordHash: null,
    googleId: profile.googleId,
    avatarUrl: profile.picture || null,
  })
}
