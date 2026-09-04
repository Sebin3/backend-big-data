import { OAuth2Client } from 'google-auth-library'
import config from '../config/index.js'
import { ApiError } from '../utils/ApiError.js'

const isConfigured = () =>
  Boolean(config.google.clientId && !config.google.clientId.startsWith('tu_client'))

let oauthClient = null

function getOAuthClient() {
  if (oauthClient) return oauthClient
  if (!isConfigured()) {
    throw ApiError.internal(
      'Google OAuth no está configurado. Agrega GOOGLE_CLIENT_ID (y GOOGLE_CLIENT_SECRET si usas redirección) en el .env. Ver SETUP.md.',
      'GOOGLE_NOT_CONFIGURED',
    )
  }
  oauthClient = new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret || undefined,
    config.google.redirectUri,
  )
  return oauthClient
}

/**
 * Verifica un ID token de Google enviado por el frontend.
 * Uso típico con "Continuar con Google" (Google Identity Services).
 *
 * @param {string} idToken - token de Google obtenido en el navegador
 * @returns {Promise<{googleId: string, email: string, name: string, picture: string|null}>}
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken) {
    throw ApiError.badRequest('No se recibió el token de Google.', 'GOOGLE_TOKEN_REQUIRED')
  }

  const client = getOAuthClient()

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    })
    const payload = ticket.getPayload()

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name || payload.email,
      picture: payload.picture || null,
    }
  } catch {
    throw ApiError.unauthorized('El token de Google es inválido o expiró.', 'INVALID_GOOGLE_TOKEN')
  }
}

/**
 * Genera la URL de autorización de Google para el flujo con redirección
 * del servidor (OAuth2 completo).
 */
export function getAuthorizationUrl(state = '') {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
  })
}

/**
 * Intercambia el código de autorización (recibido en el callback) por un
 * ID token de Google y devuelve el perfil verificado.
 */
export async function exchangeCodeForProfile(code) {
  if (!code) {
    throw ApiError.badRequest('No se recibió el código de autorización.', 'GOOGLE_CODE_REQUIRED')
  }

  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  return verifyGoogleToken(tokens.id_token)
}
