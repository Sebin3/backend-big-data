import { createClient } from '@supabase/supabase-js'
import config from './index.js'

const url = config.supabase.url
const anonKey = config.supabase.anonKey
const serviceRoleKey = config.supabase.serviceRoleKey

const isValidUrl = url && /^https?:\/\//i.test(url)

export const isSupabaseConfigured = Boolean(isValidUrl && anonKey && serviceRoleKey)

// Cliente público (usan la anon key). Seguro también para el cliente.
export const supabase = isValidUrl && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

// Cliente administrador (usa la service_role key).
// IMPORTANTE: SOLO usarlo en el servidor para operaciones de escritura.
export const supabaseAdmin = isValidUrl && serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

/**
 * Devuelve el cliente de Supabase con permisos de escritura.
 */
export function getDbClient() {
  return isSupabaseConfigured ? supabaseAdmin : null
}
