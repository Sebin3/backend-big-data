/**
 * Motor de análisis de datos del backend.
 *
 * Recibe las filas de un dataset (arreglo de objetos) y calcula:
 * - Tipos de dato por columna (fecha, numérico, categórico)
 * - Valores nulos/vacíos por columna
 * - Filas duplicadas
 * - Completitud (%)
 * - Insights: timeline, histograma, top categorías, distribución de tipos
 *
 * TODO SIN depender del frontend: el backend es la fuente de verdad del análisis.
 */

function isDateLike(value) {
  if (!value || typeof value !== 'string') return false
  const s = value.trim()
  if (!/^\d/.test(s)) return false
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)
}

function isNumeric(value) {
  if (value == null || value === '') return false
  if (typeof value === 'number') return Number.isFinite(value)
  const s = String(value).replace(/,/g, '').trim()
  return s !== '' && Number.isFinite(Number(s))
}

function isEmptyCell(value) {
  return value == null || String(value).trim() === ''
}

function detectType(values) {
  let dates = 0
  let numbers = 0
  let nonEmpty = 0
  for (const v of values) {
    if (isEmptyCell(v)) continue
    nonEmpty++
    if (isDateLike(v)) dates++
    else if (isNumeric(v)) numbers++
  }
  if (nonEmpty === 0) return 'vacío'
  if (dates === nonEmpty) return 'fecha'
  if (numbers === nonEmpty) return 'numérico'
  return 'categórico'
}

