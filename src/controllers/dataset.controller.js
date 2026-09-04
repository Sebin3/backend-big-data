import { randomUUID } from 'node:crypto'
import { ApiError } from '../utils/ApiError.js'
import { isSupabaseConfigured } from '../config/supabase.js'
import { analyzeRows } from '../services/dataAnalysis.service.js'
import {
  listDatasets,
  getDataset,
  upsertDataset,
  deleteDataset,
  saveAnalyzedDataset,
  logCleaning,
  listCleaningLogs,
} from '../services/dataset.service.js'
import {
  groupSales,
  sugerenciasOfertas,
  calcularImpacto,
  buildOfertaRow,
} from '../services/ofertas.service.js'
import { listTables, upsertTable } from '../services/table.service.js'

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw ApiError.internal(
      'El backend no está configurado. Agrega SUPABASE_URL y las keys en el .env (ver SETUP.md).',
      'SUPABASE_NOT_CONFIGURED',
    )
  }
}

function requireDatasetBody(body) {
  if (!body || typeof body !== 'object' || !body.id || !body.fileName) {
    throw ApiError.badRequest('Faltan datos del dataset (id y fileName).', 'INVALID_DATASET')
  }
}

function requireRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw ApiError.badRequest('Faltan filas del dataset.', 'INVALID_ROWS')
  }
}

/**
 * GET /api/datasets
 * Historial de datasets del usuario (solo metadatos).
 */
