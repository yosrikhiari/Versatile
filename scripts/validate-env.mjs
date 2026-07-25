import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const REQUIRED_KEYS = ['DATABASE_URL', 'JWT_SECRET']
const WARN_KEYS = ['VITE_MISTRAL_API_KEY']
const PLACEHOLDER_PATTERNS = [/change-this/i, /your-/i, /set-via-/i]

let hasError = false

function loadEnv(path) {
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf-8')
  const vars = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return vars
}

const env = { ...process.env, ...loadEnv(resolve(root, '.env')) }

for (const key of REQUIRED_KEYS) {
  if (!env[key]) {
    console.error(`❌ Missing required env var: ${key}`)
    hasError = true
  }
}

for (const key of WARN_KEYS) {
  if (!env[key]) {
    console.warn(`⚠️  Optional env var not set: ${key}`)
  }
}

for (const [key, value] of Object.entries(env)) {
  if (typeof value === 'string' && PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
    console.warn(`⚠️  ${key} still has placeholder value — update before production`)
  }
}

if (hasError) {
  console.error('\n❌ Missing required environment variables. See .env.example for reference.')
  process.exit(1)
} else {
  console.log('✅ Environment validation passed.')
}
