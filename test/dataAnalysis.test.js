import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRows } from '../src/services/dataAnalysis.service.js'

test('análisis básico: filas sin problemas', () => {
  const rows = [
    { fecha: '2026-01-05', producto: 'Laptop', total: '1200', region: 'Lima' },
    { fecha: '2026-01-06', producto: 'Mouse', total: '25', region: 'Lima' },
    { fecha: '2026-01-07', producto: 'Teclado', total: '60', region: 'Arequipa' },
  ]
  const a = analyzeRows(rows)
  assert.equal(a.rowCount, 3)
  assert.equal(a.columnCount, 4)
  assert.equal(a.totalCells, 12)
  assert.equal(a.missingCells, 0)
  assert.equal(a.duplicateRows, 0)
  assert.equal(a.completeness, 100)
  assert.equal(a.columns.find((c) => c.name === 'fecha').type, 'fecha')
  assert.equal(a.columns.find((c) => c.name === 'total').type, 'numérico')
  assert.equal(a.columns.find((c) => c.name === 'producto').type, 'categórico')
})

test('detecta celdas vacías y filas duplicadas', () => {
  const rows = [
    { fecha: '2026-01-05', producto: 'Laptop', total: '1200' },
    { fecha: '2026-01-05', producto: 'Laptop', total: '1200' }, // duplicada exacta
    { fecha: '2026-01-06', producto: '', total: '' }, // fila vacía
    { fecha: '2026-01-07', producto: 'Mouse', total: '50' },
  ]
  const a = analyzeRows(rows)
  assert.equal(a.rowCount, 4)
  assert.equal(a.totalCells, 12)
  assert.equal(a.missingCells, 2) // producto vacío + total vacío
  assert.equal(a.duplicateRows, 1) // la fila 0 duplicada en 1
  assert.ok(a.completeness < 100)
  assert.deepEqual(a.insights.missingByColumn, { producto: 1, total: 1 })
})

test('roles semánticos detectados', () => {
  const rows = [
    { fecha: '2026-01-05', categoria: 'Electrónica', total: '100' },
    { fecha: '2026-01-06', categoria: 'Hogar', total: '200' },
  ]
  const a = analyzeRows(rows)
  assert.equal(a.roles.date, 'fecha')
  assert.equal(a.roles.revenue, 'total')
  assert.equal(a.roles.category, 'categoria')
})

test('insights: timeline y top categorías', () => {
  const rows = [
    { fecha: '2026-01-05', categoria: 'Electrónica', total: '100' },
    { fecha: '2026-01-20', categoria: 'Electrónica', total: '50' },
    { fecha: '2026-02-01', categoria: 'Hogar', total: '200' },
  ]
  const a = analyzeRows(rows)
  assert.equal(a.insights.timeline.length, 2) // Ene y Feb
  assert.equal(a.insights.timeline[0].value, 150) // Ene suma 100+50
  assert.equal(a.insights.timeline[1].value, 200) // Feb
  assert.equal(a.insights.topCategories[0].name, 'Hogar') // 200 > 150
  assert.equal(a.insights.topCategories[0].value, 200)
  assert.equal(a.insights.topCategories[1].name, 'Electrónica')
  assert.equal(a.insights.topCategories[1].value, 150)
})

test('fila totalmente vacía no rompe', () => {
  const rows = [{ a: '', b: '' }, { a: '1', b: 'x' }]
  const a = analyzeRows(rows)
  assert.equal(a.rowCount, 2)
  assert.equal(a.missingCells, 2)
})

test('arreglo vacío devuelve análisis vacío sin error', () => {
  const a = analyzeRows([])
  assert.equal(a.rowCount, 0)
  assert.equal(a.completeness, 100)
})
