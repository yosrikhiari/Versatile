import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/services/db-core'
import {
  addResearchDocument,
  addResearchChunks,
  updateChunkEmbeddings,
  searchLexical,
  semanticSearch
} from '@/services/researchDb'
import { runEvaluation } from '@/evaluation/ragEvaluator'
import { computeAll } from '@/evaluation/ragMetrics'

const PROJECT_ID = 'eval-test-project'
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

function normalizeVector(vec) {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return mag === 0 ? vec.map(() => 0) : vec.map((v) => v / mag)
}

function generateChunks() {
  let chunkIndex = 0
  const all = []
  for (const topic of TOPIC_NAMES) {
    const keywords = TOPIC_KEYWORDS[topic]
    const text =
      `This text focuses on ${topic} storytelling. ` +
      keywords
        .slice(0, 5)
        .map((kw) => {
          if (topic === 'fantasy') {
            return `The ${kw} cast a powerful ${kw === 'spell' ? 'spell' : 'enchantment'} across the land.`
          }
          if (topic === 'mystery') {
            return `The ${kw} examined the ${kw === 'evidence' ? 'evidence' : 'scene'} for clues.`
          }
          if (topic === 'romance') {
            return `Their ${kw} grew stronger with each passing day.`
          }
          if (topic === 'sciFi') {
            return `The ${kw} represented the pinnacle of futuristic technology.`
          }
          if (topic === 'historical') {
            return `During the ${kw} period, great empires rose and fell.`
          }
          if (topic === 'horror') {
            return `A ${kw} figure emerged from the darkness.`
          }
          if (topic === 'adventure') {
            return `Their ${kw} took them across uncharted territories.`
          }
          if (topic === 'thriller') {
            return `The ${kw} operation proceeded with extreme caution.`
          }
          if (topic === 'drama') {
            return `The ${kw} created tension between the characters.`
          }
          if (topic === 'comedy') {
            return `His ${kw} remark lightened the mood considerably.`
          }
          return `${kw} was central to the narrative.`
        })
        .join(' ')
    const vec = normalizeVector(buildTopicVector(text))
    all.push({
      id: `chunk-${topic}-0`,
      projectId: PROJECT_ID,
      documentId: 'doc-synthetic',
      chunkIndex,
      text,
      tokenCount: text.split(/\s+/).length,
      embedding: vec,
      embeddingStatus: 'PENDING'
    })
    chunkIndex++
  }
  return all
}

const CHUNKS = generateChunks()

const TEST_QUERIES = [
  { query: 'a wizard casting a spell in a magical kingdom', targetTopic: 'fantasy' },
  { query: 'detective investigating a murder with clues and evidence', targetTopic: 'mystery' },
  { query: 'two souls falling in love with passion and devotion', targetTopic: 'romance' },
  { query: 'futuristic robot exploring space on a starship', targetTopic: 'sciFi' },
  { query: 'ancient medieval empire and its royal throne', targetTopic: 'historical' },
  { query: 'dark haunted house with a ghostly creature', targetTopic: 'horror' },
  { query: 'dangerous journey to discover hidden treasure', targetTopic: 'adventure' },
  { query: 'secret agent on a covert mission undercover', targetTopic: 'thriller' },
  { query: 'emotional conflict and betrayal in a family', targetTopic: 'drama' },
  { query: 'funny joke with humor and witty satire', targetTopic: 'comedy' }
]

async function clearDb() {
  await db.researchChunks.where({ projectId: PROJECT_ID }).delete()
  await db.researchDocuments.where({ projectId: PROJECT_ID }).delete()
}

async function seedChunks() {
  await clearDb()
  await addResearchDocument({
    id: 'doc-synthetic',
    projectId: PROJECT_ID,
    title: 'Synthetic Evaluation Document',
    type: 'text',
    importedAt: Date.now()
  })
  const ids = await addResearchChunks(CHUNKS)
  await updateChunkEmbeddings(
    CHUNKS.map((c) => ({ id: c.id, embedding: c.embedding })),
    { provider: 'synthetic', model: 'topic-vector', version: 1 }
  )
  return ids
}

