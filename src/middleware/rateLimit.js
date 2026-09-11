import rateLimit from 'express-rate-limit'
import config from '../config/index.js'

/**
 * Limitador global de solicitudes a la API.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !config.isProd,
  message: { error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Intenta más tarde.' } },
})

/**
 * Limitador específico para envío/verificación de OTP
 * (evita spam de correos y fuerza bruta de códigos).
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Has excedido el límite de intentos. Espera unos minutos.' } },
})
