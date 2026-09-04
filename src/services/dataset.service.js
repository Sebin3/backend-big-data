import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'

const TABLE = () => config.supabase.datasetsTable || 'datasets'
const CLEANING_LOG = () => config.supabase.cleaningLogsTable || 'cleaning_logs'
const ACCESS = () => config.supabase.datasetAccessTable || 'dataset_access'

/**
 * ids de datasets compartidos con el usuario vía dataset_access.
 */
async function sharedDatasetIds(userId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(ACCESS())
    .select('dataset_id')
    .eq('analyst_id', userId)
  if (error) throw error
  return (data ?? []).map((r) => r.dataset_id)
}

/**
 * Convierte un registro de la base de datos al formato Dataset del frontend.
 */
function fromRecord(record) {
  return {
    id: record.id,
    fileName: record.file_name,
    sizeBytes: record.size_bytes,
    uploadedAt: record.uploaded_at,
    processMs: record.process_ms,
    rowCount: record.row_count,
    columnCount: record.column_count,
    totalCells: record.total_cells,
    missingCells: record.missing_cells,
    duplicateRows: record.duplicate_rows,
    completeness: record.completeness,
    delimiter: record.delimiter,
    headers: record.headers ?? [],
    columns: record.columns ?? [],
    rows: record.rows ?? [],
    roles: record.roles ?? {},
    insights: record.insights ?? {},
    parseMeta: record.parse_meta ?? null,
  }
}

/**
 * Lista el historial de datasets visibles.
 * - superadmin/admin ven todos.
 * - analyst/user ven los propios + los compartidos vía dataset_access.
 * Devuelve solo los metadatos (sin filas ni análisis para no pesar).
 */
export async function listDatasets(userId, role = 'user') {
  const db = getDbClient()
  if (role === 'superadmin' || role === 'admin' || role === 'auditor') {
    const { data, error } = await db
      .from(TABLE())
      .select(
        'id, file_name, size_bytes, uploaded_at, process_ms, row_count, column_count, duplicate_rows, delimiter',
      )
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(toMeta)
  }

  const sharedIds = await sharedDatasetIds(userId)
  let query = db
    .from(TABLE())
    .select(
      'id, file_name, size_bytes, uploaded_at, process_ms, row_count, column_count, duplicate_rows, delimiter',
    )
    .order('uploaded_at', { ascending: false })
  if (sharedIds.length > 0) {
    query = query.or(`user_id.eq.${userId},id.in.(${sharedIds.join(',')})`)
  } else {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(toMeta)
}

function toMeta(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    processMs: row.process_ms,
    rowCount: row.row_count,
    columnCount: row.column_count,
    duplicateRows: row.duplicate_rows,
    delimiter: row.delimiter,
  }
}

/**
 * Devuelve un dataset completo por su id.
 * - superadmin/admin acceden a cualquiera.
 * - analyst/user solo a los propios o compartidos.
 */
export async function getDataset(userId, id, role = 'user') {
  const db = getDbClient()
  let query = db
    .from(TABLE())
    .select('*')
    .eq('id', id)
  if (role !== 'superadmin' && role !== 'admin' && role !== 'auditor') {
    const sharedIds = await sharedDatasetIds(userId)
    if (!sharedIds.includes(id)) {
      query = query.eq('user_id', userId)
    }
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? fromRecord(data) : null
}

/**
 * Crea o actualiza un dataset del usuario.
 * - Si ya existe uno con el mismo id (mismo usuario), se reemplaza.
 */
export async function upsertDataset(userId, dataset) {
  const db = getDbClient()
  const record = {
    user_id: userId,
    id: dataset.id,
    file_name: dataset.fileName,
    size_bytes: dataset.sizeBytes,
    uploaded_at: dataset.uploadedAt,
    process_ms: dataset.processMs,
    row_count: dataset.rowCount,
    column_count: dataset.columnCount,
    total_cells: dataset.totalCells,
    missing_cells: dataset.missingCells,
    duplicate_rows: dataset.duplicateRows,
    completeness: dataset.completeness,
    delimiter: dataset.parseMeta?.delimiter ?? null,
    headers: dataset.headers,
    columns: dataset.columns,
    roles: dataset.roles,
    insights: dataset.insights,
    rows: dataset.rows,
    parse_meta: dataset.parseMeta ?? null,
  }

  const { data, error } = await db
    .from(TABLE())
    .upsert(record, { onConflict: 'user_id,id' })
    .select()
    .single()
  if (error) throw error
  return fromRecord(data)
}

/**
 * Elimina un dataset del usuario.
 * Devuelve true si existía y fue borrado.
 */
export async function deleteDataset(userId, id) {
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

/**
 * Guarda un dataset con el análisis calculado por el backend (parse).
 * Reemplaza las filas y todos los metadatos de calidad.
 */
export async function saveAnalyzedDataset(userId, dataset) {
  const db = getDbClient()
  const record = {
    user_id: userId,
    id: dataset.id,
    file_name: dataset.fileName,
    size_bytes: dataset.sizeBytes ?? null,
    process_ms: dataset.processMs ?? null,
    row_count: dataset.analysis.rowCount,
    column_count: dataset.analysis.columnCount,
    total_cells: dataset.analysis.totalCells,
    missing_cells: dataset.analysis.missingCells,
    duplicate_rows: dataset.analysis.duplicateRows,
    completeness: dataset.analysis.completeness,
    delimiter: dataset.delimiter ?? null,
    headers: dataset.analysis.headers,
    columns: dataset.analysis.columns,
    roles: dataset.analysis.roles,
    insights: dataset.analysis.insights,
    rows: dataset.rows,
  }

  const { data, error } = await db
    .from(TABLE())
    .upsert(record, { onConflict: 'user_id,id' })
    .select()
    .single()
  if (error) throw error
  return fromRecord(data)
}

/**
 * Registra una operación de limpieza en el historial.
 */
export async function logCleaning({ userId, datasetId, action, summary }) {
  const db = getDbClient()
  const { data, error } = await db
    .from(CLEANING_LOG())
    .insert({
      user_id: userId,
      dataset_id: datasetId,
      action,
      summary,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

/**
 * Lista el histórico de limpiezas de un dataset.
 */
export async function listCleaningLogs(datasetId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(CLEANING_LOG())
    .select('id, action, summary, created_at')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}