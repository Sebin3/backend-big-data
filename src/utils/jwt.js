import 'dotenv/config'
import jwt from 'jsonwebtoken'
import config from '../config/index.js'

/**
 * Firma un token JWT para el usuario autenticado.
 */
export function signToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
  }
  if (user.role) payload.role = user.role
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  })
}

/**
 * Verifica y devuelve el payload de un token JWT.
 * Lanza error si es inválido o expiró.
 */
export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

/**
 * Lee el token de los headers Authorization: "Bearer <token>".
 */
export function extractBearerToken(header) {
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}
