import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate } from '../middleware/auth.js'
import * as contact from '../controllers/contactRequest.controller.js'

const router = Router()
const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false })

router.post('/', contactLimiter, contact.create)
router.post('/sync-gmail', authenticate, contact.requireContactPermission('manage'), contact.syncGmail)
router.get('/', authenticate, contact.requireContactPermission('view'), contact.index)
router.get('/:id', authenticate, contact.requireContactPermission('view'), contact.show)
router.post('/:id/messages', authenticate, contact.requireContactPermission('reply'), contact.reply)
router.patch('/:id', authenticate, contact.requireContactPermission('manage'), contact.update)

export default router
