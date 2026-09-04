import { ApiError } from '../utils/ApiError.js'
import config from '../config/index.js'

/**
 * Middleware para rutas no encontradas (404).
 */
export function notFound(_req, _res, next) {
  next(ApiError.notFound('Ruta no encontrada'))
}

/**
 * Manejador central de errores. Formatea la respuesta JSON
 * y oculta detalles internos en producción.
 */
export function errorHandler(err, req, res, _next) {
  // Errores del core de la app / Supabase
  let status = err.status || 500
  let message = err.message || 'Ocurrió un error inesperado'
  let code = err.code

  // Errores lanzados por Supabase (HDPS client)
  if (err.details || err.hint || err.code === '23505') {
    if (err.code === '23505') {
      status = 409
      message = 'Ya existe un registro con esos datos.'
      code = 'DUPLICATE_ENTRY'
    } else {
      status = 500
      message = 'Error en la base de datos'
      code = 'DB_ERROR'
    }
  }

  if (!config.isProd) {
    console.error('[ERROR]', err)
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
  })
}
