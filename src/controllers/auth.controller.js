import bcrypt from 'bcryptjs'
import { ApiError } from '../utils/ApiError.js'
import { signToken } from '../utils/jwt.js'
import {
  findUserByEmail,
  createUser,
  findOrCreateGoogleUser,
} from '../services/user.service.js'
import { issueOtp, verifyOtp, resendOtp } from '../services/otp.service.js'
import { consumeInvitation } from '../services/invitation.service.js'
import { verifyGoogleToken, exchangeCodeForProfile, getAuthorizationUrl } from '../services/google-oauth.service.js'
import { isSupabaseConfigured } from '../config/supabase.js'

/**
 * Devuelve un error claro si Supabase aún no está configurado.
 */
function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

const saltRounds = 10

/**
 * POST /api/auth/register
 * Crea la cuenta y envía un OTP al correo.
 */
export async function register(req, res, next) {
  try {
    requireSupabase()

    const { name, email, password, code } = req.body
    const normalizedEmail = String(email).trim().toLowerCase()

    const existing = await findUserByEmail(normalizedEmail)
    if (existing) {
      throw ApiError.conflict('Ya existe una cuenta con este correo.', 'EMAIL_IN_USE')
    }

    // Registro controlado por código de invitación.
    // Sin código válido no se puede crear la cuenta.
    let role = 'user'
    if (code) {
      const invitation = await consumeInvitation({ code, email: normalizedEmail })
      role = invitation.role
    } else {
      throw ApiError.badRequest(
        'Este sistema requiere un código de invitación para crear una cuenta.',
        'INVITE_CODE_REQUIRED',
      )
    }

    const passwordHash = await bcrypt.hash(password, saltRounds)

    const user = await createUser({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role,
    })

    const otpInfo = await issueOtp({ email: normalizedEmail, purpose: 'register' })

    res.status(201).json({
      success: true,
      data: {
        message: 'Cuenta creada. Revisa tu correo para el código de verificación.',
        email: user.email,
        role,
        otp: otpInfo,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/login
 * Valida credenciales y envía un OTP al correo.
 */
export async function login(req, res, next) {
  try {
    requireSupabase()

    const { email, password } = req.body
    const normalizedEmail = String(email).trim().toLowerCase()

    const user = await findUserByEmail(normalizedEmail)
    if (!user) {
      throw ApiError.badRequest('Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS')
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      throw ApiError.badRequest('Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS')
    }

    const otpInfo = await issueOtp({ email: normalizedEmail, purpose: 'login' })

    res.json({
      success: true,
      data: {
        message: 'Credenciales válidas. Revisa tu correo para el código de verificación.',
        email: user.email,
        otp: otpInfo,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/resend
 * Envía un nuevo código OTP al correo (para reenvío desde la vista de verificación).
 */
export async function resend(req, res, next) {
  try {
    requireSupabase()

    const { email, purpose } = req.body
    const normalizedEmail = String(email).trim().toLowerCase()

    const user = await findUserByEmail(normalizedEmail)
    if (!user) {
      throw ApiError.notFound('No existe una cuenta con este correo.', 'USER_NOT_FOUND')
    }

    const otpInfo = await resendOtp({ email: normalizedEmail, purpose: purpose ?? 'verification' })

    res.json({
      success: true,
      data: {
        message: 'Se envió un nuevo código de verificación.',
        email: normalizedEmail,
        otp: otpInfo,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/verify
 * Verifica el código OTP y emite el token JWT de sesión.
 */
export async function verify(req, res, next) {
  try {
    requireSupabase()

    const { email, code } = req.body
    const normalizedEmail = String(email).trim().toLowerCase()

    await verifyOtp({ email: normalizedEmail, code: String(code) })

    const user = await findUserByEmail(normalizedEmail)
    if (!user) {
      throw ApiError.notFound('No se encontró el usuario.', 'USER_NOT_FOUND')
    }

    const token = signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/auth/me
 * Devuelve el usuario autenticado con el token.
 */
export async function me(req, res, next) {
  try {
    requireSupabase()

    const user = await findUserByEmail(req.user.email)
    if (!user) {
      throw ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * Emite la sesión JWT para un usuario autenticado por Google.
 */
function respondWithSession(res, user) {
  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar_url || null,
      },
    },
  })
}

/**
 * GET /api/auth/google/authorize
 * Devuelve la URL de autorización de Google para el flujo de redirección.
 * El frontend redirige el navegador a esta URL.
 */
export async function googleAuthorize(req, res, next) {
  try {
    const url = getAuthorizationUrl()
    res.json({ success: true, data: { url } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/google
 * Login/registro con Google mediante un ID token obtenido en el frontend.
 * Cuerpo: { "idToken": "..." }  (token enviado por el SDK de Google en el navegador)
 */
export async function googleLogin(req, res, next) {
  try {
    requireSupabase()

    const { idToken } = req.body
    const profile = await verifyGoogleToken(idToken)

    if (!profile.emailVerified) {
      throw ApiError.forbidden('Tu correo de Google no está verificado.', 'GOOGLE_EMAIL_UNVERIFIED')
    }

    const user = await findOrCreateGoogleUser(profile)

    respondWithSession(res, user)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/auth/google/callback
 * Flujo con redirección del servidor (OAuth2 completo).
 * Google llama a esta URL con un ?code= que intercambiamos por el perfil.
 */
export async function googleCallback(req, res, next) {
  try {
    requireSupabase()

    const profile = await exchangeCodeForProfile(req.query.code)
    const user = await findOrCreateGoogleUser(profile)

    // En este flujo el usuario llega vía navegador, así que devolvemos
    // el token por JSON. El frontend lo recoge como prefieras.
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role })

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar_url || null,
        },
      },
    })
  } catch (err) {
    next(err)
  }
}