function toNumber(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/,/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function monthLabel(iso) {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  // Extraer año-mes directamente del texto para evitar corrimientos de zona horaria
  const m = String(iso).match(/(\d{4})[-/](\d{1,2})/)
  if (m) {
    const yy = m[1].slice(2)
    const mm = parseInt(m[2], 10)
    return `${months[(mm - 1 + 12) % 12]} ${yy}`
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

/**
 * Analiza un arreglo de filas (objetos con claves = columnas).
 * Devuelve un objeto con todo el análisis.
 */
export function analyzeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return buildEmptyAnalysis({})
  }

  const headers = Object.keys(rows[0] ?? {})
  const rowCount = rows.length
  const columnCount = headers.length

  // Perfiles por columna
  const columns = headers.map((name) => {
    const values = rows.map((r) => r[name])
    const type = detectType(values)
    const present = values.filter((v) => !isEmptyCell(v)).length
    const missing = rowCount - present
    return {
      name,
      type,
      present,
      missing,
      missingPercent: rowCount ? (missing / rowCount) * 100 : 0,
      unique: new Set(values.map((v) => (isEmptyCell(v) ? null : String(v)))).size,
    }
  })

  const counts = { fecha: 0, numérico: 0, categórico: 0, vacío: 0 }
  for (const c of columns) counts[c.type] = (counts[c.type] || 0) + 1

  // Celdas faltantes + nulos por columna
  const totalCells = rowCount * columnCount
  let missingCells = 0
  const missingByColumn = {}
  for (const c of columns) {
    missingCells += c.missing
    if (c.missing > 0) missingByColumn[c.name] = c.missing
  }

  // Filas duplicadas
  const seen = new Set()
  let duplicateRows = 0
  for (const r of rows) {
    const sig = headers.map((h) => String(r[h] ?? '')).join('|')
    if (seen.has(sig)) duplicateRows++
    else seen.add(sig)
  }

  // Completitud
  const completeness = totalCells ? Math.round(((totalCells - missingCells) / totalCells) * 1000) / 10 : 100

  // Roles semánticos estimados (puntuando por relevancia del nombre)
  const roleDefs = [
    { role: 'date', keys: ['fecha', 'date', 'dia', 'timestamp', 'periodo'], type: 'fecha' },
    { role: 'revenue', keys: ['total', 'monto', 'ingreso', 'venta', 'revenue', 'amount', 'importe'], type: 'numérico' },
    { role: 'category', keys: ['categoria', 'category', 'producto', 'product', 'tipo', 'type', 'marca'], type: null },
  ]
  const roles = {}
  for (const def of roleDefs) {
    let best = null
    let bestScore = -1
    for (const c of columns) {
      if (def.type && c.type !== def.type) continue
      const lower = c.name.toLowerCase()
      const idx = def.keys.findIndex((k) => lower.includes(k))
      if (idx < 0) continue
      // prioridad: posición del keyword + exactitud (coincidencia exacta pesa más)
      const exact = lower === def.keys[idx]
      const score = (def.keys.length - idx) * 10 + (exact ? 5 : 0)
      if (score > bestScore) {
        bestScore = score
        best = c.name
      }
    }
    if (best) roles[def.role] = best
  }

  // ---- Insights ----
  const insights = buildInsights({ rows, columns, roles, counts })

  return {
    headers,
    columns,
    roles,
    rowCount,
    columnCount,
    totalCells,
    missingCells,
    duplicateRows,
    completeness,
    insights,
  }
}

function buildEmptyAnalysis(headers) {
  const list = Object.keys(headers)
  return {
    headers: list,
    columns: [],
    roles: {},
    rowCount: 0,
    columnCount: list.length,
    totalCells: 0,
    missingCells: 0,
    duplicateRows: 0,
    completeness: 100,
    insights: {},
  }
}

function buildInsights({ rows, columns, roles, counts }) {
  const insights = {}
  const revenueColumn = roles.revenue
  const dateColumn = roles.date
  const categoryColumn = roles.category

  // Distribución de tipos
  insights.typeDistribution = Object.keys(counts).map((name) => ({ name, value: counts[name] }))

  // Nulos por columna
  insights.missingByColumn = {}
  for (const c of columns) if (c.missing > 0) insights.missingByColumn[c.name] = c.missing

  // Timeline (si hay fecha + monto)
  if (dateColumn && revenueColumn) {
    const byMonth = new Map()
    for (const r of rows) {
      const v = toNumber(r[revenueColumn])
      if (v == null || isEmptyCell(r[dateColumn])) continue
      const label = monthLabel(String(r[dateColumn]))
      byMonth.set(label, (byMonth.get(label) || 0) + v)
    }
    insights.timeline = [...byMonth.entries()]
      .map(([label, value]) => ({ label, value: round2(value) }))
      .sort((a, b) => labelKey(a.label) - labelKey(b.label))
    insights.timelineTitle = `Ingresos por mes (${dateColumn})`
  }

  // Top categorías (si hay categoría + monto)
  if (categoryColumn && revenueColumn) {
    const byCat = new Map()
    for (const r of rows) {
      const v = toNumber(r[revenueColumn])
      const cat = r[categoryColumn]
      if (v == null || isEmptyCell(cat)) continue
      byCat.set(String(cat), (byCat.get(String(cat)) || 0) + v)
    }
    insights.topCategories = [...byCat.entries()]
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
    insights.topCategoriesTitle = `Ingresos por categoría (${categoryColumn})`
  }

  // Histograma del campo numérico principal (sin roles.revenue, usa el primer numérico)
  const numericCol = columns.find((c) => c.type === 'numérico')
  if (numericCol) {
    const values = rows.map((r) => toNumber(r[numericCol.name])).filter((v) => v != null)
    if (values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      const bins = 10
      const range = max - min || 1
      const buckets = new Array(bins).fill(0)
      for (const v of values) {
        const idx = Math.min(bins - 1, Math.floor(((v - min) / range) * bins))
        buckets[idx]++
      }
      insights.histogram = buckets.map((count, i) => {
        const lo = min + (range / bins) * i
        const hi = min + (range / bins) * (i + 1)
        return { bin: `${round(lo)}–${round(hi)}`, count }
      })
      insights.histogramColumn = numericCol.name
    }
  }

  return insights
}

function round(n) {
  return Math.round(n * 100) / 100
}
function round2(n) {
  return Math.round(n * 100) / 100
}
function labelKey(label) {
  // convierte "Ene 26" a YY*100+mes para ordenar
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const m = months.indexOf(label.slice(0, 3))
  const yy = parseInt(label.slice(4), 10) || 0
  return yy * 100 + (m + 1)
}
