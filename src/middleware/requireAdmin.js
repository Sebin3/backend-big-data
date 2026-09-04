import { ApiError } from '../utils/ApiError.js'
import { findUserById } from '../services/user.service.js'

const ROLE_RANK = { superadmin: 4, admin: 3, analyst: 2, auditor: 1, user: 0 }

/**
 * Middleware que protege rutas según el rol mínimo requerido.
 * Requiere sesión iniciada (USAR DESPUÉS de authenticate).
 * la fuente de verdad del rol es la base de datos (no el token).
 */
export function requireRole(minRole) {
  return async (req, _res, next) => {
    try {
      const user = await findUserById(req.user.id)
      if (!user) {
        return next(ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND'))
      }
      if ((ROLE_RANK[user.role] ?? 0) < ROLE_RANK[minRole]) {
        return next(ApiError.forbidden('No tienes permisos para esta acción.', 'FORBIDDEN'))
      }
      req.user.role = user.role
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** Solo superadmin. */
export const requireSuperAdmin = requireRole('superadmin')

/** Superadmin y admin. */
export const requireAdmin = requireRole('admin')

/**
 * Permite la acción si:
 * - eres superadmin (siempre puede), o
 * - tu rol es >= minRole Y (no hay permisos definidos o el permiso módulo/acción es true)
 * La fuente de verdad del rol y permisos es la base de datos.
 */
export function requirePermission(minRole, module, action) {
  return async (req, _res, next) => {
    try {
      const user = await findUserById(req.user.id)
      if (!user) {
        return next(ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND'))
      }
      const role = user.role
      req.user.role = role

      // superadmin siempre pasa
      if (role === 'superadmin') return next()

      // rol mínimo
      if ((ROLE_RANK[role] ?? 0) < ROLE_RANK[minRole]) {
        return next(ApiError.forbidden('No tienes permisos para esta acción.', 'FORBIDDEN'))
      }

      // permisos finos por módulo/acción
      const perms = user.permissions ?? {}
      const modulePerm = perms[module]
      // si no hay permisos declarados, el rol manda
      if (modulePerm == null || typeof modulePerm !== 'object') return next()

      const has = modulePerm[action]
      // si la acción está declarada y es false, se bloquea
      if (has === false) {
        return next(ApiError.forbidden('No tienes permiso para esta acción.', 'FORBIDDEN'))
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
