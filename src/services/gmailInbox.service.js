import { OAuth2Client } from 'google-auth-library'
import { URLSearchParams } from 'node:url'
import config from '../config/index.js'
import { cleanEmailReply } from '../utils/emailReply.js'

function requireConfiguration() {
  if (!config.google.clientId || !config.google.clientSecret || !config.google.gmailRefreshToken || !config.google.gmailInbox) {
    const error = new Error('Falta configurar la sincronización de Gmail.')
    error.code = 'GMAIL_NOT_CONFIGURED'
    error.status = 503
    throw error
  }
}

function header(headers, name) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function decodeBase64Url(value = '') {
  if (!value) return ''
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function findTextPart(part, mimeType) {
  if (part?.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data)
  for (const child of part?.parts ?? []) {
    const found = findTextPart(child, mimeType)
    if (found) return found
  }
  return ''
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function parseAddress(value) {
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] || value).trim().toLowerCase()
}

async function gmailFetch(path, accessToken) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Gmail API error ${response.status}: ${await response.text()}`)
  return response.json()
}

export async function listGmailReplies(maxResults = 50) {
  requireConfiguration()
  const oauth = new OAuth2Client(config.google.clientId, config.google.clientSecret)
  oauth.setCredentials({ refresh_token: config.google.gmailRefreshToken })
  const tokenResult = await oauth.getAccessToken()
  const accessToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
  if (!accessToken) throw new Error('Google no devolvió un access token para Gmail.')

  const params = new URLSearchParams({ q: 'in:inbox newer_than:30d SOL-', maxResults: String(maxResults) })
  const listing = await gmailFetch(`/messages?${params}`, accessToken)
  const messages = []
  for (const summary of listing.messages ?? []) {
    const raw = await gmailFetch(`/messages/${encodeURIComponent(summary.id)}?format=full`, accessToken)
    const headers = raw.payload?.headers ?? []
    const subject = header(headers, 'Subject')
    const ticket = subject.match(/SOL-\d{8}-[A-Z0-9]{5}/i)?.[0]?.toUpperCase()
    if (!ticket) continue
    const senderEmail = parseAddress(header(headers, 'From'))
    if (!senderEmail || senderEmail === config.google.gmailInbox.toLowerCase()) continue
    const plain = findTextPart(raw.payload, 'text/plain')
    const html = plain ? '' : findTextPart(raw.payload, 'text/html')
    const body = cleanEmailReply(plain || htmlToText(html))
    if (!body) continue
    messages.push({
      providerMessageId: raw.id,
      ticketNumber: ticket,
      senderEmail,
      body,
      receivedAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : new Date().toISOString(),
    })
  }
  return messages
}
