import { describe, it, expect } from 'vitest'
import { summarizeLog } from '@/utils/promptUtils'

const entry = (n) => `Scene ${n} ("Title ${n}"): something happened`

describe('summarizeLog', () => {
  it('accepts the joined string every caller actually passes', () => {
    // THE REGRESSION. The old signature required an Array and returned '' for
    // anything else, but every caller passed logEntries.join('\n'). So this
    // always returned '', and every writer prompt read "nothing has happened
    // yet" no matter how deep into the novel it was.
    const joined = [entry(1), entry(2)].join('\n')
    const result = summarizeLog(joined)
    expect(result).not.toBe('')
    expect(result).toContain('Scene 1')
    expect(result).toContain('Scene 2')
  })

  it('still accepts an array', () => {
    expect(summarizeLog([entry(1), entry(2)])).toBe(`${entry(1)}\n${entry(2)}`)
  })

  it('returns entries verbatim at or below the verbatim limit', () => {
    const entries = [1, 2, 3, 4, 5].map(entry)
    expect(summarizeLog(entries)).toBe(entries.join('\n'))
    expect(summarizeLog(entries)).not.toContain('omitted')
  })

  it('keeps the most recent entries and elides the middle past the limit', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7, 8].map(entry)
    const result = summarizeLog(entries)

    // Most recent three survive.
    expect(result).toContain('Scene 6')
    expect(result).toContain('Scene 7')
    expect(result).toContain('Scene 8')
    // Older ones do not.
    expect(result).not.toContain('Scene 1')
    expect(result).not.toContain('Scene 5')
    // And it says so rather than pretending nothing was lost.
    expect(result).toContain('5 earlier entries omitted')
  })

  it('elides identically whether given a string or an array', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7].map(entry)
    expect(summarizeLog(entries.join('\n'))).toBe(summarizeLog(entries))
  })

  it('returns "" for empty and missing input', () => {
    expect(summarizeLog('')).toBe('')
    expect(summarizeLog([])).toBe('')
    expect(summarizeLog(null)).toBe('')
    expect(summarizeLog(undefined)).toBe('')
  })

  it('ignores blank lines and blank entries', () => {
    // Callers pass `chapterLog: ''` to mean "no log"; a whitespace-only string
    // must not become a phantom entry.
    expect(summarizeLog('   ')).toBe('')
    expect(summarizeLog('\n\n')).toBe('')
    expect(summarizeLog([entry(1), '', null, undefined])).toBe(entry(1))
  })

  it('does not report an omission count when nothing was omitted', () => {
    expect(summarizeLog([entry(1)])).not.toContain('omitted')
  })
})
