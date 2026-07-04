export function countWords(text) {
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
 */
export function stripHtmlTags(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
