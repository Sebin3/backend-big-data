import { Router } from 'express'
import {
  register,
  login,
  verify,
  resend,
  me,
  googleLogin,
  googleAuthorize,
  googleCallback,
} from '../controllers/auth.controller.js'
import { validate, rules } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { otpLimiter } from '../middleware/rateLimit.js'

const router = Router()

router.post(
  '/register',
  validate({
    name: [rules.required('El nombre es requerido')],
    email: [rules.required('El correo es requerido'), rules.email()],
    password: [rules.required('La contraseña es requerida'), rules.min(6, 'La contraseña debe tener al menos 6 caracteres')],
  }),
  register,
)
router.post(
  '/login',
  otpLimiter,
  validate({
    email: [rules.required('El correo es requerido'), rules.email()],
    password: [rules.required('La contraseña es requerida')],
  }),
  login,
)

router.post(
  '/verify',
  otpLimiter,
  validate({
    email: [rules.required('El correo es requerido'), rules.email()],
    code: [rules.required('El código es requerido'), rules.min(6, 'El código debe tener 6 dígitos')],
  }),
  verify,
)

router.post(
  '/resend',
  otpLimiter,
  validate({
    email: [rules.required('El correo es requerido'), rules.email()],
  }),
  resend,
)

router.get('/me', authenticate, me)

router.post(
  '/google',
  validate({
    idToken: [rules.required('Falta el token de Google.')],
  }),
  googleLogin,
)

// Callback del flujo de redirección del servidor (OAuth2 completo)
router.get('/google/authorize', googleAuthorize)
router.get('/google/callback', googleCallback)

export default router
