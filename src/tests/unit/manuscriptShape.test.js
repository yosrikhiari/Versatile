import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/db-structure', () => ({
  getSubsections: vi.fn()
}))
vi.mock('@/services/db-story-shape', () => ({
  saveShapeAnalysis: vi.fn(),
  getLatestShapeVersion: vi.fn()
}))

import { buildManuscriptText, analyzeManuscriptShape } from '@/services/generation/manuscriptShape'
import { getSubsections } from '@/services/db-structure'
import { saveShapeAnalysis, getLatestShapeVersion } from '@/services/db-story-shape'

// Manuscript-scoped shape analysis for the finalize contract: the run's
// committed manuscript, not the open editor document — heuristic-only, so
// finalize stays free of per-run LLM calls.

const sections = [
  { id: 's2', title: 'Cold Water', order: 1 },
  { id: 's1', title: 'The Arrival', order: 0 }
]
const subsections = [
  { id: 'u2', sectionId: 's1', order: 1, content: '<p>Second paragraph. It ends!</p>' },
  { id: 'u1', sectionId: 's1', order: 0, content: '<p>First paragraph. It begins.</p>' },
  { id: 'u3', sectionId: 's2', order: 0, content: '<p>Cold open. Water everywhere.</p>' }
]

describe('buildManuscriptText', () => {
  it('orders sections and subsections and strips markup', () => {
    const text = buildManuscriptText(sections, subsections)
    expect(text.indexOf('The Arrival')).toBeLessThan(text.indexOf('Cold Water'))
    expect(text.indexOf('First paragraph')).toBeLessThan(text.indexOf('Second paragraph'))
    expect(text).not.toContain('<p>')
    expect(text).toContain('[Section 1: The Arrival]')
    expect(text).toContain('[Section 2: Cold Water]')
  })
})

describe('analyzeManuscriptShape', () => {
  it('saves a versioned heuristic analysis of the committed manuscript', async () => {
    getSubsections.mockResolvedValue(subsections)
    getLatestShapeVersion.mockResolvedValue(4)
    const out = await analyzeManuscriptShape({ projectId: 'p1', sections })
    expect(out.ok).toBe(true)
    expect(out.version).toBe(5)
    expect(saveShapeAnalysis).toHaveBeenCalledOnce()
    const record = saveShapeAnalysis.mock.calls[0][0]
    expect(record).toMatchObject({ projectId: 'p1', sceneId: 'full-manuscript', version: 5 })
    expect(record.analysis.metrics.wordCount).toBeGreaterThan(0)
  })

  it('saves nothing when the manuscript is empty', async () => {
    getSubsections.mockResolvedValue([])
    const out = await analyzeManuscriptShape({ projectId: 'p1', sections: [] })
    expect(out.ok).toBe(false)
    expect(saveShapeAnalysis).not.toHaveBeenCalled()
  })
})
