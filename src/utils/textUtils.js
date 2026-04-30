export function countWords(text) {
  return text?.trim() ? text.trim().split(/\s+/).filter(w => w).length : 0
}

export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}