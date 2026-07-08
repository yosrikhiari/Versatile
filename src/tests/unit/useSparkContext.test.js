import { describe, it, expect, vi } from 'vitest'
import { useSparkContext } from '@/composables/useSparkContext'

function make(overrides = {}) {
  const sparkStore = {
    currentOutline: null,
    currentContent: null,
    currentStreamingContent: '',
    ...overrides.sparkStore
  }
  const setTab = vi.fn()
  const getTurns = overrides.getTurns || (() => [])
  return { scope: useSparkContext({ sparkStore, getTurns, setTab }), sparkStore, setTab }
}

describe('useSparkContext', () => {
  describe('sparkContextLabel', () => {
    it('labels a titled blueprint', () => {
      const { scope } = make({ sparkStore: { currentOutline: { title: 'Chapter One' } } })
      expect(scope.sparkContextLabel.value).toBe('Blueprint: "Chapter One"')
    })
    it('labels an untitled blueprint', () => {
      const { scope } = make({ sparkStore: { currentOutline: {} } })
      expect(scope.sparkContextLabel.value).toBe('Chapter Blueprint')
    })
    it('truncates long content', () => {
      const { scope } = make({ sparkStore: { currentContent: 'x'.repeat(100) } })
      expect(scope.sparkContextLabel.value).toContain('…')
    })
    it('falls back to a generic label', () => {
      const { scope } = make()
      expect(scope.sparkContextLabel.value).toBe('Spark output')
    })
  })

  describe('formatBlueprintAsContext', () => {
    it('formats only the present fields, one per line', () => {
      const { scope } = make()
      const out = scope.formatBlueprintAsContext({ title: 'T', turningPoint: 'TP', writingNotes: '' })
      expect(out).toBe('Chapter: T\nTurning point: TP')
    })
  })

  describe('handleSendSparkToGenerator', () => {
    it('prefers a blueprint, formats it, and switches to the chapter tab', () => {
      const { scope, setTab } = make({ sparkStore: { currentOutline: { title: 'T', openingBeat: 'OB' } } })
      scope.handleSendSparkToGenerator()
      expect(scope.sparkContext.value).toContain('Chapter: T')
      expect(scope.sparkContext.value).toContain('Opening beat: OB')
      expect(setTab).toHaveBeenCalledWith('chapter')
    })

    it('uses generated content and switches to the scene tab', () => {
      const { scope, setTab } = make({ sparkStore: { currentContent: 'prose here' } })
      scope.handleSendSparkToGenerator()
      expect(scope.sparkContext.value).toBe('prose here')
      expect(setTab).toHaveBeenCalledWith('scene')
    })

    it('falls back to the last assistant conversation turn', () => {
      const { scope, setTab } = make({
        getTurns: () => [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'the answer' }
        ]
      })
      scope.handleSendSparkToGenerator()
      expect(scope.sparkContext.value).toBe('the answer')
      expect(setTab).toHaveBeenCalledWith('chapter')
    })
  })

  it('clearSparkContext empties the context', () => {
    const { scope } = make({ sparkStore: { currentContent: 'x' } })
    scope.handleSendSparkToGenerator()
    expect(scope.sparkContext.value).not.toBe('')
    scope.clearSparkContext()
    expect(scope.sparkContext.value).toBe('')
  })
})
