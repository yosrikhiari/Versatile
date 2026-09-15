import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * End-to-end run of the volume generator with only the model boundary faked.
 *
 * Every other test of the orchestrator exercises an extracted helper; nothing
 * drove `startGeneration → confirmPlan → prose → complete` and asserted what
 * the writer and critic were actually handed. That is how the critic came to
 * be called with an empty chapter log on every scene: no assertion looked.
 *
 * The fake model answers by `schemaName`, so each stage gets a well-formed
 * reply and the run reaches `complete`. The assertions are about the prompts
 * the pipeline built along the way, not about the prose.
 */

const calls = []
/** 'kind' passes every scene; 'harsh' fails every one on pacing. */
let criticMood = 'kind'
/** 'rich' introduces an entity and an edge in scene 2; 'quiet' introduces nothing. */
let metadataMood = 'rich'

// Every sentence carries a unique running number in its middle, so no six-word
// window ever repeats — the writer's repetition guard treats repeated n-grams
// as a looping model and rejects the attempt.
const ADJ = ['rusted', 'wet', 'green', 'broken', 'silent', 'cold', 'bright']
const NOUN = ['lantern', 'chain', 'ledger', 'tarpaulin', 'gull', 'bollard', 'skiff']
const STATE = ['missing', 'moved', 'wrong', 'familiar', 'newer', 'warm', 'gone']
let proseSeed = 0
function sceneText(n) {
  const sentences = []
  for (let i = 0; i < 48; i++) {
    const k = ++proseSeed
    sentences.push(
      `Ines noted item ${k}: the ${ADJ[k % ADJ.length]} ${NOUN[(k * 3) % NOUN.length]} number ${k} at berth ${k} was ${STATE[(k * 5) % STATE.length]}.`
    )
  }
  return `<p>Scene ${n} opens. ${sentences.slice(0, 16).join(' ')}</p><p>${sentences.slice(16, 32).join(' ')}</p><p>${sentences.slice(32).join(' ')}</p>`
}

function proseFor(user) {
  const m = /Scene (\d+)/.exec(user || '')
  return sceneText(m ? m[1] : 'x')
}

function answer(user, system, opts = {}) {
  const name = opts.schemaName
  switch (name) {
    case 'chapter_skeleton':
      return {
        storyArc: {
          premise: 'A harbour inspector finds the same body twice.',
          genre: 'Thriller',
          tone: 'Bleak',
          centralConflict: 'c',
          emotionalJourney: 'e',
          resolution: 'r'
        },
        chapters: [
          {
            chapterNumber: 1,
            title: 'Low Tide',
            goal: 'Ines finds the body',
            arcPosition: 'setup',
            emotionalTarget: 'dread',
            hookEnding: 'the body is gone',
            revealed: 'the body has a second set of scars',
            stateAfter: 'Ines has signed a certificate she does not believe',
            events: ['Ines finds the body', 'Tomas names the tattoo', 'the body is gone']
          }
        ]
      }
    case 'chapter_scenes':
      return {
        scenes: [1, 2, 3].map((j) => ({
          sceneNumber: j,
          title: `Scene ${j}`,
          emotionalGoal: 'dread',
          whatChanges: `change ${j}`,
          obstacle: 'the tide',
          charactersPresent: ['Ines', 'Tomas'],
          characterWants: { Ines: 'the truth' },
          location: 'The Docks',
          setup: 'setup',
          payoff: 'none',
          sensoryAnchor: 'salt air',
          arcPosition: 'setup',
          tension: 'medium',
          pacing: 'medium'
        }))
      }
    case 'scene_metadata': {
      const m = /scene (\d+)/i.exec(user || '')
      const n = m ? m[1] : '?'
      // Scene 2 introduces someone the bible does not know and a relationship
      // between two people it does. Both must reach the bible — the writer
      // reporting them is the only way a run ever moves it.
      const introduces = metadataMood === 'rich' && n === '2'
      return {
        summary: `Ines counts bollards in scene ${n} while Tomas watches.`,
        usedEntities: {
          characterNames: introduces ? ['Ines', 'Tomas', 'Marguerite'] : ['Ines', 'Tomas'],
          locationNames: ['The Docks'],
          plotThreadTitles: []
        },
        newEntities: {
          characters: introduces
            ? [
                {
                  name: 'Marguerite',
                  role: 'harbourmaster',
                  description: 'signs what she is told to'
                }
              ]
            : [],
          locations: introduces
            ? [{ name: 'The Customs House', type: 'building', description: 'brass and damp' }]
            : [],
          plotThreads: []
        },
        networkEvents: introduces ? [{ from: 'Ines', to: 'Marguerite', label: 'distrusts' }] : [],
        keyFacts: [`Fact from scene ${n}`]
      }
    }
    case 'scene_evaluation':
      if (criticMood === 'harsh') {
        return {
          score: 6,
          pass: false,
          dimensionScores: { prose: 7, pacing: 5, dialogue: 7, continuity: 8, voice: 7 },
          issues: [{ type: 'pacing', severity: 'minor', description: 'drags in the middle' }],
          strengths: []
        }
      }
      return {
        score: 8.6,
        pass: true,
        dimensionScores: { prose: 9, pacing: 8, dialogue: 8, continuity: 9, voice: 9 },
        issues: [],
        strengths: ['tight']
      }
    case 'story_entities':
      return {
        characters: [
          {
            name: 'Ines',
            role: 'protagonist',
            description: 'inspector',
            notes: '',
            traits: ['dogged']
          },
          { name: 'Tomas', role: 'foil', description: 'dockhand', notes: '', traits: ['quiet'] }
        ],
        locations: [{ name: 'The Docks', description: 'salt and rust', notes: '', traits: [] }],
        plotThreads: [{ title: 'The second body', description: 'why twice', status: 'open' }]
      }
    case 'story_network':
      return {
        characterRelationships: [
          { from: 'Ines', to: 'Tomas', type: 'ally', description: 'uneasy' }
        ],
        characterLocations: [{ character: 'Ines', location: 'The Docks', relationship: 'works at' }]
      }
    case 'spine_entry':
      return { emotionalStateAtEnd: 'dread', keyFacts: ['the body was found'], summary: 'found' }
    case 'contradiction_report':
      return { contradictions: [] }
    case 'title_repair':
      return { titles: [] }
    case 'cast_expansion':
      return { characters: [], locations: [], plotThreads: [] }
    case 'repetition_detection':
      return { repeated: [] }
    default:
      if (opts.schema) return {}
      return proseFor(user)
  }
}

