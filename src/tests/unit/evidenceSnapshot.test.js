import { describe, it, expect } from 'vitest'
import {
  validateEvidenceRegister,
  fingerprintSources,
  buildEvidenceSnapshot,
  compareEvidenceSnapshot,
  assessConsensus
} from '../../evaluation/evidenceSnapshot'

const validRegister = {
  schemaVersion: 1,
  asOf: '2026-11-05',
  gate: {
    version: 'test-gate',
    loadBearingDimensions: ['continuity', 'voice'],
    advisoryDimensions: ['show_tell'],
    minDimensionScore: 7,
    maxMajorIssues: 2,
    enforceMean: true
  },
  models: { defaultProse: 'qwen3:8b' },
  corpora: [],
  claims: [
    {
      id: 'claim-1',
      statement: 'A factual statement.',
      source: 'docs/REPORT.md',
      status: 'active',
      labelSource: 'none'
    }
  ]
}

describe('validateEvidenceRegister', () => {
  it('accepts a minimal register with one active claim', () => {
    expect(validateEvidenceRegister(validRegister)).toEqual([])
  })

  it('rejects duplicate claim ids', () => {
    const register = {
      ...validRegister,
      claims: [validRegister.claims[0], { ...validRegister.claims[0] }]
    }
    expect(validateEvidenceRegister(register)).toContain('duplicate claim id: claim-1')
  })

  it('requires a superseded claim to name a real replacement', () => {
    const register = {
      ...validRegister,
      claims: [
        {
          ...validRegister.claims[0],
          id: 'old-claim',
          status: 'superseded',
          supersededBy: 'missing-claim'
        }
      ]
    }
    const errors = validateEvidenceRegister(register)
    expect(errors).toContain(
      'claims.old-claim: supersededBy references unknown claim missing-claim'
    )
  })

  it('requires a note on a retracted claim', () => {
    const register = {
      ...validRegister,
      claims: [{ ...validRegister.claims[0], status: 'retracted' }]
    }
    expect(validateEvidenceRegister(register)).toContain('claims[0] is retracted but has no note')
  })

  it('accepts an explicit non-evidence script registry', () => {
    const register = {
      ...validRegister,
      nonEvidence: [
        {
          id: 'scene-fixture',
          script: 'scripts/evaluate-scene-retrieval.js',
          command: 'smoke:scene',
          reason: 'relevance is defined by the same cosine the fixture ranks with',
          replacement: 'tools/retrieval-eval/fact_retrieval.py'
        }
      ]
    }
    expect(validateEvidenceRegister(register)).toEqual([])
  })

  it('rejects a non-evidence entry without a command or reason', () => {
    const register = {
      ...validRegister,
      nonEvidence: [{ id: 'bad-script', script: 'scripts/example.js' }]
    }
    const errors = validateEvidenceRegister(register)
    expect(errors).toContain('nonEvidence[0].command is required')
    expect(errors).toContain('nonEvidence[0].reason is required')
  })
})

describe('fingerprintSources', () => {
  it('is deterministic and order-sensitive', () => {
    const a = { path: 'a.ts', content: 'alpha' }
    const b = { path: 'b.ts', content: 'beta' }
    expect(fingerprintSources([a, b])).toEqual(fingerprintSources([a, b]))
    expect(fingerprintSources([a, b]).combined).not.toBe(fingerprintSources([b, a]).combined)
  })

  it('hashes file contents, not just paths', () => {
    expect(fingerprintSources([{ path: 'a.ts', content: 'alpha' }]).sources['a.ts']).not.toBe(
      fingerprintSources([{ path: 'a.ts', content: 'alpha ' }]).sources['a.ts']
    )
  })

  it('normalizes line endings so Windows and CI checkouts agree', () => {
    expect(fingerprintSources([{ path: 'a.ts', content: 'one\r\ntwo\r\n' }])).toEqual(
      fingerprintSources([{ path: 'a.ts', content: 'one\ntwo\n' }])
    )
  })

  it('rejects duplicate paths so a source cannot be silently overwritten', () => {
    expect(() =>
      fingerprintSources([
        { path: 'a.ts', content: 'alpha' },
        { path: 'a.ts', content: 'beta' }
      ])
    ).toThrow('duplicate evidence source path: a.ts')
  })
})

