import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../../utils/sanitizeHtml'

describe('sanitizeHtml', () => {
  it('returns empty string for nullish input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('keeps safe formatting markup', () => {
    expect(sanitizeHtml('<p>Hello <b>world</b></p>')).toBe('<p>Hello <b>world</b></p>')
  })

  it('strips script elements entirely', () => {
    expect(sanitizeHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>')
  })

  it('strips event-handler attributes but keeps the element', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">Hi</p>')
    expect(out).toBe('<p>Hi</p>')
  })

  it('strips javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('click')
  })
})
