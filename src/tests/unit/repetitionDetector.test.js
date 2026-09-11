import { describe, it, expect, vi } from 'vitest'

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: vi.fn()
}))

import { detectRepetitions } from '@/composables/betareader/repetitionDetector'
import { aiGenerateJson } from '@/composables/useAiService'

const scenes = [
  { sceneNumber: 1, title: 'Arrival', content: 'Kael docks at dawn.', id: 's1' },
  { sceneNumber: 2, title: 'Storm', content: 'The sky breaks open.', id: 's2' }
]

describe('detectRepetitions injector seam', () => {
  it('routes the whole-manuscript call through the injected generator', async () => {
    const stub = vi.fn(async () => ({ repetitions: [] }))
    const out = await detectRepetitions(scenes, {}, { generateJson: stub })
    expect(stub).toHaveBeenCalledOnce()
    const [prompt, system, opts] = stub.mock.calls[0]
    expect(prompt).toContain('Full manuscript (2 scenes)')
    expect(opts.schemaName).toBe('repetition_detection')
    expect(aiGenerateJson).not.toHaveBeenCalled()
    expect(out).toEqual([])
  })

  it('returns [] when the generator yields null', async () => {
    const out = await detectRepetitions(scenes, {}, { generateJson: vi.fn(async () => null) })
    expect(out).toEqual([])
  })
})
