import { ref, computed, type Ref } from 'vue'
import { useNotifications } from './useNotifications'

/**
 * useErrorTracker — one place every subsystem reports failures to (M-7.2).
 *
 * Keeps a bounded ring buffer of recent errors tagged by source
 * ('sync' | 'ai' | 'db' | 'ui' | 'network' | 'unknown') and severity, so the UI
 * can surface a health indicator and a debuggable log without each call site
 * inventing its own handling. Critical errors optionally raise a toast.
 *
 * Call sites use `captureError(err, { source, severity, context, notify })`.
 */

interface ErrorEntry {
  id: number
  message: string
  name: string
  stack: string | null
  source: string
  severity: string
  context: any
  at: string
}

const MAX_ERRORS = 50
const errors: Ref<ErrorEntry[]> = ref([])
let errorIdCounter = 0

const VALID_SOURCES = ['sync', 'ai', 'db', 'ui', 'network', 'unknown']
const VALID_SEVERITIES = ['info', 'warning', 'error', 'critical']

function normalizeError(err: any) {
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack }
  if (typeof err === 'string') return { message: err, name: 'Error', stack: null }
  return {
    message: String(err?.message ?? err ?? 'Unknown error'),
    name: err?.name ?? 'Error',
    stack: err?.stack ?? null
  }
}

function captureError(err: any, options: any = {}) {
  const { source = 'unknown', severity = 'error', context = null, notify = false } = options
  const normalized = normalizeError(err)

  const entry = {
    id: errorIdCounter++,
    ...normalized,
    source: VALID_SOURCES.includes(source) ? source : 'unknown',
    severity: VALID_SEVERITIES.includes(severity) ? severity : 'error',
    context,
    // ISO timestamp is passed by caller-free Date use; kept simple here.
    at: new Date().toISOString()
  }

  errors.value.push(entry)
  while (errors.value.length > MAX_ERRORS) errors.value.shift()

  // Always leave a console breadcrumb for local debugging.
  const line = `[${entry.source}] ${entry.name}: ${entry.message}`
  if (entry.severity === 'critical' || entry.severity === 'error')
    console.error(line, context ?? '')
  else console.warn(line, context ?? '')

  if (notify || entry.severity === 'critical') {
    const { addToast } = useNotifications()
    addToast(
      entry.severity === 'critical' ? `Something went wrong: ${entry.message}` : entry.message,
      entry.severity === 'info' ? 'info' : entry.severity === 'warning' ? 'warning' : 'danger',
      6000
    )
  }

  return entry
}

function clearErrors() {
  errors.value = []
}

export function useErrorTracker() {
  const recentErrors = computed(() => errors.value.slice().reverse())
  const errorCount = computed(() => errors.value.length)
  const hasCritical = computed(() => errors.value.some((e) => e.severity === 'critical'))

  const bySource = (source: any) => computed(() => errors.value.filter((e: any) => e.source === source))

  return {
    errors,
    recentErrors,
    errorCount,
    hasCritical,
    bySource,
    captureError,
    clearErrors
  }
}

// Bare export for non-component modules (services) that can't use a composable.
export { captureError as trackError }
