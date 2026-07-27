function countWords(text: any) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function extractLastWords(text: any, wordCount: any) {
  if (!text) return ''
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= wordCount) return text.trim()
  return words.slice(-wordCount).join(' ')
}

function buildProseExcerpt(completedScenes: any, proseWindow: any) {
  const lastScene = completedScenes.at(-1)
  if (!lastScene?.prose) return ''
  return `RECENT PROSE (from end of previous scene):\n${extractLastWords(lastScene.prose, proseWindow)}`
}

function buildCharacterStates(completedScenes: any, characters: any) {
  if (!characters || characters.length === 0) return ''

  const states = characters
      .map((char: any) => {
      const scenesWithChar = completedScenes.filter(
        (s: any) => s.prose && s.prose.toLowerCase().includes(char.name.toLowerCase())
      )
      if (scenesWithChar.length === 0) return null

      const lastAppearance = scenesWithChar.at(-1)
      const sceneCount = scenesWithChar.length

      const critique = lastAppearance.critiqueResult
      const charIssues = (critique?.issues || []).filter((i: any) =>
        i.description?.toLowerCase().includes(char.name.toLowerCase())
      )

      const emotionalState = lastAppearance.brief?.emotionalGoal || 'unknown'
      const location = lastAppearance.brief?.location || 'unknown'
      const actionNote =
        charIssues.length > 0
          ? charIssues[0].description
          : `appears in scene ${lastAppearance.number}`

      let summary = `CHARACTER STATE: ${char.name} is ${emotionalState} at ${location}. Last action: ${actionNote}. Scene count: ${sceneCount}.`

      const relationships = (char.traits || []).map((t: any) => ({
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

export function scoreSceneRelevance(pastScene: any, currentSceneBrief: any) {
  let score = 0

  const pastChars = pastScene.brief?.charactersPresent || []
  const currentChars = currentSceneBrief.charactersPresent || []

  const sharedChars = pastChars.filter((c: any) => currentChars.includes(c))
  score += sharedChars.length * 3

  if (pastScene.brief?.location && currentSceneBrief.location &&
      pastScene.brief.location === currentSceneBrief.location) {
    score += 2
  }

  if (pastScene.brief?.arcPosition && currentSceneBrief.arcPosition &&
      pastScene.brief.arcPosition === currentSceneBrief.arcPosition) {
    score += 2
  }

  if (pastScene.number === currentSceneBrief.sceneNumber - 1) {
    score += 5
  }

  return score
}

export function buildSceneMemory(completedScenes: any, memoryLimit: any, currentSceneBrief: any) {
  let selected = completedScenes

  if (currentSceneBrief) {
    const scored = completedScenes
      .map((s: any) => ({ scene: s, score: scoreSceneRelevance(s, currentSceneBrief) }))
      .sort((a: any, b: any) => b.score - a.score || b.scene.number - a.scene.number)
    selected = scored.slice(0, memoryLimit).map((s: any) => s.scene).sort((a: any, b: any) => a.number - b.number)
  } else {
    selected = completedScenes.slice(-memoryLimit)
  }

  const entries = selected.map((s: any) => {
    const title = s.brief?.title || `Scene ${s.number}`
    const whatChanged = s.brief?.whatChanges || 'unknown'
    const emotionalGoal = s.brief?.emotionalGoal || 'unknown'
    return `SCENE ${s.number}: ${title} — ${whatChanged}. Emotional beat: ${emotionalGoal}.`
  })
  return `SCENE MEMORY:\n${entries.join('\n')}`
}

export function buildSceneContext({ completedScenes, characters, currentSceneIndex, currentSceneBrief, options }: any) {
  if (!completedScenes || completedScenes.length === 0) return ''

  const opts = options || {}
  const proseWindow = opts.proseWindow ?? 500
  const memoryLimit = opts.memoryLimit ?? 8

  const sections = []

  const proseExcerpt = buildProseExcerpt(completedScenes, proseWindow)
  if (proseExcerpt) sections.push(proseExcerpt)

  const charStates = buildCharacterStates(completedScenes, characters)
  if (charStates) sections.push(charStates)

  const sceneMemory = buildSceneMemory(completedScenes, memoryLimit, currentSceneBrief)
  if (sceneMemory) sections.push(sceneMemory)

  return sections.join('\n\n---\n\n')
}
