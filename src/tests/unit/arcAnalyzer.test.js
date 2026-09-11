import { describe, it, expect, vi } from 'vitest'

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: vi.fn()
}))

import { analyzeArc } from '@/composables/betareader/arcAnalyzer'
import { aiGenerateJson } from '@/composables/useAiService'

const scenes = [
  { sceneNumber: 1, title: 'Arrival', content: 'Kael docks at dawn.', id: 's1' },
  { sceneNumber: 2, title: 'Storm', content: 'The sky breaks open.', id: 's2' }
]

describe('analyzeArc injector seam', () => {
  it('routes the whole-manuscript call through the injected generator', async () => {
    const stub = vi.fn(async () => ({ pacing: [], setupPayoffs: [], droppedThreads: [] }))
    const out = await analyzeArc(scenes, {}, { generateJson: stub })
    expect(stub).toHaveBeenCalledOnce()
    const [prompt, system, opts] = stub.mock.calls[0]
    expect(prompt).toContain('Full manuscript (2 scenes)')
    expect(opts.schemaName).toBe('arc_analysis')
    expect(aiGenerateJson).not.toHaveBeenCalled()
    // Empty parsed input maps to the empty display shape (with the `all`
    // rollup the mapper always attaches), not to [].
    expect(out).toEqual({ pacing: [], setupPayoffs: [], droppedThreads: [], all: [] })
  })

  it('returns empty findings when the generator yields null', async () => {
    const out = await analyzeArc(scenes, {}, { generateJson: vi.fn(async () => null) })
    expect(out).toEqual({ pacing: [], setupPayoffs: [], droppedThreads: [] })
  })
})
