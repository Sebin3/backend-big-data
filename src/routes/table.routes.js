import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireAdmin.js'
import * as table from '../controllers/table.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', table.index)
router.get('/:id', table.show)
router.post('/', requireRole('analyst'), table.store)
router.put('/:id', requireRole('analyst'), table.update)
router.delete('/:id', requireRole('analyst'), table.destroy)

export default router
