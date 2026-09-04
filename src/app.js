import express from 'express'
import cors from 'cors'
import config from './config/index.js'
import apiRoutes from './routes/index.js'
import { globalLimiter } from './middleware/rateLimit.js'
import { notFound, errorHandler } from './middleware/error.js'

const app = express()

// CORS: permitir el frontend
app.use(
  cors({
    origin: config.frontendUrl.split(',').map((u) => u.trim()),
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
