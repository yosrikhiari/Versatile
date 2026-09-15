export function countWords(text: string | null | undefined): number {
  return text?.trim()
    ? text
        .trim()
        .split(/\s+/)
        .filter((w) => w).length
    : 0
}

/**
 * Strip HTML tags and decode entities to produce plain text.
 * Used to derive word counts and raw text from Tiptap HTML output.
 *
 * Block boundaries become whitespace so `</p><p>` does not glue the last word
 * of one paragraph to the first of the next ("sky.Ilse"), which undercounted
 * every multi-paragraph document. Inline marks (`<b>`, `<em>`) are removed
 * without a space so a mark spanning half a word does not split it.
 */
const BLOCK_TAG_RE =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|hr|tr|td|th|table|section|article|header|footer)\b[^>]*>/gi

export function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(BLOCK_TAG_RE, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
