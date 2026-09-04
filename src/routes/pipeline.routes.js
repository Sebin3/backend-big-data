import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireAdmin.js'
import * as pipeline from '../controllers/pipeline.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', pipeline.index)
router.get('/:datasetId', pipeline.show)
router.put('/:datasetId', requireRole('analyst'), pipeline.upsert)
router.delete('/:datasetId', requireRole('analyst'), pipeline.destroy)

export default router
