import { describe, it, expect } from 'vitest'
import { useGenerationSettings } from '@/composables/useGenerationSettings'

describe('useGenerationSettings', () => {
  it('exposes the expected defaults', () => {
    const s = useGenerationSettings()
    expect(s.genre.value).toBe('')
    expect(s.tone.value).toBe('')
    expect(s.wordTarget.value).toBe(3500)
    expect(s.usePreciseStructure.value).toBe(false)
    expect(s.volumes.value).toBe(1)
    expect(s.chaptersPerVolume.value).toBe(10)
    expect(s.wordsPerChapter.value).toBe(2000)
    expect(s.scenesPerChapter.value).toBe(3)
  })

  it('estimatedTotalWords = volumes × chaptersPerVolume × wordsPerChapter and reacts', () => {
    const s = useGenerationSettings()
    expect(s.estimatedTotalWords.value).toBe(1 * 10 * 2000)
    s.volumes.value = 3
    s.chaptersPerVolume.value = 12
    s.wordsPerChapter.value = 2500
    expect(s.estimatedTotalWords.value).toBe(3 * 12 * 2500)
  })
})
