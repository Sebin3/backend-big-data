import crypto from 'node:crypto'
import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'
import { ApiError } from '../utils/ApiError.js'
import { sendEmail } from './mailer.service.js'

const OTP_TABLE = 'otp_codes'

/**
 * Genera un código OTP aleatorio numérico.
 */
export function generateOtp(length = config.otp.length) {
  const max = Math.pow(10, length)
  const code = crypto.randomInt(0, max)
  return code.toString().padStart(length, '0')
}

/**
 * Crea un registro OTP en Supabase para el email dado.
 * Invalida códigos anteriores sin usar del mismo email.
 */
async function persistOtp(email, code) {
  const db = getDbClient()

  // Marcar como usados (o expirados) los OTP previos de este email
  await db
    .from(OTP_TABLE)
    .update({ used: true })
    .eq('email', email)
    .eq('used', false)

  const expiresAt = new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000)

  const { error } = await db.from(OTP_TABLE).insert({
    email,
    code,
    expires_at: expiresAt.toISOString(),
    used: false,
  })

  if (error) throw error
}

/**
 * Valida un código OTP y lo marca como usado en caso de éxito.
 */
export async function verifyOtp({ email, code }) {
  const db = getDbClient()
  const now = new Date().toISOString()

  const { data, error } = await db
    .from(OTP_TABLE)
    .select('*')
    .eq('email', email)
    .eq('code', code)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw ApiError.badRequest('El código es incorrecto.', 'INVALID_OTP')
  }

  if (data.expires_at && data.expires_at < now) {
    throw ApiError.badRequest('El código ha expirado. Solicita uno nuevo.', 'OTP_EXPIRED')
  }

  // Marcar como usado
  await db.from(OTP_TABLE).update({ used: true }).eq('id', data.id)

  return true
}

/**
 * Genera un OTP, lo guarda y envía por correo.
 * En desarrollo imprime el código en consola para poder probar sin correo real.
 */
export async function issueOtp({ email, purpose = 'verification' }) {
  const code = generateOtp()
  await persistOtp(email, code)

  const purposeText = purpose === 'login'
    ? 'inicio de sesión'
    : 'confirmación de tu cuenta'

  const brand = config.email.brevo.name || 'SendAquaLM'
  const subject = `Tu código de verificación - ${brand}`
  const text = [
    `Equipo ${brand}`,
    '',
    'Hola,',
    '',
    `Para completar tu ${purposeText} usa el siguiente código:`,
    '',
    `   ${code}`,
    '',
    `El código expira en ${config.otp.expiresMinutes} minutos.`,
    'Si no solicitaste este código, ignora este correo.',
    '',
    `Equipo ${brand}`,
  ].join('\n')

  const html = `
    <div style="background-color:#f6f8fa;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" style="max-width:440px;background-color:#ffffff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden;">
              <tr>
                <td align="center" style="padding:28px 32px 8px 32px;">
                  <div style="font-size:34px;line-height:1;">💧</div>
                  <div style="margin-top:10px;font-size:22px;font-weight:600;color:#1a1a2e;letter-spacing:0.5px;">${brand}</div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:20px 32px 8px 32px;">
                  <div style="font-size:15px;color:#57606a;">Para completar tu ${purposeText}</div>
                  <div style="margin-top:4px;font-size:15px;color:#24292f;"><b>usa el siguiente código:</b></div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:20px 32px;">
                  <div style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:10px;background:#f1f3f9;padding:14px 28px;border-radius:6px;border:1px solid #d0d7de;color:#1a1a2e;">
                    ${code}
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:0 32px 24px 32px;">
                  <div style="font-size:13px;color:#57606a;">Este código expira en <b>${config.otp.expiresMinutes} minutos</b>.</div>
                  <div style="margin-top:6px;font-size:12px;color:#8b949e;">Si no solicitaste este código, ignora este correo.</div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:16px 32px;background-color:#f6f8fa;border-top:1px solid #d0d7de;">
                  <div style="font-size:12px;color:#57606a;">© ${new Date().getFullYear()} ${brand}. Todos los derechos reservados.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `

  let emailResult = null
  try {
    emailResult = await sendEmail({ to: email, subject, text, html })
  } catch {
    // Si el envío falla no rompemos el flujo en dev,
    // pero sí avisamos en la respuesta.
    emailResult = { sent: false }
  }

  // En desarrollo exponemos el código para facilitar las pruebas.
  if (config.env !== 'production') {
    console.log(`[OTP-DEV] Código para ${email}: ${code}`)
  }

  return {
    expiresMinutes: config.otp.expiresMinutes,
    emailSent: emailResult.sent !== false,
    // SOLO en desarrollo:
    devCode: config.env !== 'production' ? code : undefined,
  }
}

/**
 * Reenvía un nuevo código OTP para el email dado (el anterior se invalida).
 */
export async function resendOtp({ email, purpose = 'verification' }) {
  return issueOtp({ email, purpose })
}
