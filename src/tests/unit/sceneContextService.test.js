import { describe, it, expect } from 'vitest'
import { scoreSceneRelevance, buildSceneMemory, buildSceneContext } from '@/services/sceneContextService'

function makeScene({ number, charactersPresent, location, arcPosition, title, whatChanges, emotionalGoal, prose }) {
  return {
    number,
    brief: {
      title: title || `Scene ${number}`,
      charactersPresent: charactersPresent || [],
      location: location || 'Nowhere',
      arcPosition: arcPosition || 'rising',
      whatChanges: whatChanges || 'something happened',
      emotionalGoal: emotionalGoal || 'tension'
    },
    prose: prose || `${number}. `.repeat(200),
  }
}

describe('scoreSceneRelevance', () => {
  const currentBrief = {
    sceneNumber: 5,
    charactersPresent: ['Eldrin', 'Lyra'],
    location: 'Forest',
    arcPosition: 'climax'
  }

  it('scores character overlap at +3 per shared character', () => {
    const past = makeScene({ number: 3, charactersPresent: ['Eldrin'], location: 'Swamp' })
    expect(scoreSceneRelevance(past, currentBrief)).toBe(3)
  })

  it('scores two shared characters as +6', () => {
    const past = makeScene({ number: 3, charactersPresent: ['Eldrin', 'Lyra'], location: 'Swamp' })
    expect(scoreSceneRelevance(past, currentBrief)).toBe(6)
  })

  it('scores location match as +2', () => {
    const past = makeScene({ number: 3, charactersPresent: ['Zara'], location: 'Forest' })
    expect(scoreSceneRelevance(past, currentBrief)).toBe(2)
  })

  it('scores arcPosition match as +2', () => {
    const past = makeScene({ number: 3, charactersPresent: ['Zara'], location: 'Swamp', arcPosition: 'climax' })
    expect(scoreSceneRelevance(past, currentBrief)).toBe(2)
  })

  it('scores immediate predecessor as +5', () => {
    const past = makeScene({ number: 4, charactersPresent: ['Zara'], location: 'Swamp' })
    expect(scoreSceneRelevance(past, currentBrief)).toBe(5)
  })

  it('combines all signals for immediate predecessor with shared chars and same location', () => {
    const past = makeScene({ number: 4, charactersPresent: ['Eldrin', 'Lyra'], location: 'Forest', arcPosition: 'climax' })
    // 6 (chars) + 2 (location) + 2 (arc) + 5 (predecessor) = 15
    expect(scoreSceneRelevance(past, currentBrief)).toBe(15)
  })

  it('returns 0 for no overlap at all', () => {
    const past = makeScene({ number: 1, charactersPresent: ['Zara'], location: 'Swamp', arcPosition: 'rising' })
    expect(scoreSceneRelevance(past, currentBrief)).toBe(0)
  })

  it('handles missing brief data gracefully', () => {
    const past = { number: 1 }
    const minimal = { sceneNumber: 3, charactersPresent: [] }
    expect(scoreSceneRelevance(past, minimal)).toBe(0)
  })
})

describe('buildSceneMemory', () => {
  const scenes = [
    makeScene({ number: 1, charactersPresent: ['Zara'], location: 'Swamp', arcPosition: 'rising' }),
    makeScene({ number: 2, charactersPresent: ['Eldrin'], location: 'Forest', arcPosition: 'rising' }),
    makeScene({ number: 3, charactersPresent: ['Eldrin', 'Lyra'], location: 'Forest', arcPosition: 'climax' }),
    makeScene({ number: 4, charactersPresent: ['Lyra'], location: 'Castle', arcPosition: 'falling' }),
  ]

  it('returns fallback order when no currentSceneBrief', () => {
    const result = buildSceneMemory(scenes, 3)
    expect(result).toMatch(/SCENE 2:/)
    expect(result).toMatch(/SCENE 3:/)
    expect(result).toMatch(/SCENE 4:/)
    expect(result).not.toMatch(/SCENE 1:/)
  })

  it('promotes high-relevance scenes when currentSceneBrief is provided', () => {
    const brief = { sceneNumber: 5, charactersPresent: ['Eldrin'], location: 'Forest', arcPosition: 'climax' }
    const result = buildSceneMemory(scenes, 2, brief)
    expect(result).toMatch(/SCENE 3:/)
  })

  it('exceeds memoryLimit and picks most relevant when more scenes than limit', () => {
    const brief = { sceneNumber: 5, charactersPresent: ['Eldrin', 'Lyra'], location: 'Forest', arcPosition: 'climax' }
    const result = buildSceneMemory(scenes, 2, brief)
    const matches = [...result.matchAll(/SCENE \d+:/g)]
    expect(matches.length).toBeLessThanOrEqual(2)
  })

  it('returns lower-relevance scenes when high-relevance limit is exceeded', () => {
    const brief = { sceneNumber: 5, charactersPresent: ['Eldrin'], location: 'Forest', arcPosition: 'climax' }
    const result = buildSceneMemory(scenes, 1, brief)
    const matches = [...result.matchAll(/SCENE \d+:/g)]
    expect(matches.length).toBe(1)
  })

  it('still outputs proper formatting', () => {
    const brief = { sceneNumber: 5, charactersPresent: ['Eldrin'], location: 'Forest', arcPosition: 'climax' }
    const result = buildSceneMemory(scenes, 4, brief)
    expect(result).toMatch(/^SCENE MEMORY:/)
    expect(result).toMatch(/SCENE \d:/)
  })
})

describe('buildSceneContext', () => {
  const scenes = [
    makeScene({ number: 1, charactersPresent: ['Zara'], location: 'Swamp', title: 'Opening', whatChanges: 'intro', emotionalGoal: 'mystery', prose: 'Zara walked through the Swamp. ' }),
    makeScene({ number: 2, charactersPresent: ['Eldrin'], location: 'Forest', title: 'The Meeting', whatChanges: 'meeting', emotionalGoal: 'hope', prose: 'Eldrin waited in the Forest. ' }),
  ]
  const characters = [
    { name: 'Zara', role: 'hero', description: 'brave' },
    { name: 'Eldrin', role: 'mentor', description: 'wise' },
  ]

  it('returns empty string for no completed scenes', () => {
    expect(buildSceneContext({ completedScenes: [] })).toBe('')
    expect(buildSceneContext({})).toBe('')
  })

  it('includes all three sections when data is present', () => {
    const result = buildSceneContext({
      completedScenes: scenes,
      characters,
      currentSceneIndex: 2,
      currentSceneBrief: { sceneNumber: 3, charactersPresent: ['Eldrin'], location: 'Forest' }
    })
    expect(result).toMatch(/RECENT PROSE/)
    expect(result).toMatch(/CHARACTER STATES/)
    expect(result).toMatch(/SCENE MEMORY/)
  })
})
