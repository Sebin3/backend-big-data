import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import * as profile from '../controllers/profile.controller.js'
import * as admin from '../controllers/admin.controller.js'
import { validate, rules } from '../middleware/validate.js'

const router = Router()

router.use(authenticate)

// Perfil propio
router.get('/me', profile.me)
router.put('/me', profile.update)
router.put('/me/password', profile.changePassword)

// Gestión de usuarios (solo admin)
router.get('/', requireAdmin, admin.index)

router.post(
  '/',
  requireAdmin,
  validate({
    name: [rules.required('El nombre es requerido')],
    email: [rules.required('El correo es requerido'), rules.email()],
    password: [rules.required('La contraseña es requerida'), rules.min(6, 'La contraseña debe tener al menos 6 caracteres')],
  }),
  admin.create,
)

router.put('/:id/role', requireAdmin, admin.updateRole)
router.put('/:id/permissions', requireAdmin, admin.updateMemberPermissions)
router.get('/:id/datasets', requireAdmin, admin.showDatasetAccess)
router.put('/:id/datasets', requireAdmin, admin.updateUserDatasets)
router.delete('/:id', requireAdmin, admin.destroy)

export default router
