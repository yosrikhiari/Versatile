export function countWords(text) {
  return text?.trim() ? text.trim().split(/\s+/).filter(w => w).length : 0
}

/**
 * Strip HTML tags and decode entities to produce plain text.
 * Used to derive word counts and raw text from Tiptap HTML output.
 */
export function stripHtmlTags(html) {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}