export async function index(req, res, next) {
  try {
    requireSupabase()
    const items = await listDatasets(req.user.id, req.user.role)
    res.json({ success: true, data: { datasets: items } })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id
 * Dataset completo del usuario.
 */
export async function show(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) {
      throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    }
    res.json({ success: true, data: { dataset } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets
 * Guarda (crea o actualiza) un dataset del usuario.
 */
export async function store(req, res, next) {
  try {
    requireSupabase()
    requireDatasetBody(req.body)
    const saved = await upsertDataset(req.user.id, req.body)
    res.status(201).json({ success: true, data: { dataset: saved } })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/datasets/:id
 * Elimina un dataset del usuario.
 */
export async function destroy(req, res, next) {
  try {
    requireSupabase()
    const deleted = await deleteDataset(req.user.id, req.params.id)
    if (!deleted) {
      throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    }
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets/parse
 * Analiza las filas enviadas en el backend y guarda el dataset procesado.
 * Cuerpo: { id, fileName, sizeBytes?, processMs?, delimiter?, rows: [...] }
 */
export async function parse(req, res, next) {
  try {
    requireSupabase()
    requireDatasetBody(req.body)
    requireRows(req.body.rows)

    const analysis = analyzeRows(req.body.rows)

    const saved = await saveAnalyzedDataset(req.user.id, {
      id: req.body.id,
      fileName: req.body.fileName,
      sizeBytes: req.body.sizeBytes,
      processMs: req.body.processMs,
      delimiter: req.body.delimiter,
      rows: req.body.rows,
      analysis,
    })

    res.status(201).json({ success: true, data: { dataset: saved } })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/quality
 * Devuelve el resumen de calidad del dataset (guardado por el análisis).
 */
export async function quality(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) {
      throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    }
    const missingCells = dataset.missingCells ?? 0
    const duplicateRows = dataset.duplicateRows ?? 0
    const totalCells = dataset.totalCells ?? 0
    const completeness = dataset.completeness ?? 0
    const missingPercent = totalCells ? (missingCells / totalCells) * 100 : 0
    const score = Math.max(0, Math.round(completeness - duplicateRows * 0.5 - missingPercent * 0.5))
    res.json({
      success: true,
      data: {
        quality: {
          rowCount: dataset.rowCount,
          columnCount: dataset.columnCount,
          totalCells,
          missingCells,
          missingPercent: Math.round(missingPercent * 10) / 10,
          duplicateRows,
          completeness,
          score: Math.min(100, Math.max(0, score)),
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets/:id/clean  (usa ?dryRun=true para solo previsualizar)
 * Recalcula la limpieza sobre las filas crudas y opcionalmente la persiste.
 * Cuerpo: { options?: { removeDuplicates?: boolean, trim?: boolean, dropEmptyRows?: boolean } }
 */
export async function clean(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) {
      throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    }

    const dryRun = req.query.dryRun === 'true'
    const options = req.body?.options ?? {}
    const rows = dataset.rows ?? []

    let cleanedRows = [...rows]

    if (options.dropEmptyRows !== false) {
      cleanedRows = cleanedRows.filter((r) => Object.keys(r).some((k) => String(r[k] ?? '').trim() !== ''))
    }

    if (options.trim === true) {
      const keys = cleanedRows.length ? Object.keys(cleanedRows[0]) : []
      cleanedRows = cleanedRows.map((r) => {
        const out = { ...r }
        for (const k of keys) out[k] = typeof r[k] === 'string' ? r[k].trim() : r[k]
        return out
      })
    }

    if (options.removeDuplicates === true) {
      const seen = new Set()
      cleanedRows = cleanedRows.filter((r) => {
        const sig = Object.keys(r).map((k) => String(r[k] ?? '')).join('|')
        if (seen.has(sig)) return false
        seen.add(sig)
        return true
      })
    }

    const analysis = analyzeRows(cleanedRows)
    const removedRows = (dataset.rowCount ?? rows.length) - analysis.rowCount

    const summary = {
      removedRows,
      before: { rowCount: dataset.rowCount ?? rows.length, missingCells: dataset.missingCells ?? 0 },
      after: { rowCount: analysis.rowCount, missingCells: analysis.missingCells, duplicateRows: analysis.duplicateRows, completeness: analysis.completeness },
    }

    if (!dryRun) {
      await saveAnalyzedDataset(req.user.id, {
        id: dataset.id,
        fileName: dataset.fileName,
        rows: cleanedRows,
        analysis,
      })
      await logCleaning({
        userId: req.user.id,
        datasetId: dataset.id,
        action: 'clean',
        summary,
      })
    }

    res.json({
      success: true,
      data: {
        dryRun,
        removedRows,
        analysis,
        summary,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/cleaning-log
 * Historial de limpiezas del dataset.
 */
export async function cleaningLog(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) {
      throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    }
    const logs = await listCleaningLogs(req.params.id)
    res.json({ success: true, data: { logs } })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/charts/columns
 * Columnas disponibles para graficar.
 */
export async function chartColumns(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    const columns = (dataset.columns ?? []).map((c) => ({ name: c.name, type: c.type }))
    res.json({ success: true, data: { columns } })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/charts/data
 * Datos de insights para graficar (timeline, histograma, top categorías).
 */
export async function chartData(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    const insights = dataset.insights ?? {}
    res.json({
      success: true,
      data: {
        charts: {
          timeline: insights.timeline ?? [],
          timelineTitle: insights.timelineTitle ?? null,
          histogram: insights.histogram ?? [],
          histogramColumn: insights.histogramColumn ?? null,
          topCategories: insights.topCategories ?? [],
          topCategoriesTitle: insights.topCategoriesTitle ?? null,
          typeDistribution: insights.typeDistribution ?? [],
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/charts/raw
 * Columnas y primeros registros crudos (sin análisis).
 */
export async function chartRaw(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    res.json({
      success: true,
      data: {
        headers: dataset.headers ?? [],
        rows: (dataset.rows ?? []).slice(0, 100),
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/sales/summary
 * Resumen comercial a partir de los insights guardados.
 */
export async function salesSummary(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')

    const insights = dataset.insights ?? {}
    const timeline = insights.timeline ?? []
    const topCategories = insights.topCategories ?? []

    const totalRevenue = timeline.reduce((acc, t) => acc + (t.value || 0), 0)
    const last = timeline[timeline.length - 1]
    const prev = timeline[timeline.length - 2]

    let variation = null
    if (last && prev && prev.value) {
      variation = Math.round(((last.value - prev.value) / prev.value) * 1000) / 10
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          periods: timeline.length,
          rowCount: dataset.rowCount,
          revenueColumn: dataset.roles?.revenue ?? null,
          dateColumn: dataset.roles?.date ?? null,
          categoryColumn: dataset.roles?.category ?? null,
          lastPeriod: last ?? null,
          previousPeriod: prev ?? null,
          variationPercent: variation,
          topCategories: topCategories.slice(0, 5),
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/datasets/:id/sales/trend
 * Serie de ventas por período (timeline) + histograma.
 */
export async function salesTrend(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')
    const insights = dataset.insights ?? {}
    res.json({
      success: true,
      data: {
        trend: insights.timeline ?? [],
        histogram: insights.histogram ?? [],
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets/:id/compare
 * Compara dos datasets del usuario (solo filas y calidad).
 * Cuerpo: { otherDatasetId }
 */
export async function compare(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')

    const otherDatasetId = req.body?.otherDatasetId
    if (!otherDatasetId) throw ApiError.badRequest('Falta otherDatasetId.', 'INVALID_OTHER')

    const other = await getDataset(req.user.id, otherDatasetId, req.user.role)
    if (!other) throw ApiError.notFound('Dataset a comparar no encontrado.', 'DATASET_NOT_FOUND')

    const a = dataset.rows ?? []
    const b = other.rows ?? []
    const shared = a.filter((ra) => b.some((rb) => Object.keys(ra).some((k) => String(ra[k]) === String(rb[k])))).length

    res.json({
      success: true,
      data: {
        compare: {
          base: { id: dataset.id, rowCount: a.length, fileName: dataset.fileName },
          other: { id: other.id, rowCount: b.length, fileName: other.fileName },
          overlappingRows: shared,
          overlapPercent: a.length ? Math.round((shared / a.length) * 1000) / 10 : 0,
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets/:id/enrich
 * Enriquecimiento básico: detecta categoría/región de filas faltantes.
 * Es un stub informativo que devuelve sugerencias basadas en el análisis.
 */
export async function enrich(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')

    const insights = dataset.insights ?? {}
    const missingByColumn = insights.missingByColumn ?? {}
    const suggestions = Object.keys(missingByColumn).map((column) => ({
      column,
      missing: missingByColumn[column],
      action: 'Rellenar con valor más frecuente o ' +
        (dataset.roles?.category === column ? 'categoría detectada' : 'nulo explícito'),
    }))

    res.json({
      success: true,
      data: {
        enrich: {
          applied: false,
          suggestions,
          message: suggestions.length
            ? 'Se detectan columnas con valores faltantes que pueden enriquecerse.'
            : 'No se detectaron valores faltantes para enriquecer.',
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

// ---------- Ofertas y promociones ----------

const OFERTAS_GROUP = 'ofertas'

/**
 * Localiza en un dataset la columna de precio unitario (prefiere nombres claros).
 */
function findPrecioUnitColumn(dataset) {
  const names = (dataset.columns ?? []).map((c) => c.name)
  const prioritized = ['precio_unitario', 'precio unitario', 'precio', 'precio_unit', 'precio_unitario ']
  for (const p of prioritized) {
    const hit = names.find((n) => String(n).toLowerCase().trim() === p.trim())
    if (hit) return hit
  }
  return names.find((n) => /precio|unit/i.test(String(n))) ?? null
}

/**
 * GET /api/datasets/:id/ofertas
 * Sugerencias de ofertas automáticas por producto, basadas en ventas reales.
 */
export async function sugerencias(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')

    const rows = dataset.rows ?? []
    const roles = dataset.roles ?? {}
    const productoKey = roles.category
    const precioUnitKey = findPrecioUnitColumn(dataset)

    const sugerencias = sugerenciasOfertas(rows, { productoKey, precioUnitKey })
    const total = (arr) => arr.reduce((a, b) => a + (b.revenue || 0), 0)

    res.json({
      success: true,
      data: {
        ofertas: {
          productoColumn: productoKey,
          precioColumn: precioUnitKey,
          totalRevenue: Math.round(total(sugerencias) * 100) / 100,
          items: sugerencias.slice(0, 25),
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets/:id/ofertas/impacto
 * Dado producto + % de descuento, calcula el impacto comercial real.
 * Cuerpo: { producto, descuento, tipo?, vigencia? }
 */
export async function impactoOferta(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')

    const { producto, descuento } = req.body ?? {}
    if (!producto || descuento === undefined) {
      throw ApiError.badRequest('Faltan producto y descuento.', 'INVALID_OFERTA')
    }

    const roles = dataset.roles ?? {}
    const agrupado = groupSales(dataset.rows ?? [], {
      productoKey: roles.category,
      precioUnitKey: findPrecioUnitColumn(dataset),
    })
    const item = agrupado.find((g) => g.producto === String(producto))
    if (!item) throw ApiError.notFound('Producto no encontrado en el dataset.', 'PRODUCTO_NOT_FOUND')

    const result = calcularImpacto(item, {
      descuento,
      tipo: req.body.tipo,
      vigencia: req.body.vigencia,
    })

    res.json({ success: true, data: { impacto: result } })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/datasets/:id/ofertas   (opcional ?persist=true)
 * Crea una oferta desde el dataset y, si se pide, la guarda en user_tables.
 * Cuerpo: { producto, descuento, tipo?, vigenciaInicio?, vigenciaFin?, persist? }
 */
export async function crearOferta(req, res, next) {
  try {
    requireSupabase()
    const dataset = await getDataset(req.user.id, req.params.id, req.user.role)
    if (!dataset) throw ApiError.notFound('Dataset no encontrado.', 'DATASET_NOT_FOUND')

    const body = req.body ?? {}
    const { producto, descuento } = body
    if (!producto || descuento === undefined) {
      throw ApiError.badRequest('Faltan producto y descuento.', 'INVALID_OFERTA')
    }

    const roles = dataset.roles ?? {}
    const agrupado = groupSales(dataset.rows ?? [], {
      productoKey: roles.category,
      precioUnitKey: findPrecioUnitColumn(dataset),
    })
    const item = agrupado.find((g) => g.producto === String(producto))
    if (!item) throw ApiError.notFound('Producto no encontrado en el dataset.', 'PRODUCTO_NOT_FOUND')

    const impacto = calcularImpacto(item, {
      descuento,
      tipo: body.tipo,
      vigencia: body.vigencia,
    })
    const fila = buildOfertaRow({
      producto: item.producto,
      tipo: body.tipo || impacto.tipo,
      descuento,
      precioAnterior: impacto.precioAnterior,
      vigenciaInicio: body.vigenciaInicio,
      vigenciaFin: body.vigenciaFin,
    })

    // Persistencia opcional en user_tables (grupo "ofertas")
    const persist = body.persist === true || req.query.persist === 'true'
    let saved = null
    if (persist) {
      const tables = await listTables(req.user.id)
      let ofertas = tables.find((t) => t.group === OFERTAS_GROUP)
      if (!ofertas) {
        ofertas = {
          id: randomUUID(),
          name: 'Ofertas y promociones',
          description: 'Creado desde el analisis de ventas',
          icon: 'percent',
          group: OFERTAS_GROUP,
          fields: [
            { key: 'producto', label: 'Producto', type: 'text' },
            { key: 'tipo', label: 'Tipo', type: 'text' },
            { key: 'descuento', label: 'Descuento (%)', type: 'number' },
            { key: 'precioAnterior', label: 'Precio anterior', type: 'number' },
            { key: 'precioOferta', label: 'Precio oferta', type: 'number' },
            { key: 'vigencia_inicio', label: 'Inicio', type: 'text' },
            { key: 'vigencia_fin', label: 'Fin', type: 'text' },
          ],
          rows: [],
        }
      }
      ofertas.rows = [...(ofertas.rows ?? []), fila]
      saved = await upsertTable(req.user.id, ofertas)
    }

    res.status(201).json({
      success: true,
      data: {
        oferta: {
          ...fila,
          impacto,
        },
        persisted: persist ? saved?.id : null,
      },
    })
  } catch (err) {
    next(err)
  }
}
