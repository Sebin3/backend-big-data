import { Router } from 'express'
import authRoutes from './auth.routes.js'
import datasetRoutes from './dataset.routes.js'
import tableRoutes from './table.routes.js'
import pipelineRoutes from './pipeline.routes.js'
import userRoutes from './user.routes.js'
import invitationRoutes from './invitation.routes.js'
import contactRequestRoutes from './contactRequest.routes.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() })
})

// Autenticación (pública)
router.use('/auth', authRoutes)
router.use('/contact-requests', contactRequestRoutes)

// Módulos de datos (requieren token)
router.use('/datasets', datasetRoutes)
router.use('/tables', tableRoutes)
router.use('/pipelines', pipelineRoutes)
router.use('/users', userRoutes)
router.use('/invitations', invitationRoutes)

export default router
