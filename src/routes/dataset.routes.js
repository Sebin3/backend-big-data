import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireAdmin.js'
import * as dataset from '../controllers/dataset.controller.js'

const router = Router()

router.use(authenticate)

// Rutas específicas (DEBEN ir antes de /:id)
router.post('/parse', requireRole('analyst'), dataset.parse)

// CRUD base
router.get('/', dataset.index)
router.post('/', requireRole('analyst'), dataset.store)

// Rutas de un dataset específico
router.get('/:id', dataset.show)
router.delete('/:id', requireRole('analyst'), dataset.destroy)
router.get('/:id/quality', dataset.quality)
router.post('/:id/clean', requireRole('analyst'), dataset.clean)
router.get('/:id/cleaning-log', dataset.cleaningLog)
router.get('/:id/charts/columns', dataset.chartColumns)
router.get('/:id/charts/data', dataset.chartData)
router.get('/:id/charts/raw', dataset.chartRaw)
router.get('/:id/sales/summary', dataset.salesSummary)
router.get('/:id/sales/trend', dataset.salesTrend)
router.post('/:id/compare', requireRole('analyst'), dataset.compare)
router.post('/:id/enrich', requireRole('analyst'), dataset.enrich)
router.get('/:id/ofertas', dataset.sugerencias)
router.post('/:id/ofertas/impacto', requireRole('analyst'), dataset.impactoOferta)
router.post('/:id/ofertas', requireRole('analyst'), dataset.crearOferta)

export default router
