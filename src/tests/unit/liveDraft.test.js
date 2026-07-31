import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  LiveDraftBridge,
  proseToHtml,
  countProseWords
} from '../../composables/generation/writing/liveDraft'

describe('proseToHtml', () => {
  it('turns blank-line-separated prose into paragraphs', () => {
    expect(proseToHtml('First para.\n\nSecond para.')).toBe('<p>First para.</p><p>Second para.</p>')
  })

  it('keeps a single newline inside a paragraph as a soft break', () => {
    expect(proseToHtml('"Run," she said.\nHe ran.')).toBe('<p>"Run," she said.<br>He ran.</p>')
  })

  it('collapses runs of blank lines into one break', () => {
    expect(proseToHtml('A.\n\n\n\nB.')).toBe('<p>A.</p><p>B.</p>')
  })

  it('escapes markup so model output cannot inject nodes', () => {
    expect(proseToHtml('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>')
  })

  it('returns empty string for empty or whitespace-only input', () => {
    expect(proseToHtml('')).toBe('')
    expect(proseToHtml('   \n\n  ')).toBe('')
    expect(proseToHtml(null)).toBe('')
    expect(proseToHtml(undefined)).toBe('')
  })

  it('normalizes CRLF', () => {
    expect(proseToHtml('A.\r\n\r\nB.')).toBe('<p>A.</p><p>B.</p>')
  })
})

describe('countProseWords', () => {
  it('counts words without counting empty splits', () => {
    expect(countProseWords('  one   two \n three  ')).toBe(3)
    expect(countProseWords('')).toBe(0)
    expect(countProseWords(null)).toBe(0)
  })
})

describe('LiveDraftBridge', () => {
  let store
  let bridge

  beforeEach(() => {
    vi.useFakeTimers()
    store = {
      subsections: [
        { id: 's1', sectionId: 'sec1', content: '', wordCount: 0 },
        { id: 's2', sectionId: 'sec1', content: '', wordCount: 0 },
        { id: 's3', sectionId: 'sec2', content: '', wordCount: 0 }
      ],
      activeSectionId: null,
      activeSubsectionId: null,
      setActiveSection(id) {
        this.activeSectionId = id
      },
      setActiveSubsection(id) {
        this.activeSubsectionId = id
      }
    }
    bridge = new LiveDraftBridge(store)
  })

  it('opens the scene it starts writing in the editor', () => {
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    expect(store.activeSubsectionId).toBe('s1')
    expect(store.activeSectionId).toBe('sec1')
  })

  it('streams prose into that scene as HTML', () => {
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    bridge.push('s1', 'The door opened.')
    vi.advanceTimersByTime(200)
    expect(store.subsections[0].content).toBe('<p>The door opened.</p>')
    expect(store.subsections[0].wordCount).toBe(3)
  })

  it('keeps parallel scenes in their own subsections instead of interleaving', () => {
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    bridge.begin({ sceneIndex: 1, subsectionId: 's2' })
    bridge.push('s1', 'Scene one text.')
    bridge.push('s2', 'Scene two text.')
    vi.advanceTimersByTime(200)
    expect(store.subsections[0].content).toBe('<p>Scene one text.</p>')
    expect(store.subsections[1].content).toBe('<p>Scene two text.</p>')
  })

  it('follows the lowest in-flight scene, not the most recently started', () => {
    bridge.begin({ sceneIndex: 2, subsectionId: 's3' })
    expect(store.activeSubsectionId).toBe('s3')
    // A lower-numbered scene starting later must not steal focus mid-scene…
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    expect(store.activeSubsectionId).toBe('s3')
    // …but when the focused scene finishes, focus moves to the lowest remaining.
    bridge.finish('s3')
    expect(store.activeSubsectionId).toBe('s1')
  })

  it('flushes the final prose on finish without waiting for the timer', () => {
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    bridge.push('s1', 'Half a sentence')
    bridge.push('s1', 'Half a sentence, then the rest.')
    bridge.finish('s1')
    expect(store.subsections[0].content).toBe('<p>Half a sentence, then the rest.</p>')
  })

  it('does not write an abandoned scene', () => {
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    bridge.push('s1', 'partial')
    bridge.abandon('s1')
    vi.advanceTimersByTime(500)
    expect(store.subsections[0].content).toBe('')
  })

  it('ignores scenes with no subsection id', () => {
    bridge.begin({ sceneIndex: 0, subsectionId: null })
    bridge.push(null, 'text')
    vi.advanceTimersByTime(200)
    expect(store.activeSubsectionId).toBeNull()
  })

  it('writes nothing when disabled', () => {
    bridge.setEnabled(false)
    bridge.begin({ sceneIndex: 0, subsectionId: 's1' })
    bridge.push('s1', 'text')
    vi.advanceTimersByTime(200)
    expect(store.subsections[0].content).toBe('')
    expect(store.activeSubsectionId).toBeNull()
  })

  it('focusSubsection opens a finished scene', () => {
    bridge.focusSubsection('s2')
    expect(store.activeSubsectionId).toBe('s2')
    expect(store.activeSectionId).toBe('sec1')
  })
})
