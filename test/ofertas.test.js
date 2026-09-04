import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupSales,
  sugerirTipo,
  calcularImpacto,
  sugerenciasOfertas,
  buildOfertaRow,
} from '../src/services/ofertas.service.js'

const ROWS = [
  { producto: 'Laptop', cantidad: '2', precio_unitario: '1000' },
  { producto: 'Laptop', cantidad: '1', precio_unitario: '1200' },
  { producto: 'Mouse', cantidad: '5', precio_unitario: '20' },
  { producto: 'Monitor', cantidad: '1', precio_unitario: '300' },
]

test('groupSales agrupa por producto y calcula unidades, precio y revenue', () => {
  const g = groupSales(ROWS, { productoKey: 'producto', precioUnitKey: 'precio_unitario', cantidadKey: 'cantidad' })
  const laptop = g.find((x) => x.producto === 'Laptop')
  assert.equal(laptop.unidades, 3)
  assert.equal(laptop.tickets, 2)
  assert.equal(laptop.precioPromedio, 1100)
  assert.equal(laptop.revenue, 3200) // 1000*2 + 1200*1
  assert.equal(g[0].producto, 'Laptop') // ordenado por revenue desc
})

test('sugerirTipo clasifica por rendimiento', () => {
  assert.equal(sugerirTipo({ revenue: 150000, unidades: 30 }).tipo, 'descuento_leve')
  assert.equal(sugerirTipo({ revenue: 50000, unidades: 10 }).tipo, 'descuento_medio')
  assert.equal(sugerirTipo({ revenue: 5000, unidades: 2 }).tipo, 'descuento_liquidacion')
})

test('calcularImpacto aplica descuento y proyecta impacto', () => {
  const item = { producto: 'Laptop', precioPromedio: 1100, unidades: 3, revenue: 3200 }
  const r = calcularImpacto(item, { descuento: 10 })
  assert.equal(r.precioAnterior, 1100)
  assert.equal(r.precioOferta, 990)
  assert.equal(r.ingresoUnitarioPerdido, 110)
  assert.equal(r.unidadesVendidas, 3)
  assert.ok(r.revenueEstimadoOferta > r.revenueHistorico)
})

test('sugerenciasOfertas devuelve lista con precioOferta calculado', () => {
  const s = sugerenciasOfertas(ROWS, { productoKey: 'producto', precioUnitKey: 'precio_unitario' })
  assert.equal(s.length, 3)
  const laptop = s.find((x) => x.producto === 'Laptop')
  assert.equal(laptop.descuentoSugerido, 25) // revenue 3200 -> liquidación
  assert.equal(laptop.precioOferta, 825) // 1100 - 25%
  assert.ok(laptop.fundamento)
})

test('buildOfertaRow construye la fila persistible', () => {
  const r = buildOfertaRow({
    producto: 'Laptop',
    descuento: 15,
    precioAnterior: 1100,
    vigenciaInicio: '2026-10-01',
    vigenciaFin: '2026-10-15',
  })
  assert.equal(r.producto, 'Laptop')
  assert.equal(r.descuento, 15)
  assert.equal(r.precioOferta, 935)
  assert.equal(r.vigencia_inicio, '2026-10-01')
})
