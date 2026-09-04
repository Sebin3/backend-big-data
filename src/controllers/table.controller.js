import { ApiError } from '../utils/ApiError.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import {
  listTables,
  getTable,
  upsertTable,
  deleteTable,
} from '../services/table.service.js';

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

function requireTableBody(body) {
  if (!body || typeof body !== 'object' || !body.id || !body.name) {
    throw ApiError.badRequest('Faltan datos de la tabla (id y name).', 'INVALID_TABLE')
  }
}

/**
 * GET /api/tables
 * Lista las tablas del usuario (metadatos + campos, sin filas).
 */
export async function index(req, res, next) {
  try {
    requireSupabase()
    const tables = await listTables(req.user.id)
    res.json({ success: true, data: { tables } })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/tables/:id
 * Tabla completa (con filas) del usuario.
 */
export async function show(req, res, next) {
  try {
    requireSupabase()
    const table = await getTable(req.user.id, req.params.id)
    if (!table) {
      throw ApiError.notFound('Tabla no encontrada.', 'TABLE_NOT_FOUND')
    }
    res.json({ success: true, data: { table } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/tables
 * Crea (o reemplaza) una tabla del usuario.
 */
export async function store(req, res, next) {
  try {
    requireSupabase()
    requireTableBody(req.body)
    const saved = await upsertTable(req.user.id, req.body)
    res.status(201).json({ success: true, data: { table: saved } })
  } catch (err) {
    next(err)
  }
}

/**
 * PUT /api/tables/:id
 * Actualiza parcialmente una tabla del usuario.
 */
export async function update(req, res, next) {
  try {
    requireSupabase()
    const existing = await getTable(req.user.id, req.params.id)
    if (!existing) {
      throw ApiError.notFound('Tabla no encontrada.', 'TABLE_NOT_FOUND')
    }
    const merged = {
      ...existing,
      ...req.body,
      id: existing.id,
    }
    const saved = await upsertTable(req.user.id, merged)
    res.json({ success: true, data: { table: saved } })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/tables/:id
 * Elimina una tabla del usuario.
 */
export async function destroy(req, res, next) {
  try {
    requireSupabase()
    const deleted = await deleteTable(req.user.id, req.params.id)
    if (!deleted) {
      throw ApiError.notFound('Tabla no encontrada.', 'TABLE_NOT_FOUND')
    }
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    next(err)
  }
}
