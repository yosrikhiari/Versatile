import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `expandCast` is the pass that fixes a story's cast being frozen at whatever
 * the synopsis alone produced. It runs once the chapter skeleton exists, so it
 * can add the antagonist the midpoint needs and the subplot the ending pays off
 * — and it must do that WITHOUT touching anything already established.
 */

const mockAiGenerateJson = vi.fn()
vi.mock('@/composables/useAiService', () => ({
  aiStream: vi.fn(),
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' }
}))

vi.mock('@/services/ai/aiHelpers', () => ({
  sanitizeJson: (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
}))

let bible
// The real store appends the inserted rows, and cast expansion depends on that:
// a faction's members are resolved against the bible AFTER the new characters
// land, so "The Shadow Court" can hold someone invented in the same response.
const addCharactersBatchData = vi.fn(async (_pid, rows) => {
  const ids = rows.map((_r, i) => `char-id-${i}`)
  rows.forEach((r, i) => bible.characters.push({ ...r, id: ids[i] }))
  return ids
})
const addLocationsBatchData = vi.fn(async (_pid, rows) => {
  const ids = rows.map((_r, i) => `loc-id-${i}`)
  rows.forEach((r, i) => bible.locations.push({ ...r, id: ids[i] }))
  return ids
})
const addPlotThreadsBatchData = vi.fn(async (_pid, rows) => {
  const ids = rows.map((_r, i) => `thread-id-${i}`)
  rows.forEach((r, i) => bible.plotThreads.push({ ...r, id: ids[i] }))
  return ids
})
const assignEntityToVolume = vi.fn(async () => {})

vi.mock('@/stores/storyBibleStore', () => ({
  useStoryBibleStore: () => ({
    get characters() {
      return bible.characters
    },
    get locations() {
      return bible.locations
    },
    get plotThreads() {
      return bible.plotThreads
    },
    addCharactersBatchData,
    addLocationsBatchData,
    addPlotThreadsBatchData,
    updateCharacterData: vi.fn(),
    updateLocationData: vi.fn(),
    updatePlotThreadData: vi.fn()
  })
}))

vi.mock('@/stores/volumeStoryNetworkStore', () => ({
  useVolumeStoryNetworkStore: () => ({ assignEntityToVolume })
}))

const ensureNodeInstances = vi.fn(async () => 0)
let savedGroups
let savedParents
const loadGroups = vi.fn(async () => savedGroups)
const loadNodeParents = vi.fn(async () => savedParents)
const saveGroups = vi.fn(async (_pid, groups) => {
  savedGroups = groups
})
const saveNodeParents = vi.fn(async (_pid, parents) => {
  savedParents = parents
})
vi.mock('@/stores/storyGraphStore', () => ({
  useStoryGraphStore: () => ({
    ensureNodeInstances,
    loadGroups,
    loadNodeParents,
    saveGroups,
    saveNodeParents
  })
}))

let expandCast

// A ten-chapter novel targets 8 characters / 6 locations / 4 threads.
//
// The fixture cast below is 3/2/1 — the old flat floors, i.e. exactly what an
// existing project looks like when it first runs the new code — so the gap here
// is 5/4/3. A fresh run bootstraps to 5/4/3 first and leaves a gap of 3/2/1;
// that split is covered by its own case at the bottom.
const SCOPE = { chapters: 10 }
const ARC = [
  { chapterNumber: 1, title: 'The Fall', goal: 'Betrayed in battle', hookEnding: 'left for dead' },
  { chapterNumber: 2, title: 'Descent', goal: 'Despair', hookEnding: 'a voice in the dark' },
  { chapterNumber: 3, title: 'Awakening', goal: 'Power stirs', hookEnding: 'the seal breaks' }
]

function openingCast() {
  return {
    characters: [
      { id: 'c1', name: 'Kael' },
      { id: 'c2', name: 'Riven' },
      { id: 'c3', name: 'Sera' }
    ],
    locations: [
      { id: 'l1', name: 'The Void' },
      { id: 'l2', name: 'Ashfall Keep' }
    ],
    plotThreads: [{ id: 't1', title: 'The Betrayal' }]
  }
}

const expansionResponse = {
  characters: [{ name: 'Vex Mourn', role: 'Antagonist', notes: 'Enters ch3' }],
  locations: [{ name: 'The Sealed Gate', description: 'Where the seal breaks' }],
  plotThreads: [{ title: 'The Sealed Power', notes: 'Pays off in the finale' }]
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  bible = openingCast()
  savedGroups = []
  savedParents = {}
  const mod = await import('@/composables/useEntityBootstrapper')
  expandCast = mod.useEntityBootstrapper().expandCast
})

