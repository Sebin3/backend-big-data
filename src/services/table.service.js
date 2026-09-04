import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'

const TABLE = () => config.supabase.tablesTable || 'user_tables'

/**
 * Lista las tablas creadas por el usuario.
 * Devuelve los metadatos + campos, sin las filas para no pesar.
 */
export async function listTables(userId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .select(
      'id, name, description, icon, group_name, fields, created_at, updated_at, row_count',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toTable)
}

/**
 * Devuelve una tabla completa (con filas) del usuario.
 */
export async function getTable(userId, id) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toTable(data) : null
}

function toTable(record) {
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? '',
    icon: record.icon ?? 'table',
    group: record.group_name ?? 'libre',
    fields: record.fields ?? [],
    rows: record.rows ?? [],
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

/**
 * Crea o actualiza una tabla del usuario.
 * - Con el mismo id se reemplaza por completo (filas y campos).
 */
export async function upsertTable(userId, table) {
  const db = getDbClient()
  const record = {
    user_id: userId,
    id: table.id,
    name: table.name,
    description: table.description,
    icon: table.icon,
    group_name: table.group ?? 'libre',
    fields: table.fields,
    rows: table.rows,
    updated_at: table.updatedAt ?? new Date().toISOString(),
    row_count: table.rows?.length ?? 0,
  }

  const { data, error } = await db
    .from(TABLE())
    .upsert(record, { onConflict: 'user_id,id' })
    .select()
    .single()
  if (error) throw error
  return toTable(data)
}

/**
 * Elimina una tabla del usuario.
 */
export async function deleteTable(userId, id) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
