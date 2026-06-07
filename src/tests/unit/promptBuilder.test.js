import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../composables/generation/pipeline/promptBuilder'

describe('buildPrompt', () => {
  const baseBundle = {
    projectBlock: '',
    charactersBlock: '',
    locationsBlock: '',
    plotThreadsBlock: '',
    relationshipsBlock: '',
    manuscriptBlock: ''
  }

  const sampleSchema = {
    type: 'character',
    systemPrompt: 'Generate a character.',
    promptKeys: ['name', 'role', 'goal'],
    fieldConstraints: 'character'
  }

  it('returns systemPrompt and userPrompt', () => {
    const result = buildPrompt({ shapedBundle: baseBundle, schema: sampleSchema })
    expect(result.systemPrompt).toBe('Generate a character.')
    expect(result.userPrompt).toContain('Generate one character for this story.')
  })

  it('includes project block when present', () => {
    const bundle = { ...baseBundle, projectBlock: '\n\nPROJECT:\nFantasy' }
    const result = buildPrompt({ shapedBundle: bundle, schema: sampleSchema })
    expect(result.userPrompt).toContain('PROJECT:\nFantasy')
  })

  it('includes entities block when present', () => {
    const bundle = { ...baseBundle, charactersBlock: '\n\nCHARACTERS:\n- John' }
    const result = buildPrompt({ shapedBundle: bundle, schema: sampleSchema })
    expect(result.userPrompt).toContain('CHARACTERS:\n- John')
    expect(result.userPrompt).toContain('Do NOT create duplicates')
  })

  it('includes extra instructions when provided', () => {
    const result = buildPrompt({
      shapedBundle: baseBundle,
      schema: sampleSchema,
      extraInstructions: 'Make it a villain.'
    })
    expect(result.userPrompt).toContain('Make it a villain.')
  })

  it('includes manuscript block when present', () => {
    const bundle = { ...baseBundle, manuscriptBlock: '\n\nMANUSCRIPT:\ntext' }
    const result = buildPrompt({ shapedBundle: bundle, schema: sampleSchema })
    expect(result.userPrompt).toContain('MANUSCRIPT:\ntext')
  })

  it('includes field constraints guidance', () => {
    const result = buildPrompt({ shapedBundle: baseBundle, schema: sampleSchema })
    expect(result.userPrompt).toContain('FIELD CONSTRAINTS:')
    expect(result.userPrompt).toContain('name: max')
  })

  it('omits dedup line when no entities', () => {
    const result = buildPrompt({ shapedBundle: baseBundle, schema: sampleSchema })
    expect(result.userPrompt).not.toContain('Do NOT create duplicates')
  })
})
