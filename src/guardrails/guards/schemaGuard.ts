import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

/**
 * Lightweight JSON-Schema subset understood by this guard. Full JSON Schema is
 * deliberately out of scope — this validates the shapes `aiGenerateStructured`
 * actually asks for (flat objects, typed fields, required lists).
 */
interface SimpleSchema {
  type?: string
  properties?: Record<string, SimpleSchema>
  required?: string[]
  items?: SimpleSchema
  additionalProperties?: boolean
  enum?: unknown[]
}

export function createSchemaGuard(
  opts: {
    enabled?: boolean
    /** Report unexpected top-level keys. Off by default — models routinely add commentary fields. */
    strictExtraKeys?: boolean
  } = {}
): GuardFunction {
  const { enabled = true, strictExtraKeys = false } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const fail = (message: string, details: Record<string, unknown>): void => {
      results.push({
        kind: 'schema_conformance',
        passed: false,
        severity: 'blocking',
        message,
        details,
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    // A raw string payload must at least be parseable JSON when a schema is expected.
    let payload: unknown = context.data
    if (typeof context.data === 'string') {
      if (!context.schema) return results
      const raw = context.data
      try {
        payload = JSON.parse(raw)
      } catch (err) {
        fail(`Output is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, {
          preview: raw.slice(0, 200),
        })
        return results
      }
    }

    const schema = context.schema as SimpleSchema | undefined
    if (!schema) return results

    if (payload === null || payload === undefined) {
      fail('Output is empty but a schema was expected', { schemaType: schema.type })
      return results
    }

    for (const violation of validate(payload, schema, '$')) {
      fail(violation.message, violation.details)
    }

    if (strictExtraKeys && schema.properties && isPlainObject(payload)) {
      const expected = new Set(Object.keys(schema.properties))
      const extra = Object.keys(payload).filter(k => !expected.has(k))
      if (extra.length > 0) {
        fail(`Output has unexpected top-level key(s): ${extra.join(', ')}`, { extra })
      }
    }

    return results
  }
}

interface Violation {
  message: string
  details: Record<string, unknown>
}

function validate(value: unknown, schema: SimpleSchema, path: string): Violation[] {
  const violations: Violation[] = []

  if (schema.type && !matchesType(value, schema.type)) {
    violations.push({
      message: `${path} should be ${schema.type} but got ${describe(value)}`,
      details: { path, expected: schema.type, actual: describe(value) },
    })
    return violations
  }

  if (schema.enum && !schema.enum.includes(value as never)) {
    violations.push({
      message: `${path} is not one of the allowed values`,
      details: { path, allowed: schema.enum, actual: value },
    })
  }

  if (schema.required && isPlainObject(value)) {
    const missing = schema.required.filter(k => value[k] === undefined || value[k] === null)
    if (missing.length > 0) {
      violations.push({
        message: `${path} is missing required field(s): ${missing.join(', ')}`,
        details: { path, missing },
      })
    }
  }

  if (schema.properties && isPlainObject(value)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (value[key] === undefined || value[key] === null) continue
      violations.push(...validate(value[key], sub, `${path}.${key}`))
    }
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, i) => {
      violations.push(...validate(item, schema.items as SimpleSchema, `${path}[${i}]`))
    })
  }

  return violations
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
