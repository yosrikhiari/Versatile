import { describe, it, expect, beforeEach } from 'vitest'
import { GroundingService } from '../../guardrails/ontology/grounding'
import { buildOntologySnapshot } from '../../guardrails/ontology/instantiate'
import { createSchemaGuard } from '../../guardrails/guards/schemaGuard'
import { createPiiGuard } from '../../guardrails/guards/piiGuard'
import { createContentSafetyGuard } from '../../guardrails/guards/contentSafetyGuard'
import { createCrossTurnGuard } from '../../guardrails/guards/crossTurnGuard'
import { createCacheGuard, digest } from '../../guardrails/guards/cacheGuard'
import { createEntityGuard } from '../../guardrails/guards/entityGuard'

const OUTPUT = 'ai_output'

function grounding({ characters = [], locations = [], relationships = [] } = {}) {
  const g = new GroundingService()
  g.setBuilder(() =>
    buildOntologySnapshot({
      getCharacters: () => characters,
      getLocations: () => locations,
      getPlotThreads: () => [],
      getScenes: () => [],
      getRelationships: () => relationships
    })
  )
  g.refresh()
  return g
}

describe('schemaGuard', () => {
  const guard = createSchemaGuard()

  it('passes a payload matching its schema', () => {
    const results = guard({
      layer: OUTPUT,
      data: { score: 8, issues: [] },
      schema: { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] }
    })
    expect(results).toEqual([])
  })

  it('flags unparseable JSON when a schema is expected', () => {
    const results = guard({ layer: OUTPUT, data: '{"score": 8,,}', schema: { type: 'object' } })
    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('not valid JSON')
    expect(results[0].severity).toBe('blocking')
  })

  it('parses a JSON string payload and validates the parsed shape', () => {
    const results = guard({
      layer: OUTPUT,
      data: '{"score": "high"}',
      schema: { type: 'object', properties: { score: { type: 'number' } } }
    })
    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('should be number')
  })

  it('reports missing required fields', () => {
    const results = guard({
      layer: OUTPUT,
      data: { issues: [] },
      schema: { type: 'object', required: ['score', 'summary'] }
    })
    expect(results[0].message).toContain('score, summary')
  })

  it('validates array item types', () => {
    const results = guard({
      layer: OUTPUT,
      data: { issues: ['ok', 42] },
      schema: {
        type: 'object',
        properties: { issues: { type: 'array', items: { type: 'string' } } }
      }
    })
    expect(results).toHaveLength(1)
    expect(results[0].details.path).toBe('$.issues[1]')
  })

  it('distinguishes integer from number', () => {
    const schema = { type: 'object', properties: { n: { type: 'integer' } } }
    expect(guard({ layer: OUTPUT, data: { n: 3 }, schema })).toEqual([])
    expect(guard({ layer: OUTPUT, data: { n: 3.5 }, schema })).toHaveLength(1)
  })

  it('ignores extra keys by default but reports them in strict mode', () => {
    const schema = { type: 'object', properties: { score: { type: 'number' } } }
    const data = { score: 8, commentary: 'here you go' }
    expect(guard({ layer: OUTPUT, data, schema })).toEqual([])
    expect(
      createSchemaGuard({ strictExtraKeys: true })({ layer: OUTPUT, data, schema })
    ).toHaveLength(1)
  })

  it('is a no-op when no schema is supplied', () => {
    expect(guard({ layer: OUTPUT, data: 'free prose, no contract' })).toEqual([])
  })
})

