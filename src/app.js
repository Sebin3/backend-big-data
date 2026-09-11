import express from 'express'
import cors from 'cors'
import config from './config/index.js'
import apiRoutes from './routes/index.js'
import { globalLimiter } from './middleware/rateLimit.js'
import { notFound, errorHandler } from './middleware/error.js'

const app = express()


const SAFE_ORIGINS = [
  'https://bigneton.vercel.app',
  'https://big-data-crm.vercel.app',
  'http://localhost:5173',
]
const allowedOrigins = [
  ...config.frontendUrl.split(',').map((u) => u.trim().replace(/\/+$/, '')),
  ...SAFE_ORIGINS,
]
console.log('[CORS] Orígenes permitidos:', allowedOrigins)
app.use(
  cors({
    origin: (origin, callback) => {
      // Peticiones sin origen (curl, server-to-server) se permiten
      if (!origin) return callback(null, true)
      const normalized = origin.replace(/\/+$/, '')
      const allowed = allowedOrigins.includes(normalized)
      console.log(`[CORS] origin=${origin} allowed=${allowed} allowList=${JSON.stringify(allowedOrigins)}`)
      callback(null, allowed)
    },
    credentials: true,
  }),
)

// Parsing de JSON
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// Limitador global
app.use('/api', globalLimiter)

// Rutas de la API
app.use('/api', apiRoutes)

// 404 y errores
app.use(notFound)
app.use(errorHandler)

export default app
