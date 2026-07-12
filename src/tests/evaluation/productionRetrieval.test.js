import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  buildRetrievalContext,
  buildEmbeddingContext,
  selectRelevantPriorScenes
} from '@/composables/generation/context/sceneContext'
import { computeAll } from '@/evaluation/ragMetrics'

vi.mock('@/services/ollamaService', () => ({
  cosineSimilarity: vi.fn((a, b) => {
    if (!a || !b || a.length !== b.length) return 0
    const dot = a.reduce((s, v, i) => s + v * b[i], 0)
    const ma = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
    const mb = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
    return ma && mb ? dot / (ma * mb) : 0
  })
}))

vi.mock('@/services/embeddingService', () => ({
  getEmbedding: vi.fn(),
  getEmbeddings: vi.fn(),
  clearEmbeddingCache: vi.fn(),
  getEmbeddingCacheSize: vi.fn(() => 0),
  hasMistralKey: vi.fn(() => false)
}))

import { getEmbedding } from '@/services/embeddingService'

const TOPIC_KEYWORDS = {
  fantasy: [
    'magic',
    'wizard',
    'dragon',
    'spell',
    'enchanted',
    'sword',
    'quest',
    'kingdom',
    'prophecy',
    'mythical'
  ],
  mystery: [
    'detective',
    'clue',
    'suspect',
    'murder',
    'investigation',
    'motive',
    'evidence',
    'alibi',
    'whodunit',
    'mystery'
  ],
  romance: [
    'love',
    'heart',
    'passion',
    'embrace',
    'devotion',
    'romance',
    'soulmate',
    'chemistry',
    'courtship',
    'attraction'
  ],
  sciFi: [
    'space',
    'robot',
    'alien',
    'quantum',
    'futuristic',
    'starship',
    'dimension',
    'technology',
    'cyborg',
    'artificial'
  ],
  historical: [
    'medieval',
    'ancient',
    'empire',
    'throne',
    'revolution',
    'century',
    'era',
    'kingdom',
    'heritage',
    'ancestor'
  ],
  horror: [
    'dark',
    'shadow',
    'monster',
    'ghost',
    'haunted',
    'blood',
    'terror',
    'scream',
    'creature',
    'nightmare'
  ],
  adventure: [
    'journey',
    'expedition',
    'treasure',
    'explore',
    'survive',
    'discover',
    'voyage',
    'wilderness',
    'peril',
    'quest'
  ],
  thriller: [
    'conspiracy',
    'chase',
    'agent',
    'secret',
    'mission',
    'pursuit',
    'undercover',
    'hostage',
    'cover',
    'intrigue'
  ],
  drama: [
    'conflict',
    'betrayal',
    'struggle',
    'sacrifice',
    'redemption',
    'emotional',
    'tragedy',
    'crisis',
    'family',
    'relationship'
  ],
  comedy: ['funny', 'humor', 'wit', 'satire', 'irony', 'comic', 'absurd', 'quirky', 'laugh', 'joke']
}

const TOPIC_NAMES = Object.keys(TOPIC_KEYWORDS)

function buildTopicVector(text) {
  const lower = text.toLowerCase()
  return TOPIC_NAMES.map((topic) => {
    const kw = TOPIC_KEYWORDS[topic]
    let count = 0
    for (const word of kw) {
      const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const matches = lower.match(re)
      if (matches) count += matches.length
    }
    return count
  })
}

function makeScene(id, topic, sceneNumber) {
  const kw = TOPIC_KEYWORDS[topic]
  const summary =
    `Scene ${sceneNumber}: ${kw.slice(0, 5).join(' ')} - ` +
    `the ${topic} narrative unfolds with ${kw.slice(5, 10).join(' and ')}.`
  const prose =
    `This is the prose for scene ${sceneNumber} of the ${topic} storyline. ` +
    kw.map((w) => `The ${w} was central to the ${topic} plot.`).join(' ') +
    ` The ${topic} narrative continues with dramatic intensity.`
  return {
    id: `scene-${id}`,
    sceneNumber,
    title: `The ${topic} Scene ${sceneNumber}`,
    summary,
    prose,
    emotionalGoal: topic,
    whatChanges: `The ${topic} plot advances through key events`,
    characters:
      topic === 'fantasy'
        ? ['Eldrin', 'Lyra']
        : topic === 'mystery'
          ? ['Holmes', 'Watson']
          : topic === 'romance'
            ? ['Romeo', 'Juliet']
            : topic === 'sciFi'
              ? ['Nova', 'Orion']
              : topic === 'historical'
                ? ['Caesar', 'Cleopatra']
                : topic === 'horror'
                  ? ['Dracula', 'VanHelsing']
                  : topic === 'adventure'
                    ? ['Indy', 'Marion']
                    : topic === 'thriller'
                      ? ['Bond', 'M']
                      : topic === 'drama'
                        ? ['Hamlet', 'Ophelia']
                        : ['Chaplin', 'Keaton'],
    charactersPresent:
      topic === 'fantasy'
        ? ['Eldrin', 'Lyra']
        : topic === 'mystery'
          ? ['Holmes', 'Watson']
          : topic === 'romance'
            ? ['Romeo', 'Juliet']
            : topic === 'sciFi'
              ? ['Nova', 'Orion']
              : topic === 'historical'
                ? ['Caesar', 'Cleopatra']
                : topic === 'horror'
                  ? ['Dracula', 'VanHelsing']
                  : topic === 'adventure'
                    ? ['Indy', 'Marion']
                    : topic === 'thriller'
                      ? ['Bond', 'M']
                      : topic === 'drama'
                        ? ['Hamlet', 'Ophelia']
                        : ['Chaplin', 'Keaton'],
    location:
      topic === 'fantasy'
        ? 'Enchanted Forest'
        : topic === 'mystery'
          ? 'Dark Alley'
          : topic === 'romance'
            ? 'Verona Balcony'
            : topic === 'sciFi'
              ? 'Starship Orion'
              : topic === 'historical'
                ? 'Roman Senate'
                : topic === 'horror'
                  ? 'Castle Transylvania'
                  : topic === 'adventure'
                    ? 'Lost Temple'
                    : topic === 'thriller'
                      ? 'Secret Bunker'
                      : topic === 'drama'
                        ? 'Royal Court'
                        : 'Vaudeville Theater',
    keyFacts: [`The ${topic} plot progresses.`]
  }
}

