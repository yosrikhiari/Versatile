import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * WHATIF-AND-IMPORT-PLAN.md step 3, over the real schema, stores and bible
 * sync; only the model is replaced. An imported book must end up with what a
 * generated book has: digests marked `ok` with facts and chapter numbers,
 * characters (one per person, with aliases), places, and network edges
 * stamped with the chapter they start in.
 */

// What "the model" reads in each scene, keyed by a word in the scene.
const READINGS = {
  Arrival: {
    summary: 'Holmes meets Watson at Baker Street.',
    pov: 'Watson',
    location: 'Baker Street',
    characters: [
      { name: 'Sherlock Holmes', role: 'detective', description: 'A consulting detective.' },
      { name: 'Watson', role: 'narrator', description: 'An army doctor.' }
    ],
    places: [{ name: 'Baker Street', type: 'street', description: 'Where they lodge.' }],
    keyFacts: ['Watson lodges with Holmes at Baker Street.'],
    relationships: [{ from: 'Holmes', to: 'Watson', label: 'friend of' }]
  },
  Letter: {
    summary: 'Mr. Holmes reads a letter from Irene Adler.',
    pov: 'Watson',
    location: 'Baker Street',
    characters: [
      { name: 'Mr. Holmes', role: 'detective' },
      { name: 'Dr. Watson', role: 'narrator' },
      { name: 'Irene Adler', role: 'singer', description: 'The woman.' }
    ],
    places: [{ name: 'Baker Street' }],
    keyFacts: ['Irene Adler has the photograph.'],
    relationships: [{ from: 'Irene Adler', to: 'Holmes', label: 'outwits' }]
  },
  Church: {
    summary: 'Holmes witnesses Irene Adler’s wedding.',
    pov: 'Watson',
    location: 'St. Monica',
    characters: [
      { name: 'Holmes', role: 'detective' },
      { name: 'Irene Adler', role: 'bride' },
      { name: 'Godfrey Norton', role: 'groom' }
    ],
    places: [{ name: 'St. Monica', type: 'church' }],
    keyFacts: ['Irene Adler is married to Godfrey Norton.'],
    relationships: [{ from: 'Irene Adler', to: 'Godfrey Norton', label: 'married to' }]
  }
}

const aiGenerateJson = vi.fn(async (prompt) => {
  if (prompt.includes('Describe this book')) {
    return {
      genre: 'detective',
      tone: 'wry',
      premise: 'A detective takes a case.',
      centralConflict: 'Holmes against Irene Adler.',
      themes: ['wit'],
      setting: 'London, 1880s.'
    }
  }
  const key = Object.keys(READINGS).find((k) => prompt.includes(k))
  return READINGS[key]
})
vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...a) => aiGenerateJson(...a),
  aiChoiceProbabilities: vi.fn(async () => null)
}))
vi.mock('@/services/providerGate', async (orig) => ({
  ...(await orig()),
  awaitForegroundIdle: async () => {}
}))
vi.mock('@/services/storyVectorIndex', () => ({ indexProject: vi.fn(async () => 0) }))

let db

beforeEach(async () => {
  setActivePinia(createPinia())
  aiGenerateJson.mockClear()
  db = (await import('@/services/db-core')).db
  for (const t of [
    'projects',
    'manuscripts',
    'sections',
    'subsections',
    'branches',
    'volumes',
    'characters',
    'locations',
    'plotThreads',
    'graphEdges',
    'sceneDigests',
    'chapterDigests',
    'entityStates',
    'analysisQueue'
  ]) {
    await db[t].clear()
  }
})

async function importAndOpen() {
  const { decodeFile } = await import('@/services/import/decoders')
  const { detectStructure } = await import('@/services/import/structure')
  const { createProjectFromBook } = await import('@/services/import/writeProject')
  const md = [
    '## One',
    'Arrival. They met.',
    '***',
    'Letter. It came.',
    '## Two',
    'Church. She married.'
  ].join('\n\n')
  const d = await decodeFile('scandal.md', new TextEncoder().encode(md).buffer)
  const { projectId } = await createProjectFromBook(detectStructure(d.blocks), { name: 'Scandal' })
  const { useManuscriptStore } = await import('@/stores/manuscriptStore')
  const { useProjectStore } = await import('@/stores/projectStore')
  await useProjectStore().loadProject(projectId)
  await useManuscriptStore().loadManuscript(projectId)
  return projectId
}

