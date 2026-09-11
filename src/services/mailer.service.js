import config from '../config/index.js'

let apiFetch = null

/**
 * Envía un correo a través de Brevo.
 * Devuelve la información de la respuesta.
 */
/**
 * Envía un correo a través de Brevo.
 * Devuelve la información de la respuesta.
 */
export async function sendEmail({ to, subject, text = '', html = null, replyTo = null }) {
  if (!config.email.brevo.apiKey) {
    throw new Error('Falta BREVO_API_KEY en el .env')
  }
  if (!apiFetch) apiFetch = fetch
  const res = await apiFetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.email.brevo.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: config.email.brevo.name, email: config.email.brevo.from },
      to: [{ email: to }],
      subject,
      ...(html ? { htmlContent: html } : { textContent: text }),
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo error ${res.status}: ${body}`)
  }
  return { provider: 'brevo', response: await res.json() }
}
