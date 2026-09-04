import bcrypt from 'bcryptjs'
import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'

const USERS = () => config.supabase.usersTable
const ACCESS = () => config.supabase.datasetAccessTable

export const ROLE_RANK = { superadmin: 4, admin: 3, analyst: 2, auditor: 1, user: 0 }

const PUBLIC_FIELDS = 'id, name, email, company, avatar_url, role, permissions, created_at'

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company || null,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    permissions: row.permissions ?? {},
    createdAt: row.created_at,
  }
}

/**
 * Lista todos los usuarios de la organización.
 * Un admin no ve a los superadmins.
 */
export async function listUsers(actorRole = 'superadmin') {
  const db = getDbClient()
  let query = db.from(USERS()).select('id, name, email, company, avatar_url, role, permissions, created_at').order('created_at', { ascending: true })
  if (ROLE_RANK[actorRole] < ROLE_RANK.superadmin) {
    query = query.neq('role', 'superadmin')
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(publicUser)
}

/**
 * Crea un usuario (analyst, admin o superadmin).
 * - superadmin puede crear cualquier rol.
 * - admin solo puede crear analyst (o admin si lo permitimos? no: solo analyst).
 */
export async function createMember({ name, email, password, role = 'analyst', actorRole = 'superadmin' }) {
  const db = getDbClient()

  // Un admin NO puede crear admins ni superadmins (solo analyst)
  if (ROLE_RANK[actorRole] < ROLE_RANK.admin) {
    const err = new Error('No tienes permisos para crear usuarios.')
    err.code = 'FORBIDDEN'
    throw err
  }
  if (ROLE_RANK[actorRole] < ROLE_RANK.superadmin && role !== 'analyst') {
    const err = new Error('Un admin solo puede crear usuarios con rol analyst.')
    err.code = 'FORBIDDEN'
    throw err
  }

  const existing = await db.from(USERS()).select('id').eq('email', email).maybeSingle()
  if (existing.data) {
    const err = new Error('Ya existe un usuario con este correo.')
    err.code = 'EMAIL_IN_USE'
    throw err
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const { data, error } = await db
    .from(USERS())
    .insert({ name, email, password_hash: passwordHash, role })
    .select(PUBLIC_FIELDS)
    .single()
  if (error) throw error
  return publicUser(data)
}

/**
 * Cambia el rol de un usuario.
 * - superadmin puede cambiar cualquiera (excepto rebajar a otro superadmin, salvo que sea él).
 * - admin solo puede cambiar rol de analyst.
 */
export async function changeRole(id, newRole, actorRole = 'superadmin') {
  const db = getDbClient()

  const target = await db.from(USERS()).select('id, role').eq('id', id).maybeSingle()
  if (!target.data) {
    const err = new Error('Usuario no encontrado.')
    err.code = 'NOT_FOUND'
    throw err
  }

  const targetRole = target.data.role

  // Nadie puede rebajar ni modificar un superadmin
  if (targetRole === 'superadmin') {
    const err = new Error('No se puede modificar el rol de un superadmin.')
    err.code = 'FORBIDDEN'
    throw err
  }

  // Un admin solo maneja analyst, y no puede asignar admin/superadmin
  if (ROLE_RANK[actorRole] < ROLE_RANK.admin) {
    const err = new Error('No tienes permisos para cambiar roles.')
    err.code = 'FORBIDDEN'
    throw err
  }
  if (ROLE_RANK[actorRole] < ROLE_RANK.superadmin) {
    // admin: solo puede cambiar el rol de un analyst y solo dejarlo como analyst
    if (targetRole !== 'analyst' || newRole !== 'analyst') {
      const err = new Error('Un admin solo puede gestionar usuarios analyst.')
      err.code = 'FORBIDDEN'
      throw err
    }
  }

  const { data, error } = await db
    .from(USERS())
    .update({ role: newRole })
    .eq('id', id)
    .select(PUBLIC_FIELDS)
    .single()
  if (error) throw error
  return publicUser(data)
}

/**
 * Actualiza los permisos de módulo de un usuario (jsonb).
 */
export async function updatePermissions(id, permissions, actorRole = 'superadmin') {
  const db = getDbClient()

  const target = await db.from(USERS()).select('role').eq('id', id).maybeSingle()
  if (!target.data) {
    const err = new Error('Usuario no encontrado.')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (target.data.role === 'superadmin' && ROLE_RANK[actorRole] < ROLE_RANK.superadmin) {
    const err = new Error('No puedes modificar permisos de un superadmin.')
    err.code = 'FORBIDDEN'
    throw err
  }

  const { data, error } = await db
    .from(USERS())
    .update({ permissions })
    .eq('id', id)
    .select(PUBLIC_FIELDS)
    .single()
  if (error) throw error
  return publicUser(data)
}

/**
 * Lista el acceso a datasets de un usuario.
 */
export async function listDatasetAccess(analystId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(ACCESS())
    .select('dataset_id, dataset:datasets(id, file_name, row_count, uploaded_at)')
    .eq('analyst_id', analystId)
  if (error) throw error
  return (data ?? []).map((r) => r.dataset ?? { id: r.dataset_id })
}

/**
 * Reemplaza el acceso a datasets de un usuario.
 */
export async function updateDatasetAccess(analystId, datasetIds) {
  const db = getDbClient()
  const ids = [...new Set(datasetIds ?? [])].filter(Boolean)

  await db.from(ACCESS()).delete().eq('analyst_id', analystId)

  if (ids.length > 0) {
    const rows = ids.map((datasetId) => ({ analyst_id: analystId, dataset_id: datasetId }))
    const { error } = await db.from(ACCESS()).insert(rows)
    if (error) throw error
  }

  return listDatasetAccess(analystId)
}

/**
 * Elimina un usuario.
 * - superadmin elimina a cualquiera.
 * - admin solo elimina analyst (nunca superadmin/admin).
 */
export async function deleteUser(id, actorRole = 'superadmin') {
  const db = getDbClient()

  const target = await db.from(USERS()).select('role').eq('id', id).maybeSingle()
  if (!target.data) {
    const err = new Error('Usuario no encontrado.')
    err.code = 'NOT_FOUND'
    throw err
  }

  const targetRole = target.data.role
  if (targetRole === 'superadmin') {
    const err = new Error('No se puede eliminar un superadmin.')
    err.code = 'FORBIDDEN'
    throw err
  }
  if (ROLE_RANK[actorRole] < ROLE_RANK.admin && targetRole !== 'analyst') {
    const err = new Error('No tienes permisos para eliminar ese usuario.')
    err.code = 'FORBIDDEN'
    throw err
  }

  const { data, error } = await db
    .from(USERS())
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
