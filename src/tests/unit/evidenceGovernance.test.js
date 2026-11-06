import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateEvidenceRegister } from '../../evaluation/evidenceSnapshot'

const root = resolve(__dirname, '..', '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

describe('evidence governance', () => {
  it('names the fixture scripts as smoke commands and keeps deprecated aliases', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['smoke:scene']).toBeDefined()
    expect(pkg.scripts['smoke:quality']).toBeDefined()
    expect(pkg.scripts['eval:scene']).toContain('smoke:scene')
    expect(pkg.scripts['pipeline:quality']).toContain('smoke:quality')
  })

  it('stamps the scene-retrieval report and console output as non-evidence', () => {
    const source = read('scripts/evaluate-scene-retrieval.js')
    expect(source).toContain('EVIDENCE_STATUS')
    expect(source).toContain('Not evidence')
    expect(source).toContain('circular')
  })

  it('stamps the quality-regression report and console output as a fixture', () => {
    const source = read('scripts/ml-pipelines/quality-regression/evaluate.js')
    expect(source).toContain("evidenceStatus: 'fixture'")
    expect(source).toContain('notEvidenceReason')
    expect(source).toContain('SMOKE ONLY')
  })

  it('registers both scripts in the evidence register as non-evidence', () => {
    const register = JSON.parse(read('tools/judge-bench/evidence-register.json'))
    expect(validateEvidenceRegister(register)).toEqual([])
    expect(register.nonEvidence.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['scene-retrieval-fixture', 'quality-regression-fixture'])
    )
    expect(register.nonEvidence.every((entry) => entry.replacement !== undefined)).toBe(true)
  })

  it('records the ConStory probe as exploratory model-labelled evidence', () => {
    const register = JSON.parse(read('tools/judge-bench/evidence-register.json'))
    const claim = register.claims.find((entry) => entry.id === 'constory-within-probe')
    expect(claim).toBeDefined()
    expect(claim.status).toBe('exploratory')
    expect(claim.labelSource).toBe('model-generated')
  })
})
