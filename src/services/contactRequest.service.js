import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'
import { cleanEmailReply } from '../utils/emailReply.js'

const REQUESTS = () => config.supabase.contactRequestsTable
const MESSAGES = () => config.supabase.contactMessagesTable

function normalizeRequest(row) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    category: row.category,
    preferredChannel: row.preferred_channel,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeMessage(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    direction: row.direction,
    channel: row.channel,
    body: row.direction === 'inbound' && row.channel === 'email' ? cleanEmailReply(row.body) : row.body,
    senderEmail: row.sender_email,
    senderUserId: row.sender_user_id,
    isInternal: row.is_internal,
    emailStatus: row.email_status,
    providerMessageId: row.provider_message_id,
    createdAt: row.created_at,
  }
}

function makeTicket() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `SOL-${date}-${suffix}`
}

export async function createContactRequest(input) {
  const db = getDbClient()
  const now = new Date().toISOString()
  const { data: request, error } = await db.from(REQUESTS()).insert({
    ticket_number: makeTicket(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    company: input.company?.trim() || null,
    category: input.category || 'informacion',
    preferred_channel: input.preferredChannel || 'email',
    status: 'new',
    priority: 'normal',
    source: 'landing',
    last_message_at: now,
  }).select('*').single()
  if (error) throw error

  const { error: messageError } = await db.from(MESSAGES()).insert({
    request_id: request.id,
    direction: 'inbound',
    channel: 'web',
    body: input.message.trim(),
    sender_email: request.email,
  })
  if (messageError) {
    await db.from(REQUESTS()).delete().eq('id', request.id)
    throw messageError
  }
  return normalizeRequest(request)
}

export async function listContactRequests() {
  const db = getDbClient()
  const { data, error } = await db.from(REQUESTS()).select('*').order('last_message_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalizeRequest)
}

export async function getContactRequest(id) {
  const db = getDbClient()
  const requestResult = await db.from(REQUESTS()).select('*').eq('id', id).maybeSingle()
  if (requestResult.error) throw requestResult.error
  if (!requestResult.data) return null
  const messagesResult = await db.from(MESSAGES()).select('*').eq('request_id', id).order('created_at', { ascending: true })
  if (messagesResult.error) throw messagesResult.error
  return {
    request: normalizeRequest(requestResult.data),
    messages: (messagesResult.data ?? []).map(normalizeMessage),
  }
}

export async function addContactMessage(id, input) {
  const db = getDbClient()
  const now = new Date().toISOString()
  const { data, error } = await db.from(MESSAGES()).insert({
    request_id: id,
    direction: 'outbound',
    channel: input.isInternal ? 'internal' : 'email',
    body: input.body.trim(),
    sender_email: input.senderEmail,
    sender_user_id: input.senderUserId,
    is_internal: Boolean(input.isInternal),
    email_status: input.isInternal ? null : 'pending',
  }).select('*').single()
  if (error) throw error
  const requestUpdate = { last_message_at: now, updated_at: now }
  if (!input.isInternal) requestUpdate.status = 'waiting_customer'
  await db.from(REQUESTS()).update(requestUpdate).eq('id', id)
  return normalizeMessage(data)
}

export async function setMessageEmailStatus(id, status) {
  const db = getDbClient()
  await db.from(MESSAGES()).update({ email_status: status }).eq('id', id)
}

export async function updateContactRequest(id, patch) {
  const db = getDbClient()
  const changes = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) changes.status = patch.status
  if (patch.priority !== undefined) changes.priority = patch.priority
  if (patch.assignedTo !== undefined) changes.assigned_to = patch.assignedTo || null
  const { data, error } = await db.from(REQUESTS()).update(changes).eq('id', id).select('*').maybeSingle()
  if (error) throw error
  return data ? normalizeRequest(data) : null
}

export async function importInboundEmail(input) {
  const db = getDbClient()
  const existing = await db.from(MESSAGES()).select('id').eq('provider_message_id', input.providerMessageId).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { imported: false, reason: 'duplicate' }

  const requestResult = await db.from(REQUESTS()).select('id, email').eq('ticket_number', input.ticketNumber).maybeSingle()
  if (requestResult.error) throw requestResult.error
  if (!requestResult.data) return { imported: false, reason: 'request_not_found' }
  if (requestResult.data.email.toLowerCase() !== input.senderEmail.toLowerCase()) return { imported: false, reason: 'sender_mismatch' }

  const { data, error } = await db.from(MESSAGES()).insert({
    request_id: requestResult.data.id,
    direction: 'inbound',
    channel: 'email',
    body: input.body,
    sender_email: input.senderEmail,
    provider_message_id: input.providerMessageId,
    created_at: input.receivedAt,
  }).select('*').single()
  if (error) throw error
  await db.from(REQUESTS()).update({
    status: 'in_progress',
    last_message_at: input.receivedAt,
    updated_at: new Date().toISOString(),
  }).eq('id', requestResult.data.id)
  return { imported: true, requestId: requestResult.data.id, message: normalizeMessage(data) }
}