function makeCurrentScene(topic) {
  return {
    title:
      topic === 'fantasy'
        ? 'The Magic Spell in the Enchanted Kingdom'
        : topic === 'mystery'
          ? 'The Detective Clue in the Dark Alley'
          : topic === 'romance'
            ? 'The Love Story of Passion and Romance'
            : topic === 'sciFi'
              ? 'The Space Robot and Alien Technology'
              : 'The Default Scene',
    emotionalGoal: topic,
    whatChanges: `The ${topic} narrative advances with key revelations`,
    charactersPresent: TOPIC_KEYWORDS[topic].slice(0, 2),
    characters: TOPIC_KEYWORDS[topic].slice(0, 2),
    location:
      topic === 'fantasy'
        ? 'Enchanted Forest'
        : topic === 'mystery'
          ? 'Dark Alley'
          : topic === 'romance'
            ? 'Verona Balcony'
            : topic === 'sciFi'
              ? 'Starship Orion'
              : topic === 'historical'
                ? 'Roman Senate'
                : topic === 'horror'
                  ? 'Castle Transylvania'
                  : topic === 'adventure'
                    ? 'Lost Temple'
                    : topic === 'thriller'
                      ? 'Secret Bunker'
                      : topic === 'drama'
                        ? 'Royal Court'
                        : 'Vaudeville Theater',
    prose: `The ${topic} narrative continues.`,
    summary: `${TOPIC_KEYWORDS[topic].slice(0, 6).join(' ')} - the ${topic} storyline advances.`
  }
}

const SCENES_PER_TOPIC = 5
void TOPIC_NAMES.length * SCENES_PER_TOPIC // 50