const mockAi = vi.fn(async (user, system, opts = {}) => {
  calls.push({ user: String(user || ''), system: String(system || ''), opts })
  return answer(user, system, opts)
})

vi.mock('@/services/aiService', () => ({
  aiGenerate: (user, system, opts) => mockAi(user, system, opts),
  aiStream: async (user, system, onChunk, opts) => {
    const res = await mockAi(user, system, opts)
    const text = typeof res === 'string' ? res : JSON.stringify(res)
    onChunk(text)
    return text
  },
  aiGenerateStructured: (user, system, opts) => mockAi(user, system, opts),
  resolveFeatureConfig: () => ({ provider: 'ollama', model: 'qwen3:8b' }),
  isOllamaProvider: () => true
}))
vi.mock('@/services/langfuseService', () => {
  const noop = vi.fn()
  return {
    langfuseService: {
      configure: noop,
      reset: noop,
      createTrace: noop,
      createGeneration: noop,
      endGeneration: noop,
      span: noop,
      endSpan: noop,
      score: noop,
      flush: vi.fn(async () => {})
    }
  }
})
vi.mock('@/services/embeddingService', async (importOriginal) => ({
  ...(await importOriginal()),
  getEmbedding: vi.fn(async () => new Float32Array(8)),
  getEmbeddings: vi.fn(async (texts) => texts.map(() => new Float32Array(8)))
}))
vi.mock('@/services/ollamaService', async (importOriginal) => ({
  ...(await importOriginal()),
  checkOllamaConnection: vi.fn(async () => true)
}))
vi.mock('@/services/cloudEscalation', async (importOriginal) => ({
  ...(await importOriginal()),
  canUseCloudEscalation: () => false,
  buildCloudDisclosure: vi.fn(async () => null),
  maybeAutoEscalateScene: vi.fn(async () => null)
}))
vi.mock('@/services/vectorIndexService', () => ({
  buildVectorIndex: vi.fn(async () => {}),
  searchVectorIndex: vi.fn(async () => []),
  getVectorIndexStats: vi.fn(async () => null),
  serializeVectorIndex: vi.fn(async () => ''),
  terminateVectorIndexWorker: vi.fn()
}))

let useVolumeStoryGenerator, useProjectStore, createProject, db

beforeEach(async () => {
  vi.resetModules()
  calls.length = 0
  criticMood = 'kind'
  metadataMood = 'rich'
  setActivePinia(createPinia())
  ;({ db } = await import('@/services/db-core'))
  await db.delete()
  await db.open()
  ;({ createProject } = await import('@/services/db-projects'))
  ;({ useProjectStore } = await import('@/stores/projectStore'))
  ;({ useVolumeStoryGenerator } = await import('@/composables/useVolumeStoryGenerator'))
})