describe('piiGuard', () => {
  const guard = createPiiGuard()

  it('blocks on a leaked API credential', () => {
    const results = guard({
      layer: OUTPUT,
      data: { content: 'debug output: sk-abcdef0123456789abcdef' }
    })
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('blocking')
    expect(results[0].details.provider).toBe('OpenAI')
  })

  it('redacts the secret rather than echoing it into the event log', () => {
    const results = guard({ layer: OUTPUT, data: { content: 'AKIAIOSFODNN7EXAMPLE' } })
    expect(results[0].details.matches[0]).not.toContain('IOSFODNN7')
    expect(results[0].details.matches[0]).toContain('…')
  })

  it('reports emails as detective, not blocking', () => {
    const results = guard({ layer: OUTPUT, data: { content: 'Write to sarah@example.com.' } })
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('detective')
  })

  it('escalates emails to blocking in strict mode', () => {
    const results = createPiiGuard({ strict: true })({
      layer: OUTPUT,
      data: { content: 'sarah@example.com' }
    })
    expect(results[0].severity).toBe('blocking')
  })

  it('detects phone numbers without matching years or plain digits', () => {
    expect(guard({ layer: OUTPUT, data: { content: 'Call 555-867-5309 now.' } })).toHaveLength(1)
    expect(
      guard({ layer: OUTPUT, data: { content: 'It was 1997 and 40000 people came.' } })
    ).toEqual([])
  })

  it('finds no PII in ordinary prose', () => {
    const results = guard({
      layer: OUTPUT,
      data: { content: 'The garden stretched out behind the estate like a held breath.' }
    })
    expect(results).toEqual([])
  })

  it('scans repeatedly without regex lastIndex leaking between calls', () => {
    const data = { content: 'a@b.com and c@d.com' }
    const first = guard({ layer: OUTPUT, data })
    const second = guard({ layer: OUTPUT, data })
    expect(second).toEqual(first)
    expect(second).toHaveLength(1)
  })
})

describe('contentSafetyGuard', () => {
  const guard = createContentSafetyGuard()

  it('blocks prompt scaffolding leaking into prose', () => {
    const results = guard({
      layer: OUTPUT,
      data: { content: 'As an AI language model, here is the scene you requested.' }
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].severity).toBe('blocking')
  })

  it('blocks a refusal returned where prose was expected', () => {
    const results = guard({
      layer: OUTPUT,
      data: { content: "I'm sorry, but I can't continue that scene." }
    })
    expect(results.some((r) => r.message.includes('refusal'))).toBe(true)
  })

  it("leaves dark fiction alone — genre is the author's call", () => {
    const results = guard({
      layer: OUTPUT,
      data: {
        content:
          'The body lay half-in, half-out of the fountain. No visible trauma. No blood. Sarah crouched, careful not to touch anything.'
      }
    })
    expect(results).toEqual([])
  })

  it('reports a caller-supplied lexicon as detective by default', () => {
    const withTerms = createContentSafetyGuard({ blockedTerms: ['zorblax'] })
    const results = withTerms({ layer: OUTPUT, data: { content: 'The zorblax approached.' } })
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('detective')
  })

  it('escalates lexicon hits when blockOnTerms is set', () => {
    const withTerms = createContentSafetyGuard({ blockedTerms: ['zorblax'], blockOnTerms: true })
    const results = withTerms({ layer: OUTPUT, data: { content: 'The zorblax approached.' } })
    expect(results[0].severity).toBe('blocking')
  })

  it('matches lexicon terms on word boundaries only', () => {
    const withTerms = createContentSafetyGuard({ blockedTerms: ['ass'] })
    expect(withTerms({ layer: OUTPUT, data: { content: 'She passed the class.' } })).toEqual([])
  })
})

describe('crossTurnGuard', () => {
  it('flags an entity referred to by a different known name across turns', () => {
    const g = grounding({
      characters: [{ id: '1', name: 'Sarah Chen', aliases: ['Chen'] }]
    })
    const guard = createCrossTurnGuard(g)

    const results = guard({
      layer: OUTPUT,
      data: { content: 'Chen studied the body.' },
      priorTurns: [{ content: 'Sarah Chen stepped over the tape.' }]
    })

    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('detective')
    expect(results[0].details.drifted[0].entity).toBe('Sarah Chen')
  })

  it('stays quiet when the same surface form is reused', () => {
    const g = grounding({ characters: [{ id: '1', name: 'Sarah Chen', aliases: ['Chen'] }] })
    const guard = createCrossTurnGuard(g)

    const results = guard({
      layer: OUTPUT,
      data: { content: 'Sarah Chen studied the body.' },
      priorTurns: [{ content: 'Sarah Chen stepped over the tape.' }]
    })

    expect(results).toEqual([])
  })

  it('flags a pronoun contradicting the declared set', () => {
    const g = grounding({ characters: [{ id: '1', name: 'Sarah Chen' }] })
    const guard = createCrossTurnGuard(g, { getPronouns: () => ({ 'Sarah Chen': 'she' }) })

    const results = guard({ layer: OUTPUT, data: { content: 'Sarah Chen drew his weapon.' } })

    expect(results).toHaveLength(1)
    expect(results[0].details.conflicts[0]).toMatchObject({ expected: 'she', found: 'his' })
  })

  it('accepts prose using the declared pronoun', () => {
    const g = grounding({ characters: [{ id: '1', name: 'Sarah Chen' }] })
    const guard = createCrossTurnGuard(g, { getPronouns: () => ({ 'Sarah Chen': 'she' }) })

    const results = guard({ layer: OUTPUT, data: { content: 'Sarah Chen drew her weapon.' } })

    expect(results).toEqual([])
  })

  it('does not flag on the first turn when there is no prior context', () => {
    const g = grounding({ characters: [{ id: '1', name: 'Sarah Chen', aliases: ['Chen'] }] })
    const guard = createCrossTurnGuard(g)
    expect(guard({ layer: OUTPUT, data: { content: 'Chen studied the body.' } })).toEqual([])
  })
})

