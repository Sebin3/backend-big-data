import { ApiError } from '../utils/ApiError.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Reglas de validación accesibles.
 */
export const rules = {
  required: (message = 'Campo requerido') => (v) => (v == null || v === '' ? message : null),
  email: (message = 'Correo electrónico inválido') => (v) =>
    v && !EMAIL_REGEX.test(v) ? message : null,
  min: (n, message = `Debe tener al menos ${n} caracteres`) => (v) =>
    v != null && String(v).length < n ? message : null,
  oneOf: (allowed, message = 'Valor no permitido') => (v) =>
    v != null && !allowed.includes(v) ? message : null,
}

/**
 * Valida req.body contra un esquema de reglas.
 * Uso:
 *   validate({
 *     email: [rules.required(), rules.email()],
 *     password: [rules.required(), rules.min(6)],
 *   })
 */
export function validate(schema) {
  return (req, _res, next) => {
    const body = req.body || {}
    const errors = {}

    for (const [field, validators] of Object.entries(schema)) {
      const value = body[field]
      for (const validator of validators) {
        const errMsg = validator(value)
        if (errMsg) {
          errors[field] = errMsg
          break
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return next(ApiError.badRequest('Datos inválidos', 'VALIDATION_ERROR'))
    }

    next()
  }
}