async function runOneChapter({ inlineEval = false, auto = true } = {}) {
  const projectId = await createProject('Run Probe', 'Thriller', '', 1)
  const projectStore = useProjectStore()
  await projectStore.loadProject(projectId)

  const gen = useVolumeStoryGenerator()
  if (inlineEval) gen.inlineEvalEnabled.value = true
  await gen.startGeneration({
    projectId,
    synopsis: 'A harbour inspector finds the same body twice.',
    genre: 'Thriller',
    tone: 'Bleak',
    wordTarget: 900,
    auto,
    structure: { volumes: 1, chaptersPerVolume: 1, scenesPerChapter: 3, wordsPerChapter: 900 },
    onPhaseChange: () => {},
    onPartialData: () => {},
    onChunk: () => {}
  })
  if (gen.phase.value === 'plan-preview') {
    // What the plan-preview UI does on "Confirm": the plan as shown, unedited.
    await gen.confirmPlan({ projectId, editedPlan: gen.scenePlan.value, onChunk: () => {} })
  }
  return { gen, projectId }
}

describe('volume generator end-to-end run (model faked)', () => {
  it('plans, writes every scene and completes', async () => {
    const { gen } = await runOneChapter()
    expect(gen.error.value).toBeNull()
    expect(gen.phase.value).toBe('complete')
    expect(gen.writtenScenes.value.filter(Boolean)).toHaveLength(3)
    // The skeleton's progression contract survives validation: the spine and
    // the writer read these, and a re-shape used to drop every one of them.
    const ch = gen.chapterPlan.value[0]
    expect(ch.events).toEqual(['Ines finds the body', 'Tomas names the tattoo', 'the body is gone'])
    expect(ch.revealed).toBe('the body has a second set of scars')
    expect(ch.stateAfter).toBe('Ines has signed a certificate she does not believe')
    const spinePrompt = calls.find((c) => c.opts.schemaName === 'spine_entry')
    expect(spinePrompt.user).toMatch(/EVENTS IN THIS CHAPTER/)
    expect(spinePrompt.user).toMatch(/Tomas names the tattoo/)
  }, 60_000)

  it('hands the critic the chapter so far — the second scene is never judged as "first"', async () => {
    await runOneChapter()
    const critiques = calls.filter((c) => c.opts.schemaName === 'scene_evaluation')
    expect(critiques.length).toBeGreaterThanOrEqual(3)
    // The critic's prompt renders an empty log as "(First scene)". Only the
    // first scene may read that way.
    const firstSceneLogs = critiques.filter((c) => /\(First scene\)/.test(c.user))
    expect(firstSceneLogs.length).toBeLessThanOrEqual(1)
    const last = critiques.at(-1)
    expect(last.user).toMatch(/CHAPTER LOG/)
    expect(last.user).toMatch(/Scene 1/)
    expect(last.user).toMatch(/Scene 2/)
  }, 60_000)

  it('writes the second scene with the first scene in its brief', async () => {
    await runOneChapter()
    const prose = calls.filter((c) => !c.opts.schema && /Scene 3/.test(c.user))
    expect(prose.length).toBeGreaterThan(0)
    expect(prose[0].user).toMatch(/scene 1/i)
    expect(prose[0].user).toMatch(/scene 2/i)
  }, 60_000)

  it('keeps the best attempt of a scene the gate never clears, flagged for review', async () => {
    // Real critic averages sit below the gate floor on real prose, so an
    // unclearable scene is common. It used to be dropped outright — no prose,
    // an empty subsection, and every later scene drafted against the hole.
    criticMood = 'harsh'
    const { gen, projectId } = await runOneChapter()
    expect(gen.phase.value).toBe('complete')
    expect(gen.error.value).toBeNull()
    expect(gen.writtenScenes.value.filter(Boolean)).toHaveLength(3)

    const subs = await db.subsections.where('projectId').equals(projectId).toArray()
    const withProse = subs.filter((s) => (s.content || '').trim())
    expect(withProse).toHaveLength(3)
    expect(withProse.every((s) => s.contentStatus === 'review')).toBe(true)
    // The ledger still says so: every scene degraded trips the rate invariant.
    expect(gen.runHealthViolations.value.some((v) => v.code === 'degraded_rate')).toBe(true)
  }, 60_000)

  it('commits what the writer discovered to the bible and the graph', async () => {
    // The one-click path is the parallel strategy, and it never called
    // `discoverSync`/`commitSync` — only the batch (resume/review) path did.
    // A real 10-chapter run wrote 30 scenes of prose and zero bible rows, and
    // `bible_static` fired on the whole book.
    const { gen, projectId } = await runOneChapter()
    expect(gen.phase.value).toBe('complete')

    const chars = await db.characters.where('projectId').equals(projectId).toArray()
    expect(chars.map((c) => c.name)).toContain('Marguerite')
    expect(chars.find((c) => c.name === 'Marguerite').generationStatus).toBe('generated')
    const locs = await db.locations.where('projectId').equals(projectId).toArray()
    expect(locs.map((l) => l.name)).toContain('The Customs House')

    const edges = await db.graphEdges.where('projectId').equals(projectId).toArray()
    const ines = chars.find((c) => c.name === 'Ines')
    const marguerite = chars.find((c) => c.name === 'Marguerite')
    expect(
      edges.some(
        (e) =>
          String(e.sourceId) === String(ines.id) &&
          String(e.targetId) === String(marguerite.id) &&
          e.relationshipType === 'distrusts'
      )
    ).toBe(true)

    expect(gen.bibleChangesDiscovered.value).toBeGreaterThan(0)
    expect(gen.scenesSynced.value).toBe(3)
    expect(gen.runHealthViolations.value.map((v) => v.code)).not.toContain('bible_static')
  }, 60_000)

  it('outside one-click mode, holds discovered entities for review and commits on confirm', async () => {
    // One-click auto-accepts per chapter. A reviewed run collects what the
    // writer discovered and pauses once, at the end, in the batch path's
    // sync-preview; the bible grows only after the author confirms.
    const { gen, projectId } = await runOneChapter({ auto: false })
    expect(gen.phase.value).toBe('sync-preview')
    expect(gen.writtenScenes.value.filter(Boolean)).toHaveLength(3)
    const preview = gen.syncPreview.value
    expect(preview.map((c) => c.entity.name)).toEqual(
      expect.arrayContaining(['Marguerite', 'The Customs House'])
    )
    // Nothing committed yet.
    let chars = await db.characters.where('projectId').equals(projectId).toArray()
    expect(chars.map((c) => c.name)).not.toContain('Marguerite')
    expect(gen.bibleChangesDiscovered.value).toBe(0)

    await gen.confirmSync({ acceptedEntities: preview, projectId, volumeId: gen.volumeId.value })
    expect(gen.phase.value).toBe('complete')
    chars = await db.characters.where('projectId').equals(projectId).toArray()
    expect(chars.map((c) => c.name)).toContain('Marguerite')
    expect(gen.bibleChangesDiscovered.value).toBeGreaterThan(0)
    expect(gen.runHealthViolations.value.map((v) => v.code)).not.toContain('bible_static')
  }, 60_000)

  it('does not call a quiet chapter static when every scene was synced', async () => {
    // The writer reports nothing the bible does not already have: sync ran on
    // every scene and found nothing to add. That is a quiet story, not a
    // broken sync path, and the ledger must say so.
    metadataMood = 'quiet'
    const { gen } = await runOneChapter()
    expect(gen.phase.value).toBe('complete')
    expect(gen.scenesSynced.value).toBe(3)
    expect(gen.bibleChangesDiscovered.value).toBe(0)
    const codes = gen.runHealthViolations.value.map((v) => v.code)
    expect(codes).not.toContain('bible_static')
    expect(codes).not.toContain('bible_quiet')
  }, 60_000)

  it('runs every model call through the one session budget the Delegator owns', async () => {
    // The Delegator used to build its own director/writer/critic and wire the
    // budget there; the orchestrator's real instances got it only through a
    // second assignment. One instance set now: the budget the Delegator holds
    // is the budget every writer, critic and director call carries.
    const { gen } = await runOneChapter()
    expect(gen.phase.value).toBe('complete')
    const budget = gen.sessionBudget
    expect(budget).toBeTruthy()
    const budgeted = calls.filter((c) => c.opts.sessionBudget)
    expect(budgeted.length).toBeGreaterThan(0)
    expect(budgeted.every((c) => c.opts.sessionBudget === budget)).toBe(true)
    // Prose, metadata and critique all count against it — no parallel set.
    const kinds = new Set(budgeted.map((c) => c.opts.schemaName || 'prose'))
    expect(kinds.has('scene_evaluation')).toBe(true)
    expect(kinds.has('scene_metadata')).toBe(true)
    expect(kinds.has('prose')).toBe(true)
  }, 60_000)

  it('critiques each scene once, even with inline evaluation on', async () => {
    // Auto mode already critiques inside the gate; the anchor evaluation used
    // to run the critic a second time over the same prose and keep that verdict.
    const { gen } = await runOneChapter({ inlineEval: true })
    expect(gen.phase.value).toBe('complete')
    const critiques = calls.filter((c) => c.opts.schemaName === 'scene_evaluation')
    expect(critiques).toHaveLength(3)
  }, 60_000)
})