describe('useBookAnalysis', () => {
  it('fills the bible, links the network by chapter, and writes ok digests', async () => {
    const pid = await importAndOpen()
    const { useBookAnalysis } = await import('@/composables/useBookAnalysis')
    const summary = await useBookAnalysis().run(pid)

    const chars = await db.characters.where('projectId').equals(pid).toArray()
    const names = chars.map((c) => c.name).sort()
    // One Holmes (not "Holmes" + "Mr. Holmes" + "Sherlock Holmes"); Godfrey
    // Norton is named in one scene only, so he is cast but not in the bible.
    expect(names).toEqual(['Irene Adler', 'Sherlock Holmes', 'Watson'])
    expect(chars.find((c) => c.name === 'Sherlock Holmes').aliases.sort()).toEqual([
      'Holmes',
      'Mr. Holmes'
    ])
    const locs = (await db.locations.where('projectId').equals(pid).toArray()).map((l) => l.name)
    expect(locs.sort()).toEqual(['Baker Street', 'St. Monica'])

    const edges = await db.graphEdges.where('projectId').equals(pid).toArray()
    const byName = new Map(chars.map((c) => [String(c.id), c.name]))
    const described = edges.map((e) => [
      byName.get(e.sourceId),
      e.relationshipType,
      byName.get(e.targetId),
      e.validFromChapter
    ])
    expect(described).toEqual(
      expect.arrayContaining([
        ['Sherlock Holmes', 'friends with', 'Watson', 1],
        ['Irene Adler', 'outwits', 'Sherlock Holmes', 1]
      ])
    )

    const digests = await db.sceneDigests.where('projectId').equals(pid).toArray()
    expect(digests).toHaveLength(3)
    expect(digests.every((d) => d.metadataStatus === 'ok' && d.summary && d.keyFacts.length)).toBe(
      true
    )
    const church = digests.find((d) => d.summary.includes('wedding'))
    expect(church.chapterNumber).toBe(2)
    expect(church.charactersPresent).toEqual(['Sherlock Holmes', 'Irene Adler', 'Godfrey Norton'])
    expect(await db.chapterDigests.where('projectId').equals(pid).count()).toBe(2)

    const subs = await db.subsections.where('projectId').equals(pid).toArray()
    expect(subs.every((s) => s.summary)).toBe(true)
    const project = await db.projects.get(pid)
    expect(project.storyProfile.genre).toBe('detective')
    expect(project.genre).toBe('detective')
    expect(project.analysis.status).toBe('done')
    expect(summary).toMatchObject({ scenes: 3, characters: 3, locations: 2 })
  })

  it('resumes after a stop without reading a scene twice', async () => {
    const pid = await importAndOpen()
    const { useBookAnalysis, bookAnalysisState } = await import('@/composables/useBookAnalysis')
    const analysis = useBookAnalysis()
    // Stop as soon as the first scene has been read.
    aiGenerateJson.mockImplementationOnce(async (prompt) => {
      const key = Object.keys(READINGS).find((k) => prompt.includes(k))
      analysis.stop()
      return READINGS[key]
    })
    expect(await analysis.run(pid)).toBeNull()
    expect(bookAnalysisState.phase).toBe('stopped')
    const firstCalls = aiGenerateJson.mock.calls.length

    aiGenerateJson.mockClear()
    await analysis.run(pid)
    const scenePrompts = aiGenerateJson.mock.calls.filter(
      (c) => !c[0].includes('Describe this book')
    )
    // Three scenes in all: whatever the first run finished is not read again.
    expect(firstCalls + scenePrompts.length).toBe(3)
    expect(bookAnalysisState.phase).toBe('done')
  })
})
