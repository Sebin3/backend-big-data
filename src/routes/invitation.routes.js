import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as invitation from '../controllers/invitation.controller.js'
import { validate, rules } from '../middleware/validate.js'

const router = Router()

router.use(authenticate)
router.use(invitation.requireInvitePermission)

router.get('/', invitation.index)

router.post(
  '/',
  validate({
    email: [rules.email()],
  }),
  invitation.create,
)

router.delete('/:id', invitation.destroy)

export default router
