import { describe, it, expect, vi } from 'vitest'
import { parseHtmlToParagraphs, parseHtmlToDialogueBlocks } from '../../utils/dialogueParser'

describe('dialogueParser', () => {
  describe('parseHtmlToParagraphs', () => {
    it('returns empty array for null/empty', () => {
      expect(parseHtmlToParagraphs(null)).toEqual([])
      expect(parseHtmlToParagraphs('')).toEqual([])
      expect(parseHtmlToParagraphs(undefined)).toEqual([])
    })

    it('extracts paragraphs from simple HTML', () => {
      const html = '<p>First paragraph.</p><p>Second paragraph.</p>'
      const result = parseHtmlToParagraphs(html)
      expect(result).toHaveLength(2)
      expect(result[0].textContent).toBe('First paragraph.')
      expect(result[0].paragraphIndex).toBe(0)
      expect(result[1].textContent).toBe('Second paragraph.')
      expect(result[1].paragraphIndex).toBe(1)
    })

    it('handles nested elements within paragraphs', () => {
      const html = '<p>Hello <strong>world</strong>.</p>'
      const result = parseHtmlToParagraphs(html)
      expect(result).toHaveLength(1)
      expect(result[0].textContent).toBe('Hello world.')
    })

    it('converts BR tags to spaces', () => {
      const html = '<p>Line one<br>Line two</p>'
      const result = parseHtmlToParagraphs(html)
      expect(result).toHaveLength(1)
      expect(result[0].textContent).toBe('Line one Line two')
    })

    it('handles DIV, H1-H6, LI, BLOCKQUOTE as block elements', () => {
      const html = '<div>Div content</div><h2>Heading</h2><li>List item</li><blockquote>Quote</blockquote>'
      const result = parseHtmlToParagraphs(html)
      expect(result).toHaveLength(4)
    })

    it('preserves outerHTML', () => {
      const html = '<p class="special">Content</p>'
      const result = parseHtmlToParagraphs(html)
      expect(result[0].htmlContent).toBe('<p class="special">Content</p>')
    })

    it('handles text outside block tags', () => {
      const html = 'Just text<p>Inside paragraph</p>'
      const result = parseHtmlToParagraphs(html)
      expect(result).toHaveLength(1)
      expect(result[0].textContent).toBe('Inside paragraph')
    })

    it('normalizes whitespace', () => {
      const html = '<p>  Extra    spaces   </p>'
      const result = parseHtmlToParagraphs(html)
      expect(result[0].textContent).toBe('Extra spaces')
    })

    it('assigns sequential paragraph indices', () => {
      const html = '<p>A</p><p>B</p><p>C</p>'
      const result = parseHtmlToParagraphs(html)
      expect(result.map(p => p.paragraphIndex)).toEqual([0, 1, 2])
    })
  })

  describe('parseHtmlToDialogueBlocks', () => {
    it('returns plain paragraphs if no detector provided', () => {
      const html = '<p>Some text.</p>'
      const result = parseHtmlToDialogueBlocks(html, null)
      expect(result).toHaveLength(1)
      expect(result[0].dialogueLines).toBeUndefined()
    })

    it('attaches dialogue detection results to each block', () => {
      const html = '<p>Narration.</p><p>"Dialogue," he said.</p>'
      const mockDetector = vi.fn(text => {
        if (text.includes('Dialogue')) {
          return [{ dialogueText: 'Dialogue,', speakerCandidate: 'he' }]
        }
        return []
      })
      const result = parseHtmlToDialogueBlocks(html, mockDetector)
      expect(result).toHaveLength(2)
      expect(result[0].dialogueLines).toEqual([])
      expect(result[1].dialogueLines).toHaveLength(1)
      expect(result[1].dialogueLines[0].dialogueText).toBe('Dialogue,')
    })
  })
})
