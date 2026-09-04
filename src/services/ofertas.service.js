// Utilidades para interpretar columnas del dataset
const NUMERIC = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

const VALUE = (row, key) => (key == null ? null : row[key])

/**
 * Por producto (o categoría): unidades, revenue, ticket y precio promedio.
 * - revenue = filas * precio_unitario de cada fila (backup: columna total).
 */
export function groupSales(rows, { productoKey, precioUnitKey, cantidadKey }) {
  const groups = {}
  for (const row of rows ?? []) {
    const name = String(VALUE(row, productoKey) ?? 'Sin nombre')
    if (!groups[name]) {
      groups[name] = { unidades: 0, revenue: 0, tickets: 0, sumaPrecios: 0, nPrecios: 0 }
    }
    const g = groups[name]
    const cantidad = NUMERIC(VALUE(row, cantidadKey)) ?? 1
    const precioUnit = NUMERIC(VALUE(row, precioUnitKey))
    g.unidades += cantidad
    g.tickets += 1
    if (precioUnit != null) {
      g.sumaPrecios += precioUnit
      g.nPrecios += 1
      g.revenue += precioUnit * cantidad
    }
  }

  return Object.entries(groups)
    .map(([producto, g]) => ({
      producto,
      unidades: Math.round(g.unidades),
      tickets: g.tickets,
      precioPromedio: g.nPrecios ? Math.round((g.sumaPrecios / g.nPrecios) * 100) / 100 : 0,
      revenue: Math.round(g.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

/**
 * Clasifica un producto por rendimiento y sugiere tipo + % de descuento.
 */
export function sugerirTipo(item) {
  if (item.revenue >= 100000) {
    return {
      tipo: 'descuento_leve',
      etiqueta: 'Top venta - fidelizar',
      descuentoSugerido: 10,
      fundamento: `Alto rendimiento (${item.unidades} uds / $${item.revenue}): descuento moderado para fidelizar sin erosionar margen.`,
    }
  }
  if (item.revenue >= 30000) {
    return {
      tipo: 'descuento_medio',
      etiqueta: 'Rotacion media - impulsar',
      descuentoSugerido: 15,
      fundamento: `Ventas medias (${item.unidades} uds): descuento medio impulsa volumen sin sacrificar mucho margen.`,
    }
  }
  return {
    tipo: 'descuento_liquidacion',
    etiqueta: 'Bajo movimiento - liquidar',
    descuentoSugerido: 25,
    fundamento: `Bajo movimiento (${item.unidades} uds): descuento agresivo para rotar stock y recuperar inversion.`,
  }
}

/**
 * Genera la lista completa de sugerencias de oferta para un dataset.
 */
export function sugerenciasOfertas(rows, { productoKey, precioUnitKey }) {
  const grupos = groupSales(rows, {
    productoKey,
    precioUnitKey,
    cantidadKey: null,
  })
  return grupos.map((item) => ({
    ...item,
    ...sugerirTipo(item),
    precioOferta:
      Math.round(item.precioPromedio * (1 - (sugerirTipo(item).descuentoSugerido || 0) / 100) * 100) / 100,
  }))
}

/**
 * Calcula el impacto comercial de un descuento sobre un producto real.
 */
export function calcularImpacto(item, { descuento, tipo, vigencia }) {
  const pct = Math.max(0, Math.min(100, Number(descuento) || 0))
  const precioAnterior = Math.round(item.precioPromedio * 100) / 100
  const precioOferta = Math.round(precioAnterior * (1 - pct / 100) * 100) / 100
  const sugerencia = sugerirTipo(item)

  return {
    producto: item.producto,
    tipo: tipo || sugerencia.tipo,
    descuento: pct,
    precioAnterior,
    precioOferta,
    ingresoUnitarioPerdido: Math.round((precioAnterior - precioOferta) * 100) / 100,
    unidadesVendidas: item.unidades,
    revenueHistorico: item.revenue,
    unidadesEstimadasExtra: Math.round(item.unidades * (pct / 100) * 1.5),
    revenueEstimadoOferta: Math.round(item.revenue * (1 + (pct / 100) * 0.5) * 100) / 100,
    vigencia: vigencia || null,
    fundamento: sugerencia.fundamento,
  }
}

/**
 * Constructores de filas de oferta a partir de la definición del usuario.
 */
export function buildOfertaRow(def) {
  const d = Number(def.descuento) || 0
  const precioAnterior = Number(def.precioAnterior) || 0
  const precioOferta = Math.round(precioAnterior * (1 - d / 100) * 100) / 100
  return {
    producto: def.producto,
    tipo: def.tipo || 'descuento',
    descuento: d,
    precioAnterior,
    precioOferta,
    vigencia_inicio: def.vigenciaInicio || '',
    vigencia_fin: def.vigenciaFin || '',
    creado_en: new Date().toISOString(),
  }
}
