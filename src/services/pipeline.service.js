import config from '../config/index.js'
import { getDbClient } from '../config/supabase.js'

const TABLE = () => config.supabase.pipelinesTable || 'pipeline_maps'

/**
 * Devuelve el mapeo de pipeline vinculado a un dataset del usuario.
 * Un dataset puede tener a lo sumo un mapeo.
 */
export async function getPipeline(userId, datasetId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .select('*')
    .eq('user_id', userId)
    .eq('dataset_id', datasetId)
    .maybeSingle()
  if (error) throw error
  return data ? normalize(data) : null
}

/**
 * Lista todos los mapeos de pipeline del usuario.
 */
export async function listPipelines(userId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map(normalize)
}

function normalize(record) {
  return {
    datasetId: record.dataset_id,
    stage: record.stage ?? '',
    amount: record.amount ?? '',
    owner: record.owner ?? '',
    closeDate: record.close_date ?? '',
    probabilities: record.probabilities ?? {},
  }
}

/**
 * Crea o actualiza el mapeo de pipeline para un dataset del usuario.
 * Probabilidades por etapa y roles de columnas.
 */
export async function upsertPipeline(userId, datasetId, map) {
  const db = getDbClient()
  const record = {
    user_id: userId,
    dataset_id: datasetId,
    stage: map.stage ?? '',
    amount: map.amount ?? '',
    owner: map.owner ?? '',
    close_date: map.closeDate ?? '',
    probabilities: map.probabilities ?? {},
  }

  const { data, error } = await db
    .from(TABLE())
    .upsert(record, { onConflict: 'user_id,dataset_id' })
    .select()
    .single()
  if (error) throw error
  return normalize(data)
}

/**
 * Elimina el mapeo de un dataset.
 */
export async function deletePipeline(userId, datasetId) {
  const db = getDbClient()
  const { data, error } = await db
    .from(TABLE())
    .delete()
    .eq('user_id', userId)
    .eq('dataset_id', datasetId)
    .select('dataset_id')
  if (error) throw error
  return (data ?? []).length > 0
}
