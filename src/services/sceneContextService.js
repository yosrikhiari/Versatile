function extractLastWords(text, wordCount) {
  if (!text) return ''
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= wordCount) return text.trim()
  return words.slice(-wordCount).join(' ')
}

function buildProseExcerpt(completedScenes, proseWindow) {
  const lastScene = completedScenes.at(-1)
  if (!lastScene?.prose) return ''
  return `RECENT PROSE (from end of previous scene):\n${extractLastWords(lastScene.prose, proseWindow)}`
}

function buildCharacterStates(completedScenes, characters) {
  if (!characters || characters.length === 0) return ''

  const states = characters
    .map((char) => {
      const scenesWithChar = completedScenes.filter(
        (s) => s.prose && s.prose.toLowerCase().includes(char.name.toLowerCase())
      )
      if (scenesWithChar.length === 0) return null

      const lastAppearance = scenesWithChar.at(-1)
      const sceneCount = scenesWithChar.length

      const critique = lastAppearance.critiqueResult
      const charIssues = (critique?.issues || []).filter((i) =>
        i.description?.toLowerCase().includes(char.name.toLowerCase())
      )

      const emotionalState = lastAppearance.brief?.emotionalGoal || 'unknown'
      const location = lastAppearance.brief?.location || 'unknown'
      const actionNote =
        charIssues.length > 0
          ? charIssues[0].description
          : `appears in scene ${lastAppearance.number}`

      let summary = `CHARACTER STATE: ${char.name} is ${emotionalState} at ${location}. Last action: ${actionNote}. Scene count: ${sceneCount}.`

      const relationships = (char.traits || []).map((t) => ({
        character: t,
        status: 'unknown'
      }))
      for (const rel of relationships) {
        summary += ` Relationship with ${rel.character}: ${rel.status}.`
      }

      return summary
    })
    .filter(Boolean)

  if (states.length === 0) return ''
  return `CHARACTER STATES:\n${states.join('\n')}`
}

function buildSceneMemory(completedScenes, memoryLimit) {
  const recent = completedScenes.slice(-memoryLimit)
  const entries = recent.map((s) => {
    const title = s.brief?.title || `Scene ${s.number}`
    const whatChanged = s.brief?.whatChanges || 'unknown'
    const emotionalGoal = s.brief?.emotionalGoal || 'unknown'
    return `SCENE ${s.number}: ${title} — ${whatChanged}. Emotional beat: ${emotionalGoal}.`
  })
  return `SCENE MEMORY:\n${entries.join('\n')}`
}

/**
 * Build combined scene context for writer prompt injection.
 * @param {Object} options
 * @param {Array<{number: number, brief: Object, prose: string, critiqueResult: Object}>} options.completedScenes - Completed scenes with their data
 * @param {Array<{name: string, role: string, description: string, traits?: string[]}>} [options.characters] - Character registry from story bible
 * @param {number} [options.currentSceneIndex] - Index of scene being written (0-based)
 * @param {Object} [options.options]
 * @param {number} [options.options.proseWindow=500] - Words of previous scene prose to include
 * @param {number} [options.options.memoryLimit=8] - Max scene memories to include
 * @returns {string} Formatted context string, or empty string if no completed scenes
 */
export function buildSceneContext({ completedScenes, characters, currentSceneIndex: _currentSceneIndex, options }) {
  if (!completedScenes || completedScenes.length === 0) return ''

  const opts = options || {}
  const proseWindow = opts.proseWindow ?? 500
  const memoryLimit = opts.memoryLimit ?? 8

  const sections = []

  const proseExcerpt = buildProseExcerpt(completedScenes, proseWindow)
  if (proseExcerpt) sections.push(proseExcerpt)

  const charStates = buildCharacterStates(completedScenes, characters)
  if (charStates) sections.push(charStates)

  const sceneMemory = buildSceneMemory(completedScenes, memoryLimit)
  if (sceneMemory) sections.push(sceneMemory)

  return sections.join('\n\n---\n\n')
}