describe('Production Scene-Retrieval Evaluation', () => {
  beforeAll(() => {
    getEmbedding.mockImplementation(async (text) => buildTopicVector(text))
  })

  describe('selectRelevantPriorScenes', () => {
    it('selects scenes sharing characters with the current scene', () => {
      const candidates = [
        {
          sceneNumber: 1,
          title: 'S1',
          characters: ['Eldrin', 'Lyra'],
          location: 'Forest',
          prose: '.',
          summary: '.'
        },
        {
          sceneNumber: 2,
          title: 'S2',
          characters: ['Gandalf', 'Frodo'],
          location: 'Shire',
          prose: '.',
          summary: '.'
        },
        {
          sceneNumber: 3,
          title: 'S3',
          characters: ['Eldrin'],
          location: 'Castle',
          prose: '.',
          summary: '.'
        }
      ]
      const current = { charactersPresent: ['Eldrin'], characters: ['Eldrin'], location: 'Forest' }
      const result = selectRelevantPriorScenes(current, candidates, 2)
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.sceneNumber)).toContain(1)
      expect(result.map((r) => r.sceneNumber)).toContain(3)
    })

    it('ranks by shared character count then location', () => {
      const candidates = [
        {
          sceneNumber: 1,
          title: 'S1',
          characters: ['Eldrin'],
          location: 'Swamp',
          prose: '.',
          summary: '.'
        },
        {
          sceneNumber: 2,
          title: 'S2',
          characters: ['Eldrin', 'Lyra'],
          location: 'Forest',
          prose: '.',
          summary: '.'
        }
      ]
      const current = {
        charactersPresent: ['Eldrin', 'Lyra'],
        characters: ['Eldrin', 'Lyra'],
        location: 'Forest'
      }
      const result = selectRelevantPriorScenes(current, candidates, 2)
      expect(result[0].sceneNumber).toBe(2)
      expect(result[1].sceneNumber).toBe(1)
    })

    it('returns empty for no character or location overlap', () => {
      const candidates = [
        {
          sceneNumber: 1,
          title: 'S1',
          characters: ['Frodo'],
          location: 'Shire',
          prose: '.',
          summary: '.'
        }
      ]
      const current = { charactersPresent: ['Eldrin'], characters: ['Eldrin'], location: 'Forest' }
      expect(selectRelevantPriorScenes(current, candidates, 2)).toHaveLength(0)
    })

    it('handles empty candidates', () => {
      expect(selectRelevantPriorScenes({ charactersPresent: ['Eldrin'] }, [], 2)).toHaveLength(0)
    })
  })

  describe('buildEmbeddingContext (prose-excerpt path, ≤25 scenes)', () => {
    it('returns empty string for empty prior scenes', () => {
      expect(buildEmbeddingContext({}, [])).toBe('')
    })

    it('includes preceding scene prose excerpt', () => {
      const prior = [
        { sceneNumber: 1, title: 'Scene One', prose: 'A'.repeat(100), summary: 'Summary' }
      ]
      const result = buildEmbeddingContext({}, prior)
      expect(result).toContain('Scene One')
      expect(result).toContain('AAA')
    })

    it('includes selected relevant older scenes', () => {
      const prior = Array.from({ length: 10 }, (_, i) => ({
        sceneNumber: i + 1,
        title: `Scene ${i + 1}`,
        prose: 'Some prose content here.',
        summary: 'A summary of what happened.',
        characters: i < 4 ? ['Eldrin'] : ['Frodo'],
        charactersPresent: i < 4 ? ['Eldrin'] : ['Frodo'],
        location: i < 4 ? 'Forest' : 'Shire'
      }))
      const current = { charactersPresent: ['Eldrin'], characters: ['Eldrin'], location: 'Forest' }
      const result = buildEmbeddingContext(current, prior)
      expect(result).toContain('[Earlier related scenes]')
      expect(result).toContain('Scene 1')
    })
  })

  describe('buildRetrievalContext (embedding path, >25 scenes)', () => {
    let allScenes
    let currentScene

    beforeAll(() => {
      allScenes = []
      let id = 0
      for (const topic of TOPIC_NAMES) {
        for (let j = 0; j < SCENES_PER_TOPIC; j++) {
          allScenes.push(makeScene(id++, topic, allScenes.length + 1))
        }
      }
      currentScene = makeCurrentScene('fantasy')
    })

    it('returns context for >25 prior scenes with embedding retrieval', async () => {
      const result = await buildRetrievalContext(currentScene, allScenes, 5)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain('[Semantically related earlier scenes]')
    })

    it('retrieves predominantly fantasy scenes when current scene is fantasy', async () => {
      const result = await buildRetrievalContext(currentScene, allScenes, 5)
      const citedSceneNums = []
      for (const line of result.split('\n')) {
        const m = line.match(/Scene (\d+)/)
        if (m) citedSceneNums.push(parseInt(m[1]))
      }
      void new Set(Array.from({ length: SCENES_PER_TOPIC }, (_, i) => i + 1))
      const topicCounts = {}
      for (const topic of TOPIC_NAMES) {
        const start = TOPIC_NAMES.indexOf(topic) * SCENES_PER_TOPIC + 1
        const nums = new Set(Array.from({ length: SCENES_PER_TOPIC }, (_, i) => start + i))
        topicCounts[topic] = citedSceneNums.filter((n) => nums.has(n)).length
      }
      const maxOther = Math.max(
        ...Object.entries(topicCounts)
          .filter(([k]) => k !== 'fantasy')
          .map(([, v]) => v)
      )
      expect(topicCounts.fantasy).toBeGreaterThanOrEqual(maxOther)
    })

    it('falls back to buildEmbeddingContext when getEmbedding returns null', async () => {
      getEmbedding.mockImplementation(async () => null)
      const result = await buildRetrievalContext({ title: 'Test' }, allScenes, 5)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      getEmbedding.mockImplementation(async (text) => buildTopicVector(text))
    })
  })

  describe('scene-retrieval metrics', () => {
    it('computeAll scores correctly for scene retrieval results', () => {
      const results = [
        { id: 'scene-fantasy-0' },
        { id: 'scene-mystery-0' },
        { id: 'scene-fantasy-1' },
        { id: 'scene-romance-0' }
      ]
      const metrics = computeAll(results, ['scene-fantasy-0', 'scene-fantasy-1'], { k: 4 })
      expect(metrics.hitRate).toBe(1)
      expect(metrics.mrr).toBe(1)
      expect(metrics.map).toBeGreaterThan(0)
      expect(metrics.ndcg).toBeGreaterThan(0)
      expect(metrics.recall).toBe(1)
      expect(metrics.precision).toBeGreaterThan(0)
    })

    it('penalizes late retrieval with lower MRR', () => {
      const results = [
        { id: 'scene-mystery-0' },
        { id: 'scene-romance-0' },
        { id: 'scene-fantasy-0' }
      ]
      const metrics = computeAll(results, ['scene-fantasy-0'], { k: 3 })
      expect(metrics.mrr).toBeCloseTo(1 / 3, 3)
    })
  })
})
