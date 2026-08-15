import { describe, it, expect } from 'vitest'
import { buildManuscriptRtf } from '@/services/exportService'

// RTF is the handoff format: Word, Google Docs, Pages and LibreOffice open it,
// and Scrivener imports it natively. A malformed control word does not degrade
// gracefully — the reader either refuses the file or swallows the text after it
// — so the escaping is what these tests are really about.

const data = (over = {}) => ({
  project: null,
  manuscript: { content: 'The gate stood open.', wordCount: 4 },
  sections: [],
  subsections: [],
  characters: [],
  locations: [],
  plotThreads: [],
  ...over
})

describe('buildManuscriptRtf', () => {
  it('opens and closes a valid RTF group', () => {
    const rtf = buildManuscriptRtf(data(), 'The Drowned Gate')
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true)
    expect(rtf.trimEnd().endsWith('}')).toBe(true)
  })

  it('carries the title and the prose', () => {
    const rtf = buildManuscriptRtf(data(), 'The Drowned Gate')
    expect(rtf).toContain('The Drowned Gate')
    expect(rtf).toContain('The gate stood open.')
  })

  it('escapes the three characters that would otherwise be RTF syntax', () => {
    const rtf = buildManuscriptRtf(
      data({ manuscript: { content: 'a \\ b { c } d', wordCount: 5 } }),
      'T'
    )
    expect(rtf).toContain('a \\\\ b \\{ c \\} d')
  })

  it('emits non-ASCII as a unicode escape with a substitute character', () => {
    // A curly apostrophe is the single most common non-ASCII character in
    // fiction; emitted raw it corrupts everything after it in an ANSI reader.
    const rtf = buildManuscriptRtf(
      data({ manuscript: { content: 'Kael’s blade — sharp', wordCount: 4 } }),
      'T'
    )
    expect(rtf).toContain('\\u8217?')
    expect(rtf).toContain('\\u8212?')
    expect(rtf).not.toContain('’')
  })

  it('emits astral characters as a surrogate pair', () => {
    const rtf = buildManuscriptRtf(
      data({ manuscript: { content: '\u{1F600}', wordCount: 1 } }),
      'T'
    )
    // U+1F600 → D83D DE00, both wrapped negative as signed 16-bit.
    expect(rtf).toContain('\\u-10179?\\u-8704?')
  })

  it('makes each line its own paragraph and drops blank ones', () => {
    const rtf = buildManuscriptRtf(
      data({ manuscript: { content: 'One.\n\nTwo.\n', wordCount: 2 } }),
      'T'
    )
    const paragraphs = rtf.match(/\\pard\\fi360/g) || []
    expect(paragraphs).toHaveLength(2)
  })

  it('produces a valid document when the project has no prose yet', () => {
    const rtf = buildManuscriptRtf(data({ manuscript: null }), 'Untitled')
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true)
    expect(rtf.trimEnd().endsWith('}')).toBe(true)
    expect(rtf).toContain('Untitled')
  })

  it('escapes the title too, not just the body', () => {
    const rtf = buildManuscriptRtf(data(), 'Braces {and} back\\slash')
    expect(rtf).toContain('Braces \\{and\\} back\\\\slash')
  })
})
