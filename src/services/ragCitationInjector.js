export function formatCitationContext(retrievedChunks) {
  if (!retrievedChunks || !retrievedChunks.length) return ''

  const parts = retrievedChunks.map((chunk, i) => {
    const tag = chunk.source || `[Source ${i + 1}]`
    return `[Source: ${tag}]\n${chunk.text.trim()}\n`
  })

  return `\n--- Relevant Sources ---\n${parts.join('\n')}\n--- End Sources ---\n`
}

export function getSourceMap(retrievedChunks) {
  const map = new Map()
  for (const chunk of (retrievedChunks || [])) {
    const key = `${chunk.sourceType}:${chunk.sourceId}`
    if (!map.has(key)) {
      map.set(key, chunk)
    }
  }
  return map
}
