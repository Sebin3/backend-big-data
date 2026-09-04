/**
 * Error con estado HTTP y código, para controlar respuestas
 * de forma uniforme desde los servicios/controladores.
 */
export class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message)
    this.status = status
    this.code = code || `ERR_${status}`
    this.isApiError = true
  }

  static badRequest(message, code = 'BAD_REQUEST') {
    return new ApiError(400, message, code)
  }

  static unauthorized(message = 'No autorizado', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code)
  }

  static forbidden(message = 'Acceso denegado', code = 'FORBIDDEN') {
    return new ApiError(403, message, code)
  }

  static notFound(message = 'No encontrado', code = 'NOT_FOUND') {
    return new ApiError(404, message, code)
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, message, code)
  }

  static tooManyRequests(message = 'Demasiadas solicitudes', code = 'RATE_LIMIT') {
    return new ApiError(429, message, code)
  }

  static internal(message = 'Error interno del servidor', code = 'INTERNAL') {
    return new ApiError(500, message, code)
  }
}
