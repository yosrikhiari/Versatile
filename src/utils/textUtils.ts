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
 */
export function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
