import config from '../config/index.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import { ApiError } from '../utils/ApiError.js'
import { findUserById } from '../services/user.service.js'
import { sendEmail } from '../services/mailer.service.js'
import {
  addContactMessage,
  createContactRequest,
  getContactRequest,
  listContactRequests,
  setMessageEmailStatus,
  updateContactRequest,
  importInboundEmail,
} from '../services/contactRequest.service.js'
import { listGmailReplies } from '../services/gmailInbox.service.js'

const STATUSES = ['new', 'in_progress', 'answered', 'waiting_customer', 'closed', 'spam']
const PRIORITIES = ['low', 'normal', 'high']

function requireSupabase() {
  if (!isSupabaseConfigured) throw ApiError.internal('Supabase no está configurado.', 'SUPABASE_NOT_CONFIGURED')
}

export function requireContactPermission(action = 'view') {
  return async function contactPermissionMiddleware(req, _res, next) {
    try {
      const user = await findUserById(req.user.id)
      if (!user) return next(ApiError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND'))
      req.user.role = user.role
      if (user.role === 'superadmin' || user.role === 'admin' || user.permissions?.solicitudes?.[action] === true) return next()
      return next(ApiError.forbidden('No tienes permiso para realizar esta acción en solicitudes.'))
    } catch (error) { next(error) }
  }
}

export async function create(req, res, next) {
  try {
    requireSupabase()
    const { name, email, message, phone, company, category, preferredChannel, website } = req.body ?? {}
    if (website) return res.status(201).json({ success: true, data: { received: true } })
    if (!name?.trim() || !email?.trim() || !message?.trim()) throw ApiError.badRequest('Nombre, correo y mensaje son obligatorios.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest('Escribe un correo válido.')
    if (name.length > 120 || email.length > 254 || message.length > 5000) throw ApiError.badRequest('Uno de los campos excede el tamaño permitido.')

    const request = await createContactRequest({ name, email, message, phone, company, category, preferredChannel })
    const subject = `Nueva solicitud ${request.ticketNumber} — ${request.company || request.name}`
    let notificationSent = false
    if (config.email.contactNotification) {
      try {
        await sendEmail({
          to: config.email.contactNotification,
          replyTo: request.email,
          subject,
          text: `${request.name} (${request.email}) ha enviado una solicitud.\n\n${message}`,
        })
        notificationSent = true
      } catch { notificationSent = false }
    }
    try {
      await sendEmail({
        to: request.email,
        replyTo: config.email.contactReplyTo || config.email.contactNotification || null,
        subject: `Recibimos tu solicitud ${request.ticketNumber}`,
        text: `Hola ${request.name},\n\nRecibimos tu mensaje correctamente. Nuestro equipo se pondrá en contacto contigo.\n\nCódigo: ${request.ticketNumber}`,
      })
    } catch { /* La solicitud ya quedó guardada. */ }
    res.status(201).json({ success: true, data: { request, notificationSent } })
  } catch (error) { next(error) }
}

export async function index(_req, res, next) {
  try { requireSupabase(); res.json({ success: true, data: { requests: await listContactRequests() } }) }
  catch (error) { next(error) }
}

export async function show(req, res, next) {
  try {
    requireSupabase()
    const result = await getContactRequest(req.params.id)
    if (!result) throw ApiError.notFound('Solicitud no encontrada.')
    res.json({ success: true, data: result })
  } catch (error) { next(error) }
}

export async function reply(req, res, next) {
  try {
    requireSupabase()
    const body = req.body?.body?.trim()
    if (!body || body.length > 5000) throw ApiError.badRequest('La respuesta es obligatoria y debe tener máximo 5000 caracteres.')
    const current = await getContactRequest(req.params.id)
    if (!current) throw ApiError.notFound('Solicitud no encontrada.')
    const isInternal = Boolean(req.body?.isInternal)
    const message = await addContactMessage(req.params.id, {
      body,
      isInternal,
      senderEmail: req.user.email,
      senderUserId: req.user.id,
    })
    if (!isInternal) {
      try {
        await sendEmail({
          to: current.request.email,
          replyTo: config.email.contactReplyTo || config.email.contactNotification || null,
          subject: `Re: ${current.request.ticketNumber} — ${current.request.category}`,
          text: body,
        })
        await setMessageEmailStatus(message.id, 'sent')
        message.emailStatus = 'sent'
      } catch {
        await setMessageEmailStatus(message.id, 'failed')
        message.emailStatus = 'failed'
      }
    }
    res.status(201).json({ success: true, data: { message } })
  } catch (error) { next(error) }
}

export async function update(req, res, next) {
  try {
    requireSupabase()
    const { status, priority, assignedTo } = req.body ?? {}
    if (status !== undefined && !STATUSES.includes(status)) throw ApiError.badRequest('Estado inválido.')
    if (priority !== undefined && !PRIORITIES.includes(priority)) throw ApiError.badRequest('Prioridad inválida.')
    const request = await updateContactRequest(req.params.id, { status, priority, assignedTo })
    if (!request) throw ApiError.notFound('Solicitud no encontrada.')
    res.json({ success: true, data: { request } })
  } catch (error) { next(error) }
}

export async function syncGmail(_req, res, next) {
  try {
    requireSupabase()
    const replies = await listGmailReplies()
    const importedRequestIds = new Set()
    let imported = 0
    let skipped = 0
    for (const reply of replies) {
      const result = await importInboundEmail(reply)
      if (result.imported) {
        imported += 1
        importedRequestIds.add(result.requestId)
      } else skipped += 1
    }
    res.json({ success: true, data: { imported, skipped, requestIds: [...importedRequestIds] } })
  } catch (error) { next(error) }
}
