import { ApiError } from '../utils/ApiError.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import {
  getPipeline,
  listPipelines,
  upsertPipeline,
  deletePipeline,
} from '../services/pipeline.service.js';

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

/**
 * GET /api/pipelines
 * Todos los mapeos de pipeline del usuario.
 */
export async function index(req, res, next) {
  try {
    requireSupabase()
    const pipelines = await listPipelines(req.user.id)
    res.json({ success: true, data: { pipelines } })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/pipelines/:datasetId
 * Mapeo de un dataset concreto.
 */
export async function show(req, res, next) {
  try {
    requireSupabase()
    const pipeline = await getPipeline(req.user.id, req.params.datasetId)
    if (!pipeline) {
      throw ApiError.notFound('No hay mapeo para este dataset.', 'PIPELINE_NOT_FOUND')
    }
    res.json({ success: true, data: { pipeline } })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/pipelines/:datasetId
 * Crea o actualiza el mapeo del dataset.
 */
export async function upsert(req, res, next) {
  try {
    requireSupabase()
    const datasetId = req.params.datasetId
    if (!datasetId) {
      throw ApiError.badRequest('Falta el id del dataset.', 'INVALID_PIPELINE')
    }
    const body = req.body ?? {}
    const saved = await upsertPipeline(req.user.id, datasetId, body)
    res.json({ success: true, data: { pipeline: saved } })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/pipelines/:datasetId
 * Elimina el mapeo de un dataset.
 */
export async function destroy(req, res, next) {
  try {
    requireSupabase()
    const deleted = await deletePipeline(req.user.id, req.params.datasetId)
    if (!deleted) {
      throw ApiError.notFound('No hay mapeo para este dataset.', 'PIPELINE_NOT_FOUND')
    }
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    next(err)
  }
}