const run = (overrides = {}) =>
  expandCast({
    synopsis: 'A fallen knight claws back from the void.',
    projectId: 'p1',
    volumeId: 'v1',
    chapters: ARC,
    storyArc: { centralConflict: 'Knight vs the one who betrayed him' },
    scope: SCOPE,
    ...overrides
  })

describe('expandCast', () => {
  it('commits the new cast to the bible and the volume network', async () => {
    mockAiGenerateJson.mockResolvedValue(expansionResponse)

    const result = await run()

    expect(result.added).toBe(3)
    expect(addCharactersBatchData).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ name: 'Vex Mourn', generationStatus: 'generated' })
    ])
    expect(addLocationsBatchData).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ name: 'The Sealed Gate' })
    ])
    expect(addPlotThreadsBatchData).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ title: 'The Sealed Power' })
    ])

    // Story Network membership — without this the new cast has no edges and the
    // Network view shows the same three characters it always did.
    expect(assignEntityToVolume).toHaveBeenCalledWith('character', 'char-id-0', 'v1', false)
    expect(assignEntityToVolume).toHaveBeenCalledWith('location', 'loc-id-0', 'v1', false)
    expect(assignEntityToVolume).toHaveBeenCalledWith('plotThread', 'thread-id-0', 'v1', false)
  })

  // The canvas renders only entities that have a node instance. Skip this and a
  // generated character is in the bible, in the volume, in every prompt — and
  // absent from the Story Network view, which is where you'd look for it.
  it('puts every new entity on the network canvas', async () => {
    mockAiGenerateJson.mockResolvedValue(expansionResponse)
    await run()

    expect(ensureNodeInstances).toHaveBeenCalledWith('p1', [
      'char-char-id-0',
      'loc-loc-id-0',
      'thread-thread-id-0'
    ])
  })

  it('does not fail the run when the canvas write fails', async () => {
    mockAiGenerateJson.mockResolvedValue(expansionResponse)
    ensureNodeInstances.mockRejectedValueOnce(new Error('canvas unavailable'))

    const result = await run()
    expect(result.added).toBe(3) // entities still committed to the bible
  })

  it('gives the model the arc and the existing cast so it can only add', async () => {
    mockAiGenerateJson.mockResolvedValue(expansionResponse)
    await run()

    const [userPrompt, systemPrompt] = mockAiGenerateJson.mock.calls[0]
    expect(userPrompt).toContain('The Fall')
    expect(userPrompt).toContain('left for dead') // hooks, not just titles
    expect(userPrompt).toContain('Knight vs the one who betrayed him')
    expect(userPrompt).toContain('Kael, Riven, Sera')
    expect(userPrompt).toContain(
      'AT MOST 5 new character(s), 4 new location(s) and 3 new plot thread(s)'
    )
    expect(systemPrompt).toMatch(/do not already exist/i)
  })

  // Enrichment is `bootstrapEntities`' job. If a cast-expansion response could
  // overwrite an existing character, canon would drift every time it ran.
  it('drops anything that collides with the existing cast, case-insensitively', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characters: [{ name: 'kael' }, { name: 'Vex Mourn' }],
      locations: [{ name: 'THE VOID' }],
      plotThreads: [{ title: 'the betrayal' }]
    })

    const result = await run()

    expect(result.added).toBe(1)
    expect(addCharactersBatchData).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ name: 'Vex Mourn' })
    ])
    expect(addLocationsBatchData).not.toHaveBeenCalled()
    expect(addPlotThreadsBatchData).not.toHaveBeenCalled()
  })

  it('deduplicates repeats inside a single response', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characters: [{ name: 'Vex Mourn' }, { name: '  vex mourn  ' }],
      locations: [],
      plotThreads: []
    })

    const result = await run()
    expect(result.added).toBe(1)
  })

  it('never commits more than the gap it asked for', async () => {
    mockAiGenerateJson.mockResolvedValue({
      // Model ignores the cap and returns eight characters for a gap of five.
      characters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n) => ({ name: n })),
      locations: [],
      plotThreads: []
    })

    await run()
    expect(addCharactersBatchData.mock.calls[0][1]).toHaveLength(5)
  })

  // The two-phase split: bootstrap opens with ~60% of the target, expansion
  // fills the rest against the arc. Neither call has to emit a dozen entities.
  it('asks only for the remainder when the opening cast was already scaled', async () => {
    bible.characters = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Char ${i}` }))
    bible.locations = Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, name: `Loc ${i}` }))
    bible.plotThreads = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, title: `Thread ${i}` }))
    mockAiGenerateJson.mockResolvedValue({ characters: [], locations: [], plotThreads: [] })

    await run()

    expect(mockAiGenerateJson.mock.calls[0][0]).toContain(
      'AT MOST 3 new character(s), 2 new location(s) and 1 new plot thread(s)'
    )
  })

  it('makes no call at all when the cast already meets the target', async () => {
    bible.characters = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `Char ${i}` }))
    bible.locations = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, name: `Loc ${i}` }))
    bible.plotThreads = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, title: `Thread ${i}` }))

    const result = await run()

    expect(mockAiGenerateJson).not.toHaveBeenCalled()
    expect(result.added).toBe(0)
  })

  it('asks for nothing when there is no arc to reason about', async () => {
    const result = await run({ chapters: [] })
    expect(mockAiGenerateJson).not.toHaveBeenCalled()
    expect(result.added).toBe(0)
  })

  // Runs inside the planner's idle watchdog: a throw here would kill a plan.
  it('returns empty instead of throwing when the model call fails', async () => {
    mockAiGenerateJson.mockRejectedValue(new Error('ollama exploded'))
    await expect(run()).resolves.toEqual(
      expect.objectContaining({
        added: 0,
        generatedIds: { characters: [], locations: [], plotThreads: [] }
      })
    )
  })

  it('returns empty when the response is unparseable', async () => {
    mockAiGenerateJson.mockResolvedValue(null)
    const result = await run()
    expect(result.added).toBe(0)
    expect(addCharactersBatchData).not.toHaveBeenCalled()
  })

  it('still commits the other types when one insert fails', async () => {
    mockAiGenerateJson.mockResolvedValue(expansionResponse)
    addCharactersBatchData.mockRejectedValueOnce(new Error('db locked'))

    const result = await run()

    expect(result.added).toBe(2) // location + thread survived
    expect(addLocationsBatchData).toHaveBeenCalled()
    expect(addPlotThreadsBatchData).toHaveBeenCalled()
  })

  it('reports each committed entity through onPartialData', async () => {
    mockAiGenerateJson.mockResolvedValue(expansionResponse)
    const seen = []
    await run({ onPartialData: (type, name) => seen.push(`${type}:${name}`) })

    expect(seen).toEqual([
      'expandCast:prompt-evaluation-started',
      'character:Vex Mourn',
      'location:The Sealed Gate',
      'plotThread:The Sealed Power'
    ])
  })

  // "The Shadow Court" is a body of people. With only three entity buckets it
  // used to land as a plot-thread title, or get name-dropped in prose with no
  // entity at all. The graph has always supported groups with membership.
  describe('faction groups', () => {
    const withCourt = {
      ...expansionResponse,
      groups: [
        {
          name: 'The Shadow Court',
          description: 'An ancient order that seeks to control the Void',
          members: ['Vex Mourn', 'Riven'] // one brand new, one already in the bible
        }
      ]
    }

    it('creates a group holding both new and existing members', async () => {
      mockAiGenerateJson.mockResolvedValue(withCourt)
      const result = await run()

      expect(result.groupsCreated).toBe(1)
      const court = savedGroups.find((g) => g.name === 'The Shadow Court')
      expect(court).toBeTruthy()
      // Tagged to the volume, not parented yet — the volume's box is built when
      // the run finishes, and computeVolumeGroups resolves the nesting then.
      expect(court.parentVolumeId).toBe('v1')
      expect(court.parentGroupId).toBeNull()

      expect(savedParents['char-char-id-0']).toBe(court.id) // Vex Mourn (new)
      expect(savedParents['char-c2']).toBe(court.id) // Riven (existing)
    })

    it('puts member nodes on the canvas so the group is not empty', async () => {
      mockAiGenerateJson.mockResolvedValue(withCourt)
      await run()
      expect(ensureNodeInstances).toHaveBeenCalledWith('p1', ['char-char-id-0', 'char-c2'])
    })

    // Observed live on qwen3:8b: it returns "The Shadow Court" as a group AND as
    // a plot thread in the same response, even when told not to.
    it('drops a plot thread that duplicates a group name', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [],
        locations: [],
        plotThreads: [{ title: 'The Shadow Court' }, { title: 'The Price of Power' }],
        groups: [{ name: 'The Shadow Court', members: ['Riven'] }]
      })

      await run()

      const committed = addPlotThreadsBatchData.mock.calls[0][1].map((t) => t.title)
      expect(committed).toEqual(['The Price of Power'])
    })

    // Measured live at ~2 runs in 3: the model files an organisation as a plot
    // thread with NO group counterpart, so the dedupe above has nothing to match
    // it against. Nothing downstream can recover it — the model never said who
    // is in it — so it would sit in the timeline as if it were an event.
    it('drops an organisation filed only as a plot thread', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [],
        locations: [],
        plotThreads: [
          { title: 'The Price of Power' },
          { title: "The Council's Shadow" },
          { title: 'The Shadow Court' }
        ],
        groups: []
      })

      await run()

      const committed = addPlotThreadsBatchData.mock.calls[0][1].map((t) => t.title)
      expect(committed).toEqual(['The Price of Power'])
    })

    // A mis-typed thread beats no thread at all.
    it('keeps organisation-shaped threads when dropping would empty the list', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [],
        locations: [],
        plotThreads: [{ title: 'The Shadow Court' }, { title: 'The Hollow Order' }],
        groups: []
      })

      await run()

      const committed = addPlotThreadsBatchData.mock.calls[0][1].map((t) => t.title)
      expect(committed).toEqual(['The Shadow Court', 'The Hollow Order'])
    })

    // Agreements are events, not bodies of people — these are real threads and
    // both were produced by live runs.
    it('does not mistake a pact or an accord for an organisation', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [],
        locations: [],
        plotThreads: [
          { title: 'The Forgotten Pact' },
          { title: 'The Silent Accord' },
          { title: 'The Price of Power' },
          { title: 'The Shadow Court' }
        ],
        groups: []
      })

      await run()

      const committed = addPlotThreadsBatchData.mock.calls[0][1].map((t) => t.title)
      expect(committed).toEqual(['The Forgotten Pact', 'The Silent Accord', 'The Price of Power'])
    })

    it('drops a faction whose members resolve to nobody', async () => {
      mockAiGenerateJson.mockResolvedValue({
        ...expansionResponse,
        groups: [{ name: 'The Obsidian Accord', members: ['Nobody Real', 'Also Fake'] }]
      })
      const result = await run()

      expect(result.groupsCreated).toBe(0)
      expect(savedGroups.find((g) => g.name === 'The Obsidian Accord')).toBeUndefined()
    })

    it('reuses the same group on a second pass instead of cloning it', async () => {
      mockAiGenerateJson.mockResolvedValue(withCourt)
      await run()
      const firstId = savedGroups.find((g) => g.name === 'The Shadow Court').id

      bible.characters.push({ id: 'char-id-0', name: 'Vex Mourn' })
      mockAiGenerateJson.mockResolvedValue(withCourt)
      const second = await run()

      expect(second.groupsCreated).toBe(0) // adopted, not recreated
      const courts = savedGroups.filter((g) => g.name === 'The Shadow Court')
      expect(courts).toHaveLength(1)
      expect(courts[0].id).toBe(firstId)
    })

    // A group of one is a character with extra steps. A one-shot whose cast will
    // top out at three people gets asked for locations and threads but no
    // factions.
    it('does not ask for factions when the cast will be too small to fill one', async () => {
      bible.locations = []
      bible.plotThreads = []
      mockAiGenerateJson.mockResolvedValue({ characters: [], locations: [], plotThreads: [] })

      await run({ scope: undefined }) // no scope → floors: 3 characters, already met
      const prompt = mockAiGenerateJson.mock.calls[0][0]
      expect(prompt).not.toContain('group(s)')
      expect(prompt).toContain('new location(s)') // still asked for the rest
    })

    it('does not fail the expansion when the group write fails', async () => {
      mockAiGenerateJson.mockResolvedValue(withCourt)
      saveGroups.mockRejectedValueOnce(new Error('db locked'))

      const result = await run()
      expect(result.added).toBe(3) // entities still committed
      expect(result.groupsCreated).toBe(0)
    })
  })

  it('scales the ask with the story: a one-shot gets no expansion, an epic does', async () => {
    mockAiGenerateJson.mockResolvedValue({ characters: [], locations: [], plotThreads: [] })

    // Opening cast of 3/2/1 already satisfies a scope-less (one-shot) target.
    await run({ scope: undefined })
    expect(mockAiGenerateJson).not.toHaveBeenCalled()

    await run({ scope: { chapters: 40 } })
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1)
    // Capped at 6 per call even though the 40-chapter target is 12 characters.
    expect(mockAiGenerateJson.mock.calls[0][0]).toContain('AT MOST 6 new character(s)')
  })

  // This runs inside the planner's idle watchdog, and the watchdog's only lever
  // is an abort signal. A signal that is accepted but not forwarded leaves the
  // request running on the single Ollama slot long after the stage was declared
  // dead — which is what starved the stage queued behind it.
  describe('cancellation', () => {
    it('forwards the signal to the provider call', async () => {
      mockAiGenerateJson.mockResolvedValue(expansionResponse)
      const controller = new AbortController()

      await run({ signal: controller.signal })

      expect(mockAiGenerateJson.mock.calls[0][2].signal).toBe(controller.signal)
    })

    // Everywhere else here degrades to an empty result on failure, deliberately:
    // a plan with an unexpanded cast is still a usable plan. Cancellation is the
    // exception — swallowing it would resume scene planning inside a stage that
    // has already been abandoned.
    it('throws instead of degrading to an empty result when cancelled', async () => {
      const controller = new AbortController()
      mockAiGenerateJson.mockImplementation(async () => {
        controller.abort()
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      })

      await expect(run({ signal: controller.signal })).rejects.toThrow(/cancelled/i)
      expect(addCharactersBatchData).not.toHaveBeenCalled()
    })
  })

  describe('role sanitising', () => {
    // Observed live: the prompt asks for "NEW characters" and the model echoed
    // that label into the field rather than answering with it, so the bible
    // badge read "New Character - Former Warrior".
    it('strips the prompt framing the model echoes into role', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [{ name: 'Kaelen', role: 'New Character - Former Warrior' }],
        locations: [],
        plotThreads: []
      })

      await run()

      expect(addCharactersBatchData).toHaveBeenCalledWith('p1', [
        expect.objectContaining({ name: 'Kaelen', role: 'Former Warrior' })
      ])
    })

    it('drops a role that was only the meta label', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [{ name: 'Nereus', role: 'New Character' }],
        locations: [],
        plotThreads: []
      })

      await run()

      expect(addCharactersBatchData).toHaveBeenCalledWith('p1', [
        expect.objectContaining({ name: 'Nereus', role: '' })
      ])
    })

    it('leaves a genuine role untouched', async () => {
      mockAiGenerateJson.mockResolvedValue({
        characters: [{ name: 'Dain', role: 'Former Advisor' }],
        locations: [],
        plotThreads: []
      })

      await run()

      expect(addCharactersBatchData).toHaveBeenCalledWith('p1', [
        expect.objectContaining({ name: 'Dain', role: 'Former Advisor' })
      ])
    })
  })
})

describe('makeExpansionSchema', () => {
  let makeExpansionSchema
  beforeEach(async () => {
    const mod = await import('@/composables/useEntityBootstrapper')
    makeExpansionSchema = mod.makeExpansionSchema
  })

  const need = { characters: 3, locations: 2, plotThreads: 1, groups: 1 }

  it('requires the fields the bible card actually renders', () => {
    // The prompt documents an eight-field CHARACTER format, but the grammar
    // required only `name` — so one call produced fully-formed characters
    // beside ones carrying nothing but a name and two traits.
    const char = makeExpansionSchema(need).properties.characters.items
    expect(char.required).toEqual(['name', 'role', 'description', 'notes', 'traits'])
    expect(char.properties.traits.minItems).toBe(1)
  })

  it('leaves the costly optional fields optional', () => {
    // Every required field is more tokens on a slow local model, and a missing
    // quote degrades the card far more gracefully than a missing description.
    const char = makeExpansionSchema(need).properties.characters.items
    for (const field of ['goal', 'voice', 'sampleDialogue']) {
      expect(char.properties[field]).toBeDefined()
      expect(char.required).not.toContain(field)
    }
  })

  it('names only fields it actually defines', () => {
    const schema = makeExpansionSchema(need)
    for (const [, def] of Object.entries(schema.properties)) {
      for (const field of def.items?.required || []) {
        expect(def.items.properties[field]).toBeDefined()
      }
    }
  })

  it('still caps each array at what the arc asked for', () => {
    const schema = makeExpansionSchema(need)
    expect(schema.properties.characters.maxItems).toBe(3)
    expect(schema.properties.locations.maxItems).toBe(2)
    expect(schema.properties.plotThreads.maxItems).toBe(1)
    expect(schema.properties.groups.maxItems).toBe(1)
  })
})

describe('cleanRole', () => {
  let cleanRole
  beforeEach(async () => {
    const mod = await import('@/composables/useEntityBootstrapper')
    cleanRole = mod.cleanRole
  })

  it('strips the separator variants a model reaches for', () => {
    expect(cleanRole('New Character - Former Warrior')).toBe('Former Warrior')
    expect(cleanRole('New Character: Mind Manipulator')).toBe('Mind Manipulator')
    expect(cleanRole('New Character — Harem Member/Spymaster')).toBe('Harem Member/Spymaster')
    expect(cleanRole('new entity, Rival Heir')).toBe('Rival Heir')
  })

  it('returns empty for a label that carries no role', () => {
    expect(cleanRole('New Character')).toBe('')
    expect(cleanRole('a new person')).toBe('')
  })

  it('does not eat real roles that merely start with "new"', () => {
    // "Newly Appointed Steward" is a role; the guard is anchored to the exact
    // meta labels plus a separator, not to any word starting with "new".
    expect(cleanRole('Newly Appointed Steward')).toBe('Newly Appointed Steward')
    expect(cleanRole('New Order Enforcer')).toBe('New Order Enforcer')
  })

  it('tolerates a missing or non-string role', () => {
    expect(cleanRole(undefined)).toBe('')
    expect(cleanRole(null)).toBe('')
    expect(cleanRole(42)).toBe('')
  })
})