describe('RAG Evaluation', () => {
  beforeAll(async () => {
    await seedChunks()
  })

  describe('ragMetrics', () => {
    it('computes hitRate = 1 when a relevant result is in top-k', () => {
      const results = [{ id: 'chunk-fantasy-0' }, { id: 'chunk-mystery-1' }]
      expect(computeAll(results, ['chunk-fantasy-0']).hitRate).toBe(1)
      expect(computeAll(results, ['chunk-fantasy-0'], { k: 1 }).hitRate).toBe(1)
    })

    it('computes hitRate = 0 when no relevant result in top-k', () => {
      const results = [{ id: 'chunk-comedy-0' }, { id: 'chunk-drama-1' }]
      expect(computeAll(results, ['chunk-fantasy-0'], { k: 2 }).hitRate).toBe(0)
    })

    it('computes MRR = 1 when first result is relevant', () => {
      const results = [{ id: 'chunk-fantasy-0' }, { id: 'chunk-mystery-1' }]
      expect(computeAll(results, ['chunk-fantasy-0']).mrr).toBe(1)
    })

    it('computes MRR correctly for rank > 1', () => {
      const results = [
        { id: 'chunk-comedy-0' },
        { id: 'chunk-fantasy-0' },
        { id: 'chunk-mystery-1' }
      ]
      expect(computeAll(results, ['chunk-fantasy-0']).mrr).toBeCloseTo(0.5, 3)
    })

    it('computes MRR = 0 when no relevant result', () => {
      const results = [{ id: 'chunk-comedy-0' }, { id: 'chunk-drama-1' }]
      expect(computeAll(results, ['chunk-fantasy-0']).mrr).toBe(0)
    })

    it('computes MAP correctly for multiple relevant docs', () => {
      const results = [
        { id: 'chunk-fantasy-0' },
        { id: 'chunk-comedy-0' },
        { id: 'chunk-mystery-1' },
        { id: 'chunk-fantasy-1' }
      ]
      const map = computeAll(results, ['chunk-fantasy-0', 'chunk-fantasy-1']).map
      expect(map).toBeGreaterThan(0)
    })

    it('computes NDCG = 1 when all top-k are relevant', () => {
      const results = [{ id: 'chunk-fantasy-0' }, { id: 'chunk-mystery-1' }]
      expect(computeAll(results, ['chunk-fantasy-0', 'chunk-mystery-1'], { k: 2 }).ndcg).toBe(1)
    })

    it('computes recall = 1 when all relevant docs retrieved', () => {
      const results = [{ id: 'chunk-fantasy-0' }, { id: 'chunk-adventure-0' }]
      expect(computeAll(results, ['chunk-fantasy-0', 'chunk-adventure-0']).recall).toBe(1)
    })

    it('handles empty results gracefully', () => {
      const metrics = computeAll([], ['chunk-fantasy-0'])
      expect(metrics.hitRate).toBe(0)
      expect(metrics.mrr).toBe(0)
      expect(metrics.map).toBe(0)
      expect(metrics.ndcg).toBe(0)
    })

    it('handles empty relevant IDs gracefully', () => {
      const results = [{ id: 'chunk-fantasy-0' }]
      const metrics = computeAll(results, [])
      expect(metrics.hitRate).toBe(0)
      expect(metrics.mrr).toBe(0)
      expect(metrics.map).toBe(0)
      expect(metrics.ndcg).toBe(0)
    })
  })

  describe('lexical search evaluation', () => {
    it('retrieves fantasy chunks for magic-related queries via lexical search', async () => {
      const q = TEST_QUERIES.find((t) => t.targetTopic === 'fantasy')
      const relevantId = `chunk-fantasy-0`
      const results = await searchLexical(PROJECT_ID, q.query, 10)
      const metrics = computeAll(results, [relevantId], { k: 5 })
      expect(metrics.hitRate).toBe(1)
      expect(metrics.mrr).toBeGreaterThan(0)
    })

    it('retrieves mystery chunks for detective-related queries via lexical search', async () => {
      const q = TEST_QUERIES.find((t) => t.targetTopic === 'mystery')
      const results = await searchLexical(PROJECT_ID, q.query, 10)
      const metrics = computeAll(results, [`chunk-mystery-0`], { k: 5 })
      expect(metrics.hitRate).toBe(1)
    })

    it('retrieves correct chunk for each topic via lexical search', async () => {
      const report = await runEvaluation({
        searchFn: (q, pid, opts) => searchLexical(pid, q, opts?.k || 20),
        testCases: TEST_QUERIES.map((tc) => ({
          query: tc.query,
          relevantChunkIds: [`chunk-${tc.targetTopic}-0`],
          label: tc.targetTopic
        })),
        projectId: PROJECT_ID,
        k: 5
      })
      expect(report.summary.passRate).toBeGreaterThanOrEqual(0.7)
      expect(report.summary.avgHitRate).toBeGreaterThanOrEqual(0.7)
      expect(report.summary.avgMrr).toBeGreaterThan(0)
    })
  })

  describe('semantic search evaluation', () => {
    it('finds fantasy chunks for magic-related queries via semantic search', async () => {
      const q = TEST_QUERIES.find((t) => t.targetTopic === 'fantasy')
      const queryVec = normalizeVector(buildTopicVector(q.query))
      const results = await semanticSearch(PROJECT_ID, queryVec, 10)
      const metrics = computeAll(results, [`chunk-fantasy-0`], { k: 5 })
      expect(metrics.hitRate).toBe(1)
      expect(metrics.mrr).toBeGreaterThan(0)
    })

    it('retrieves correct chunk for each topic via semantic search', async () => {
      let totalHits = 0
      for (const tc of TEST_QUERIES) {
        const queryVec = normalizeVector(buildTopicVector(tc.query))
        const results = await semanticSearch(PROJECT_ID, queryVec, 10)
        const metrics = computeAll(results, [`chunk-${tc.targetTopic}-0`], { k: 5 })
        if (metrics.hitRate === 1) totalHits++
      }
      const passRate = totalHits / TEST_QUERIES.length
      expect(passRate).toBeGreaterThanOrEqual(0.7)
    })

    it('outperforms random baseline (MRR > 0.1)', async () => {
      let totalMrr = 0
      for (const tc of TEST_QUERIES) {
        const queryVec = normalizeVector(buildTopicVector(tc.query))
        const results = await semanticSearch(PROJECT_ID, queryVec, 10)
        const metrics = computeAll(results, [`chunk-${tc.targetTopic}-0`], { k: 5 })
        totalMrr += metrics.mrr
      }
      const avgMrr = totalMrr / TEST_QUERIES.length
      expect(avgMrr).toBeGreaterThan(0.1)
    })
  })

  describe('topic vector integrity', () => {
    it('gives fantasy chunk highest similarity to a fantasy query', async () => {
      const q = TEST_QUERIES.find((t) => t.targetTopic === 'fantasy')
      const queryVec = normalizeVector(buildTopicVector(q.query))
      const results = await semanticSearch(PROJECT_ID, queryVec, 10)
      expect(results[0].id).toBe('chunk-fantasy-0')
    })

    it('gives sciFi chunk highest similarity to a sci-fi query', async () => {
      const q = TEST_QUERIES.find((t) => t.targetTopic === 'sciFi')
      const queryVec = normalizeVector(buildTopicVector(q.query))
      const results = await semanticSearch(PROJECT_ID, queryVec, 10)
      expect(results[0].id).toBe('chunk-sciFi-0')
    })

    it('gives horror chunk highest similarity to a horror query', async () => {
      const q = TEST_QUERIES.find((t) => t.targetTopic === 'horror')
      const queryVec = normalizeVector(buildTopicVector(q.query))
      const results = await semanticSearch(PROJECT_ID, queryVec, 10)
      expect(results[0].id).toBe('chunk-horror-0')
    })
  })
})
