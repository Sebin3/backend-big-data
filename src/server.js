import app from './app.js'
import config from './config/index.js'
import { isSupabaseConfigured } from './config/supabase.js'

const HOST = process.env.HOST || '0.0.0.0'
const server = app.listen(config.port, HOST, () => {
  console.log('=====================================')
  console.log('  Big Data CRM - API')
  console.log(`  Entorno : ${config.env}`)
  console.log(`  Puerto  : ${config.port}`)
  console.log(`  Host    : ${HOST}`)
  console.log(`  Supabase: ${isSupabaseConfigured ? 'CONFIGURADO' : 'FALTA CONFIGURAR (.env)'}`)
  console.log('=====================================')
})

function shutdown(signal) {
  console.log(`\n${signal} recibido, cerrando servidor...`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export default server
