import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '../..')

const numberOr = (value, fallback) => {
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  port: numberOr(process.env.PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    usersTable: process.env.SUPABASE_USERS_TABLE || 'users',
    datasetsTable: process.env.SUPABASE_DATASETS_TABLE || 'datasets',
    tablesTable: process.env.SUPABASE_TABLES_TABLE || 'user_tables',
    pipelinesTable: process.env.SUPABASE_PIPELINES_TABLE || 'pipeline_maps',
    datasetAccessTable: process.env.SUPABASE_DATASET_ACCESS_TABLE || 'dataset_access',
    cleaningLogsTable: process.env.SUPABASE_CLEANING_LOGS_TABLE || 'cleaning_logs',
    invitationsTable: process.env.SUPABASE_INVITATIONS_TABLE || 'invitations',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  otp: {
    expiresMinutes: numberOr(process.env.OTP_EXPIRES_MINUTES, 5),
    length: numberOr(process.env.OTP_LENGTH, 6),
  },

  email: {
    brevo: {
      apiKey: process.env.BREVO_API_KEY || '',
      from: process.env.BREVO_FROM || 'stvinpz@11344134.brevosend.com',
      name: process.env.BREVO_FROM_NAME || 'SendAquaLM',
    },
  },
}

export default config