describe('cacheGuard', () => {
  it('accepts an entry whose digest matches its payload', () => {
    const guard = createCacheGuard()
    const value = 'cached scene text'
    const results = guard({
      layer: OUTPUT,
      cacheKey: 'k1',
      data: { key: 'k1', value, digest: digest(value), createdAt: Date.now() }
    })
    expect(results).toEqual([])
  })

  it('blocks when the payload no longer matches its digest', () => {
    const guard = createCacheGuard()
    const results = guard({
      layer: OUTPUT,
      cacheKey: 'k1',
      data: { key: 'k1', value: 'tampered', digest: digest('original'), createdAt: Date.now() }
    })
    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('digest')
  })

  it('blocks when the entry key differs from the lookup key', () => {
    const guard = createCacheGuard()
    const results = guard({ layer: OUTPUT, cacheKey: 'k1', data: { key: 'k2', value: 'x' } })
    expect(results[0].message).toContain('key mismatch')
  })

  it('flags an entry past its TTL', () => {
    const nowMs = 1_000_000
    const guard = createCacheGuard({ ttlMs: 1000, now: () => nowMs })
    const results = guard({
      layer: OUTPUT,
      data: { key: 'k1', value: 'x', createdAt: nowMs - 5000 }
    })
    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('stale')
  })

  it('honours a per-entry ttlMs over the guard default', () => {
    const nowMs = 1_000_000
    const guard = createCacheGuard({ ttlMs: 1000, now: () => nowMs })
    const results = guard({
      layer: OUTPUT,
      data: { key: 'k1', value: 'x', createdAt: nowMs - 5000, ttlMs: 60_000 }
    })
    expect(results).toEqual([])
  })

  it('flags a cached value whose type no longer fits the caller schema', () => {
    const guard = createCacheGuard()
    const results = guard({
      layer: OUTPUT,
      data: { key: 'k1', value: 'a string' },
      schema: { type: 'object' }
    })
    expect(results[0].message).toContain('expects object')
  })

  it('produces a stable digest for equal values', () => {
    expect(digest('abc')).toBe(digest('abc'))
    expect(digest('abc')).not.toBe(digest('abd'))
  })
})

describe('entityGuard with the fixed ontology indexing', () => {
  let guard

  beforeEach(() => {
    const g = grounding({
      characters: [{ id: '1', name: 'Sarah Chen' }],
      locations: [{ id: '2', name: 'Rosethorn Estate' }]
    })
    guard = createEntityGuard(g)
  })

  it('accepts known entity names', () => {
    expect(
      guard({ layer: OUTPUT, data: { characters: ['Sarah Chen'], location: 'Rosethorn Estate' } })
    ).toEqual([])
  })

  it('blocks a phantom entity', () => {
    const results = guard({ layer: OUTPUT, data: { characters: ['Aldric the Bold'] } })
    expect(results).toHaveLength(1)
    expect(results[0].severity).toBe('blocking')
    expect(results[0].details.unknownNames).toEqual(['Aldric the Bold'])
  })

  it('does not treat an empty name as known', () => {
    // Regression: unnamed entities used to claim the '' key in entityByName,
    // which made any empty reference resolve as valid.
    const g = grounding({ characters: [{ id: '1', name: '' }] })
    expect(createEntityGuard(g)({ layer: OUTPUT, data: { location: 'Nowhere' } })).toHaveLength(1)
  })
})
