import { ApiError } from '../utils/ApiError.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import { findUserById } from '../services/user.service.js'
import {
  listUsers,
  createMember,
  changeRole,
  updatePermissions,
  listDatasetAccess,
  updateDatasetAccess,
  deleteUser,
} from '../services/admin.service.js'

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

const ROLES = ['superadmin', 'admin', 'analyst']

async function ensureUser(id) {
  const user = await findUserById(id)
  if (!user) {
    throw ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND')
  }
  return user
}

/**
 * GET /api/users
 * Lista los miembros. (admin+) Ve filtrando superadmins según el actor.
 */
export async function index(req, res, next) {
  try {
    requireSupabase()
    const users = await listUsers(req.user.role)
    res.json({ success: true, data: { users } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/users
 * Crea un miembro. (admin+) La lógica de qué roles puede crear está en el service.
 */
export async function create(req, res, next) {
  try {
    requireSupabase()
    const { name, email, password, role = 'analyst' } = req.body

    if (!name || !email || !password) {
      throw ApiError.badRequest('Faltan name, email o password.', 'INVALID_PAYLOAD')
    }
    if (!ROLES.includes(role)) {
      throw ApiError.badRequest(`Rol no válido (${ROLES.join(', ')}).`, 'INVALID_ROLE')
    }

    const user = await createMember({ name, email, password, role, actorRole: req.user.role })
    res.status(201).json({ success: true, data: { user } })
  } catch (err) {
    if (err.code === 'EMAIL_IN_USE') return next(new ApiError(409, err.message, 'EMAIL_IN_USE'))
    if (err.code === 'FORBIDDEN') return next(new ApiError(403, err.message, 'FORBIDDEN'))
    next(err)
  }
}

/**
 * PUT /api/users/:id/role
 * Cambia el rol. (admin+)
 */
export async function updateRole(req, res, next) {
  try {
    requireSupabase()
    await ensureUser(req.params.id)

    const { role } = req.body
    if (!ROLES.includes(role)) {
      throw ApiError.badRequest(`Rol no válido (${ROLES.join(', ')}).`, 'INVALID_ROLE')
    }

    const user = await changeRole(req.params.id, role, req.user.role)
    res.json({ success: true, data: { user } })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return next(new ApiError(404, err.message, 'USER_NOT_FOUND'))
    if (err.code === 'FORBIDDEN') return next(new ApiError(403, err.message, 'FORBIDDEN'))
    next(err)
  }
}

/**
 * PUT /api/users/:id/permissions
 * Actualiza permisos de módulo. (admin+)
 */
export async function updateMemberPermissions(req, res, next) {
  try {
    requireSupabase()
    await ensureUser(req.params.id)

    const permissions = req.body.permissions
    if (permissions == null || typeof permissions !== 'object') {
      throw ApiError.badRequest('Falta permissions (objeto).', 'INVALID_PERMISSIONS')
    }

    const user = await updatePermissions(req.params.id, permissions, req.user.role)
    res.json({ success: true, data: { user } })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return next(new ApiError(404, err.message, 'USER_NOT_FOUND'))
    if (err.code === 'FORBIDDEN') return next(new ApiError(403, err.message, 'FORBIDDEN'))
    next(err)
  }
}

/**
 * GET /api/users/:id/datasets
 * Lista acceso a datasets. (admin+)
 */
export async function showDatasetAccess(req, res, next) {
  try {
    requireSupabase()
    await ensureUser(req.params.id)
    const datasets = await listDatasetAccess(req.params.id)
    res.json({ success: true, data: { datasets } })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/users/:id/datasets
 * Reemplaza acceso a datasets. (admin+)
 */
export async function updateUserDatasets(req, res, next) {
  try {
    requireSupabase()
    await ensureUser(req.params.id)
    const datasetIds = req.body.datasetIds
    if (!Array.isArray(datasetIds)) {
      throw ApiError.badRequest('Falta datasetIds (arreglo).', 'INVALID_DATASET_IDS')
    }
    const datasets = await updateDatasetAccess(req.params.id, datasetIds)
    res.json({ success: true, data: { datasets } })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/users/:id
 * Elimina un miembro. (admin+) Protege la auto-eliminación.
 */
export async function destroy(req, res, next) {
  try {
    requireSupabase()
    await ensureUser(req.params.id)
    if (req.params.id === req.user.id) {
      throw ApiError.badRequest('No puedes eliminar tu propia cuenta.', 'SELF_DELETE')
    }

    const deleted = await deleteUser(req.params.id, req.user.role)
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return next(new ApiError(404, err.message, 'USER_NOT_FOUND'))
    if (err.code === 'FORBIDDEN') return next(new ApiError(403, err.message, 'FORBIDDEN'))
    next(err)
  }
}
