import { ApiError } from '../utils/ApiError.js'
import { extractBearerToken, verifyToken } from '../utils/jwt.js'

/**
 * Middleware que protege rutas autenticadas.
 * Lee el Bearer token del header y adjunta req.user.
 */
export function authenticate(req, _res, next) {
  const token = extractBearerToken(req.headers.authorization)

  if (!token) {
    return next(ApiError.unauthorized('Token no proporcionado'))
  }

  try {
    const payload = verifyToken(token)
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role || null,
    }
    next()
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Sesión expirada. Inicia sesión de nuevo.'
      : 'Token inválido.'
    next(ApiError.unauthorized(message))
  }
}