describe('evidence snapshot', () => {
  const register = {
    ...validRegister,
    corpora: [
      {
        id: 'reviewer-set',
        description: 'A reviewer set',
        units: 'scenes',
        count: 78,
        source: 'reports/live/labelling/claude-labels/consensus.json',
        labelSource: 'claude-reviewer',
        status: 'active'
      }
    ]
  }
  const snapshot = buildEvidenceSnapshot({
    generatedAt: '2026-11-05T00:00:00.000Z',
    git: { head: 'abc123', dirty: false },
    sources: [{ path: 'gate.ts', content: 'gate-v1' }],
    promptSources: [{ path: 'prompt.ts', content: 'prompt-v1' }],
    register
  })

  it('builds a snapshot with separate gate and prompt fingerprints', () => {
    expect(snapshot.kind).toBe('versatile-evidence-snapshot')
    expect(snapshot.fingerprints.gate.sources['gate.ts']).toMatch(/^[0-9a-f]{64}$/)
    expect(snapshot.fingerprints.prompts.sources['prompt.ts']).toMatch(/^[0-9a-f]{64}$/)
    expect(snapshot.register.corpora[0].count).toBe(78)
  })

  it('reports changed source content as drift', () => {
    const changed = buildEvidenceSnapshot({
      generatedAt: '2026-11-06T00:00:00.000Z',
      git: { head: 'def456', dirty: true },
      sources: [{ path: 'gate.ts', content: 'gate-v2' }],
      promptSources: [{ path: 'prompt.ts', content: 'prompt-v1' }],
      register
    })
    const drift = compareEvidenceSnapshot(snapshot, changed)
    expect(drift.map((d) => d.path)).toContain('fingerprints.gate.gate.ts')
    expect(drift.map((d) => d.path)).not.toContain('fingerprints.prompts.prompt.ts')
  })

  it('ignores generatedAt and git metadata when checking', () => {
    const same = buildEvidenceSnapshot({
      generatedAt: '2027-01-01T12:00:00.000Z',
      git: { head: 'different', dirty: true },
      sources: [{ path: 'gate.ts', content: 'gate-v1' }],
      promptSources: [{ path: 'prompt.ts', content: 'prompt-v1' }],
      register
    })
    expect(compareEvidenceSnapshot(snapshot, same)).toEqual([])
  })

  it('reports a register change that was not accompanied by a new snapshot', () => {
    const changedRegister = { ...register, asOf: '2026-11-06' }
    const changed = buildEvidenceSnapshot({
      generatedAt: '2026-11-06T00:00:00.000Z',
      git: null,
      sources: [{ path: 'gate.ts', content: 'gate-v1' }],
      promptSources: [{ path: 'prompt.ts', content: 'prompt-v1' }],
      register: changedRegister
    })
    expect(compareEvidenceSnapshot(snapshot, changed).map((d) => d.path)).toContain('register')
  })

  it('refuses an invalid register instead of freezing it', () => {
    expect(() =>
      buildEvidenceSnapshot({
        generatedAt: '2026-11-05T00:00:00.000Z',
        git: null,
        sources: [{ path: 'gate.ts', content: 'gate-v1' }],
        promptSources: [{ path: 'prompt.ts', content: 'prompt-v1' }],
        register: { ...register, asOf: 'not-a-date' }
      })
    ).toThrow('asOf must be YYYY-MM-DD')
  })
})

describe('assessConsensus', () => {
  it('blocks a merged-only consensus file', () => {
    const result = assessConsensus([{ sceneId: 's1', dims: {}, overall: 'revise' }])
    expect(result.status).toBe('blocked')
    expect(result.mergedOnly).toBe(1)
    expect(result.reason).toContain('merged-only')
  })

  it('blocks when only one pass is present', () => {
    const result = assessConsensus([{ sceneId: 's1', passA: {}, passB: null }])
    expect(result.status).toBe('blocked')
    expect(result.withPassA).toBe(1)
    expect(result.withPassB).toBe(0)
  })

  it('is ready only when every entry has both passes', () => {
    const result = assessConsensus([
      { sceneId: 's1', passA: {}, passB: {} },
      { sceneId: 's2', passA: {}, passB: {} }
    ])
    expect(result.status).toBe('ready')
    expect(result.total).toBe(2)
    expect(result.reason).toContain('separate passA and passB')
  })

  it('blocks an empty or missing file', () => {
    expect(assessConsensus(null).status).toBe('blocked')
    expect(assessConsensus([]).reason).toBe('no consensus entries found')
  })
})
