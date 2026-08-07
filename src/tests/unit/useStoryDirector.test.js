import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative',
  getActivePrompts: vi.fn(() => ({
    director: 'You are a story architect planning a narrative arc. Keep JSON output only.'
  })),
  promptOverrides: { writer: '', critic: '', revisor: '', director: '' }
}
const mockAiStream = vi.fn(async (user, system, onChunk, opts) => {
  try {
    const res = await mockAiGenerate(user, system, opts)
    onChunk(res)
  } catch (err) {
    throw err
  }
})

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args),
  aiGenerateStructured: async (...args) => {
    const r = await mockAiGenerate(...args)
    if (r && typeof r === 'object') return r
    const cleaned = String(r)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('structured parse failed')
    return JSON.parse(m[0])
  }
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDER_DEFAULT: 'ollama',
  PROVIDERS: { OLLAMA: 'ollama' },
  FEATURE_DEFAULTS: { story_generation: { provider: 'ollama', model: null } },
  EMBEDDING_DEFAULTS: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    threshold: 0.75,
    batchSize: 32
  },
  EMBEDDING_PROVIDERS: { OLLAMA: 'ollama' }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: {
    creative: {
      director: 'You are a story architect planning a narrative arc. Keep JSON output only.'
    },
    academic: {
      director: 'You are planning an academic document.'
    }
  }
}))

let useStoryDirector, sanitizeJson
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useStoryDirector')
  useStoryDirector = mod.useStoryDirector
  sanitizeJson = mod.sanitizeJson
})

function makeValidResponse() {
  return JSON.stringify({
    chapters: [
      {
        chapterNumber: 1,
        title: 'Chapter 1',
        goal: 'Goal',
        arcPosition: 'opening',
        emotionalTarget: 'Hope',
        hookEnding: 'Hook',
        estimatedWords: 5000,
        scenes: [
          {
            sceneNumber: 1,
            title: 'Opening',
            emotionalGoal: 'Hope',
            whatChanges: 'Hero begins journey',
            charactersPresent: ['John'],
            characterWants: { John: 'Find purpose' },
            setup: 'Establishes conflict',
            payoff: 'none',
            sensoryAnchor: 'Morning light',
            tension: 'medium',
            pacing: 'slow',
            arcPosition: 'setup',
            obstacle: 'obstacle',
            estimatedWords: 500
          },
          {
            sceneNumber: 2,
            title: 'Middle 1',
            arcPosition: 'obstacle',
            obstacle: 'obstacle',
            estimatedWords: 500
          },
          {
            sceneNumber: 3,
            title: 'Middle 2',
            arcPosition: 'turn',
            obstacle: 'obstacle',
            estimatedWords: 500
          },
          {
            sceneNumber: 4,
            title: 'Resolution',
            emotionalGoal: 'Relief',
            whatChanges: 'Conflict resolved',
            charactersPresent: ['John'],
            characterWants: { John: 'Find peace' },
            setup: 'Hero overcomes',
            payoff: 'Villain revealed',
            sensoryAnchor: 'Sunset',
            tension: 'low',
            pacing: 'slow',
            arcPosition: 'resolution',
            obstacle: 'obstacle',
            estimatedWords: 400
          }
        ]
      }
    ],
    storyArc: {
      premise: 'Test premise',
      genre: 'Fantasy',
      tone: 'Dark',
      emotionalJourney: 'hope to despair',
      centralConflict: 'Good vs Evil',
      resolution: 'Hero triumphs',
      totalScenes: 4
    }
  })
}

describe('useStoryDirector', () => {
  describe('sanitizeJson', () => {
    it('parses valid JSON', () => {
      expect(sanitizeJson('{"a":1}')).toEqual({ a: 1 })
    })

    it('returns null for empty input', () => {
      expect(sanitizeJson('')).toBeNull()
      expect(sanitizeJson(null)).toBeNull()
    })

    it('strips markdown fences', () => {
      expect(sanitizeJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    })

    it('returns null for malformed JSON', () => {
      expect(sanitizeJson('not json')).toBeNull()
    })
  })

  describe('generateStoryPlan', () => {
    const goal = {
      premise: 'Test premise',
      genre: 'Fantasy',
      tone: 'Dark',
      wordTarget: 4000,
      horizon: 'long_term'
    }

    it('returns validated actions and storyArc', async () => {
      mockAiGenerate.mockResolvedValue(makeValidResponse())
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: 'Story bible' })
      expect(result.chapters).toHaveLength(1)
      expect(result.scenes).toHaveLength(4)
      expect(result.storyArc.premise).toBe('Test premise')
      expect(result.storyArc.genre).toBe('Fantasy')
    })

    it('plans in chunks (skeleton + per-chapter scenes) when a structure is given', async () => {
      const skeleton = JSON.stringify({
        storyArc: { premise: 'P', genre: 'Fantasy', tone: 'Dark', centralConflict: 'c' },
        chapters: [
          { chapterNumber: 1, title: 'Ch1', goal: 'g1', hookEnding: 'h1' },
          { chapterNumber: 2, title: 'Ch2', goal: 'g2', hookEnding: 'h2' }
        ]
      })
      const sceneJson = JSON.stringify({
        scenes: [
          { sceneNumber: 1, title: 'S1' },
          { sceneNumber: 2, title: 'S2' }
        ]
      })
      mockAiGenerate.mockResolvedValueOnce(skeleton).mockResolvedValue(sceneJson)

      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        structure: {
          chapters: 2,
          scenesPerChapter: 2,
          wordsPerChapter: 1000,
          chaptersPerVolume: 2,
          volumes: 1
        }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })

      expect(result.chapters).toHaveLength(2)
      expect(result.chapters.every((c) => c.scenes.length === 2)).toBe(true)
      expect(result.scenes).toHaveLength(4)
      // 1 skeleton call + 1 per chapter = 3 non-streaming calls (no giant single plan)
      expect(mockAiGenerate).toHaveBeenCalledTimes(3)
      expect(result.chapters.map((c) => c.volumeIndex)).toEqual([1, 1])
    })

    it('batches the skeleton for a long novel and plans every chapter (no giant single call)', async () => {
      // 30 chapters → ceil(30/12) = 3 skeleton batches + 30 scene calls.
      const skeleton12 = JSON.stringify({
        storyArc: { premise: 'P', genre: 'Fantasy', tone: 'Dark', centralConflict: 'c' },
        chapters: Array.from({ length: 12 }, (_, i) => ({
          chapterNumber: i + 1,
          title: `Ch${i + 1}`,
          goal: `g${i + 1}`,
          hookEnding: `h${i + 1}`
        }))
      })
      const scenesJson = JSON.stringify({
        scenes: [
          { sceneNumber: 1, title: 'S1' },
          { sceneNumber: 2, title: 'S2' }
        ]
      })
      mockAiGenerate.mockImplementation((prompt) =>
        /chapter skeleton/i.test(prompt) ? skeleton12 : scenesJson
      )

      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        horizon: 'long_term',
        structure: {
          chapters: 30,
          scenesPerChapter: 2,
          wordsPerChapter: 1000,
          chaptersPerVolume: 10,
          volumes: 3
        }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })

      expect(result.chapters).toHaveLength(30)
      expect(result.chapters.every((c) => c.scenes.length === 2)).toBe(true)
      expect(result.scenes).toHaveLength(60)

      const calls = mockAiGenerate.mock.calls.map((c) => c[0])
      const skeletonCalls = calls.filter((p) => /chapter skeleton/i.test(p))
      const sceneCalls = calls.filter((p) => /Plan EXACTLY/i.test(p))
      expect(skeletonCalls).toHaveLength(3) // batched, never one 30-chapter call
      expect(sceneCalls).toHaveLength(30)

      // Volumes tagged 10/10/10
      const volumeCounts = result.chapters.reduce((acc, c) => {
        acc[c.volumeIndex] = (acc[c.volumeIndex] || 0) + 1
        return acc
      }, {})
      expect(volumeCounts).toEqual({ 1: 10, 2: 10, 3: 10 })
    })

    describe('chapter title variety across batches', () => {
      // The reported failure: across 100 chapters "Echoes of Betrayal" appeared
      // eight times — roughly once per 12-chapter batch. Each batch was an
      // independent draw because nothing carried earlier titles into the prompt.
      const scenesJson = JSON.stringify({
        scenes: [
          { sceneNumber: 1, title: 'S1' },
          { sceneNumber: 2, title: 'S2' }
        ]
      })

      const skeletonOf = (titles, startAt = 1) =>
        JSON.stringify({
          storyArc: { premise: 'P', genre: 'Dark Fantasy', tone: 'Grim', centralConflict: 'c' },
          chapters: titles.map((t, i) => ({
            chapterNumber: startAt + i,
            ...t,
            goal: `g${startAt + i}`,
            hookEnding: `h${startAt + i}`
          }))
        })

      const twoBatchGoal = {
        ...goal,
        horizon: 'long_term',
        structure: {
          chapters: 24,
          scenesPerChapter: 2,
          wordsPerChapter: 1000,
          chaptersPerVolume: 12,
          volumes: 2
        }
      }

      /** Drive two skeleton batches and hand back the prompt each one received. */
      async function runTwoBatches(batch1Titles, batch2Titles) {
        let skeletonCall = 0
        const skeletonPrompts = []
        mockAiGenerate.mockImplementation((prompt) => {
          if (!/chapter skeleton/i.test(prompt)) return scenesJson
          skeletonPrompts.push(prompt)
          skeletonCall++
          return skeletonCall === 1 ? skeletonOf(batch1Titles, 1) : skeletonOf(batch2Titles, 13)
        })
        const { generateStoryPlan } = useStoryDirector()
        const result = await generateStoryPlan({ goal: twoBatchGoal, evidence: '' })
        return { skeletonPrompts, result }
      }

      const twelve = (make) => Array.from({ length: 12 }, (_, i) => make(i))

      it("carries batch 1's titles into batch 2's prompt", async () => {
        const { skeletonPrompts } = await runTwoBatches(
          twelve((i) => ({ title: `Distinctive Title ${i + 1}` })),
          twelve((i) => ({ title: `Second Batch ${i + 1}` }))
        )

        expect(skeletonPrompts).toHaveLength(2)
        // Batch 1 has no history to show; batch 2 must see all of batch 1.
        expect(skeletonPrompts[0]).toContain('No titles used yet')
        expect(skeletonPrompts[1]).toContain('Distinctive Title 1')
        expect(skeletonPrompts[1]).toContain('Distinctive Title 12')
        expect(skeletonPrompts[1]).toContain('Never reuse')
      })

      it('tells batch 2 which shape batch 1 exhausted', async () => {
        const { skeletonPrompts } = await runTwoBatches(
          // Exactly the observed failure mode: twelve "[Noun] of [Noun]" titles.
          twelve((i) => ({ title: `Echoes of Thing${i + 1}` })),
          twelve((i) => ({ title: `Second Batch ${i + 1}` }))
        )

        expect(skeletonPrompts[1]).toContain('SHAPES THAT ARE FULL')
        expect(skeletonPrompts[1]).toContain('"[Noun] of [Noun]"')
      })

      it('keeps padded titles out of the ledger', async () => {
        // Batch 1 fails entirely → twelve "Chapter N" fallbacks. Those are our
        // padding, not model output: replaying them as "already used" would ban
        // a shape on the strength of our own fallback.
        let skeletonCall = 0
        const skeletonPrompts = []
        mockAiGenerate.mockImplementation((prompt) => {
          if (!/chapter skeleton/i.test(prompt)) return scenesJson
          skeletonPrompts.push(prompt)
          skeletonCall++
          return skeletonCall === 1
            ? 'not json at all'
            : skeletonOf(
                twelve((i) => ({ title: `Real Title ${i + 1}` })),
                13
              )
        })
        const { generateStoryPlan } = useStoryDirector()
        await generateStoryPlan({ goal: twoBatchGoal, evidence: '' })

        expect(skeletonPrompts[1]).toContain('No titles used yet')
        expect(skeletonPrompts[1]).not.toContain('Chapter 1')
        expect(skeletonPrompts[1]).not.toContain('SHAPES THAT ARE FULL')
      })

      it('assembles multi-part titles from partOf and partNumber', async () => {
        const { result } = await runTwoBatches(
          twelve((i) =>
            i < 2
              ? { title: '', partOf: 'The Veil Sanctum', partNumber: i + 1 }
              : { title: `Standalone ${i + 1}` }
          ),
          twelve((i) => ({ title: `Second Batch ${i + 1}` }))
        )

        expect(result.chapters[0].title).toBe('The Veil Sanctum, Part 1')
        expect(result.chapters[1].title).toBe('The Veil Sanctum, Part 2')
        expect(result.chapters[2].title).toBe('Standalone 3')
      })

      it('widens the repetition window to span the whole batch', async () => {
        // The reported run repeated "Echoes of Betrayal" at chapters 5 and 10 of
        // ONE batch. The ledger cannot catch that — it is built once per batch —
        // and the global repeat_last_n of 512 covers under three chapters of a
        // ~2,300-token batch, so chapter 1 exerted no pressure on chapter 10.
        const { skeletonPrompts } = await runTwoBatches(
          twelve((i) => ({ title: `T${i + 1}` })),
          twelve((i) => ({ title: `U${i + 1}` }))
        )
        expect(skeletonPrompts).toHaveLength(2)

        const skeletonOpts = mockAiGenerate.mock.calls
          .filter(([prompt]) => /chapter skeleton/i.test(prompt))
          .map(([, , opts]) => opts)
        for (const opts of skeletonOpts) {
          expect(opts.repeatLastN).toBe(-1)
          expect(opts.topP).toBeGreaterThan(0.9)
          expect(opts.minP).toBeLessThan(0.05)
          // Structural fields ride this same call under a pinned schema.
          expect(opts.temperature).toBe(0.7)
        }
      })

      it('tells the batch not to repeat itself, not just earlier batches', async () => {
        const { skeletonPrompts } = await runTwoBatches(
          twelve((i) => ({ title: `T${i + 1}` })),
          twelve((i) => ({ title: `U${i + 1}` }))
        )
        // Batch 1 has no history, so the intra-batch rule is the only guard it has.
        expect(skeletonPrompts[0]).toMatch(/differ from one another/i)
      })

      it('counts a surviving duplicate onto the run-health ledger', async () => {
        // Steering is not constraining: if the model repeats anyway, that must be
        // visible rather than something the author finds at chapter 97.
        const { result } = await runTwoBatches(
          twelve((i) => ({ title: i === 9 ? 'Echoes of Betrayal' : `Unique ${i + 1}` })).map(
            (t, i) => (i === 4 ? { title: 'Echoes of Betrayal' } : t)
          ),
          twelve((i) => ({ title: `Second ${i + 1}` }))
        )
        expect(result.degradation.duplicateTitles).toBe(1)
      })

      it('reports zero duplicates for a clean plan', async () => {
        const { result } = await runTwoBatches(
          twelve((i) => ({ title: `Alpha ${i + 1}` })),
          twelve((i) => ({ title: `Beta ${i + 1}` }))
        )
        expect(result.degradation.duplicateTitles).toBe(0)
      })

      it('does not count a multi-part chapter as padding', async () => {
        // `partOf` with an empty `title` is a complete answer, not a gap.
        const { result } = await runTwoBatches(
          twelve((i) => ({ title: '', partOf: 'One Long Siege', partNumber: i + 1 })),
          twelve((i) => ({ title: `Second Batch ${i + 1}` }))
        )

        expect(result.chapters[0].title).toBe('One Long Siege, Part 1')
        expect(result.degradation.paddedChapters).toBe(0)
      })
    })

    it('degrades to a padded plan instead of throwing when the skeleton model fails', async () => {
      // Model returns unparseable output for everything → planChunked must still
      // produce the requested structure rather than aborting the whole run.
      mockAiGenerate.mockResolvedValue('not json at all')
      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        horizon: 'long_term',
        structure: {
          chapters: 6,
          scenesPerChapter: 3,
          wordsPerChapter: 1500,
          chaptersPerVolume: 3,
          volumes: 2
        }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })
      expect(result.chapters).toHaveLength(6)
      expect(result.chapters.every((c) => c.scenes.length === 3)).toBe(true)
      expect(result.chapters.map((c) => c.volumeIndex)).toEqual([1, 1, 1, 2, 2, 2])
    })

    it('pads a short skeleton batch up to the requested count', async () => {
      // Skeleton returns only 2 chapters when 5 were asked for → the missing 3 are
      // padded so the arc never loses its length to a truncated batch.
      const shortSkeleton = JSON.stringify({
        storyArc: { premise: 'P' },
        chapters: [
          { chapterNumber: 1, title: 'Real1', hookEnding: 'h1' },
          { chapterNumber: 2, title: 'Real2', hookEnding: 'h2' }
        ]
      })
      const scenesJson = JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }] })
      mockAiGenerate.mockImplementation((prompt) =>
        /chapter skeleton/i.test(prompt) ? shortSkeleton : scenesJson
      )
      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        horizon: 'long_term',
        structure: {
          chapters: 5,
          scenesPerChapter: 1,
          wordsPerChapter: 800,
          chaptersPerVolume: 5,
          volumes: 1
        }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })
      expect(result.chapters).toHaveLength(5)
      expect(result.chapters[0].title).toBe('Real1')
      expect(result.chapters[3].title).toBe('Chapter 4') // padded
    })

    describe('onSkeletonReady (arc-driven cast expansion)', () => {
      const skeleton = JSON.stringify({
        storyArc: { premise: 'P', genre: 'Fantasy', tone: 'Dark', centralConflict: 'c' },
        chapters: [
          { chapterNumber: 1, title: 'Ch1', goal: 'g1', hookEnding: 'h1' },
          { chapterNumber: 2, title: 'Ch2', goal: 'g2', hookEnding: 'h2' }
        ]
      })
      const sceneJson = JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }] })
      const structuredGoal = () => ({
        ...goal,
        horizon: 'long_term',
        structure: {
          chapters: 2,
          scenesPerChapter: 1,
          wordsPerChapter: 800,
          chaptersPerVolume: 2,
          volumes: 1
        }
      })

      beforeEach(() => {
        mockAiGenerate.mockImplementation((prompt) =>
          /chapter skeleton/i.test(prompt) ? skeleton : sceneJson
        )
      })

      // The whole point of the hook: entities must be committable at a moment when
      // the arc is known but nothing has been cast yet. One call too late and the
      // scenes are already written against the old cast.
      it('fires after the skeleton and before any scene is planned', async () => {
        let callsWhenFired = null
        let sawChapters = null
        let sawArc = null

        const { generateStoryPlan } = useStoryDirector()
        await generateStoryPlan({
          goal: structuredGoal(),
          evidence: 'ORIGINAL_EVIDENCE',
          onSkeletonReady: async ({ chapters, storyArc }) => {
            callsWhenFired = mockAiGenerate.mock.calls.length
            sawChapters = chapters.map((c) => c.title)
            sawArc = storyArc
            return null
          }
        })

        expect(callsWhenFired).toBe(1) // skeleton done, zero scene calls made
        expect(sawChapters).toEqual(['Ch1', 'Ch2'])
        expect(sawArc.centralConflict).toBe('c')
      })

      it('routes refreshed evidence into scene planning only', async () => {
        const { generateStoryPlan } = useStoryDirector()
        await generateStoryPlan({
          goal: structuredGoal(),
          evidence: 'ORIGINAL_EVIDENCE',
          onSkeletonReady: async () => 'REFRESHED_EVIDENCE'
        })

        const systemPrompts = mockAiGenerate.mock.calls.map((c) => c[1])
        expect(systemPrompts).toHaveLength(3) // 1 skeleton + 2 chapters
        expect(systemPrompts[0]).toContain('ORIGINAL_EVIDENCE')
        for (const scenePrompt of systemPrompts.slice(1)) {
          expect(scenePrompt).toContain('REFRESHED_EVIDENCE')
          expect(scenePrompt).not.toContain('ORIGINAL_EVIDENCE')
        }
        // The director prompt must survive the swap — evidence is only the tail.
        expect(systemPrompts[1]).toContain('You are a story architect')
      })

      it('keeps the original evidence when the hook adds nothing', async () => {
        const { generateStoryPlan } = useStoryDirector()
        await generateStoryPlan({
          goal: structuredGoal(),
          evidence: 'ORIGINAL_EVIDENCE',
          onSkeletonReady: async () => null
        })
        const systemPrompts = mockAiGenerate.mock.calls.map((c) => c[1])
        expect(systemPrompts.every((p) => p.includes('ORIGINAL_EVIDENCE'))).toBe(true)
      })

      // Advisory by contract: losing the new cast must not cost the user a plan
      // that otherwise succeeded.
      it('still returns a complete plan when the hook throws', async () => {
        const { generateStoryPlan } = useStoryDirector()
        const result = await generateStoryPlan({
          goal: structuredGoal(),
          evidence: 'ORIGINAL_EVIDENCE',
          onSkeletonReady: async () => {
            throw new Error('expansion exploded')
          }
        })
        expect(result.chapters).toHaveLength(2)
        expect(result.scenes).toHaveLength(2)
        const systemPrompts = mockAiGenerate.mock.calls.map((c) => c[1])
        expect(systemPrompts.every((p) => p.includes('ORIGINAL_EVIDENCE'))).toBe(true)
      })

      it('plans exactly as before when no hook is supplied', async () => {
        const { generateStoryPlan } = useStoryDirector()
        const result = await generateStoryPlan({
          goal: structuredGoal(),
          evidence: 'ORIGINAL_EVIDENCE'
        })
        expect(result.chapters).toHaveLength(2)
        expect(mockAiGenerate).toHaveBeenCalledTimes(3)
      })
    })

    // Planning runs as the `structure` stage under an idle watchdog that aborts
    // a stage it declares stuck. Until this was wired, the abort reached nothing:
    // the planner kept issuing chapter after chapter on the single Ollama slot
    // the next stage was already queued for, and the stage behind it was then
    // declared stuck for waiting on a request nobody was listening to.
    describe('cancellation', () => {
      const skeleton = JSON.stringify({
        storyArc: { premise: 'P' },
        chapters: [
          { chapterNumber: 1, title: 'Ch1', hookEnding: 'h1' },
          { chapterNumber: 2, title: 'Ch2', hookEnding: 'h2' },
          { chapterNumber: 3, title: 'Ch3', hookEnding: 'h3' },
          { chapterNumber: 4, title: 'Ch4', hookEnding: 'h4' }
        ]
      })
      const cancellableGoal = () => ({
        ...goal,
        horizon: 'long_term',
        structure: {
          chapters: 4,
          scenesPerChapter: 1,
          wordsPerChapter: 800,
          chaptersPerVolume: 4,
          volumes: 1
        }
      })

      it('forwards the signal to every planning call', async () => {
        mockAiGenerate.mockImplementation((prompt) =>
          /chapter skeleton/i.test(prompt)
            ? skeleton
            : JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }] })
        )
        const controller = new AbortController()
        const { generateStoryPlan } = useStoryDirector()
        await generateStoryPlan({
          goal: cancellableGoal(),
          evidence: '',
          signal: controller.signal
        })
        expect(mockAiGenerate.mock.calls.length).toBeGreaterThan(1)
        for (const call of mockAiGenerate.mock.calls) {
          expect(call[2].signal).toBe(controller.signal)
        }
      })

      it('stops issuing scene calls once the signal aborts', async () => {
        // The skeleton lands, then the stage is abandoned. Scene planning has
        // bounded concurrency, so the check has to be per task: without it the
        // remaining chapters are still handed to the provider one by one.
        const controller = new AbortController()
        mockAiGenerate.mockImplementation((prompt) => {
          if (/chapter skeleton/i.test(prompt)) {
            controller.abort()
            return skeleton
          }
          return JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }] })
        })
        const { generateStoryPlan } = useStoryDirector()
        await expect(
          generateStoryPlan({ goal: cancellableGoal(), evidence: '', signal: controller.signal })
        ).rejects.toThrow(/cancelled/i)
        // Only the skeleton call — no scene call was ever issued.
        expect(mockAiGenerate).toHaveBeenCalledTimes(1)
      })

      it('stops between skeleton batches rather than planning the rest of the arc', async () => {
        const controller = new AbortController()
        mockAiGenerate.mockImplementation(() => {
          controller.abort()
          return JSON.stringify({
            storyArc: { premise: 'P' },
            chapters: [{ chapterNumber: 1, title: 'Ch1', hookEnding: 'h1' }]
          })
        })
        const { generateStoryPlan } = useStoryDirector()
        await expect(
          generateStoryPlan({
            goal: {
              ...goal,
              horizon: 'long_term',
              structure: {
                chapters: 40,
                scenesPerChapter: 1,
                wordsPerChapter: 800,
                chaptersPerVolume: 40,
                volumes: 1
              }
            },
            evidence: '',
            signal: controller.signal
          })
        ).rejects.toThrow(/cancelled/i)
        expect(mockAiGenerate).toHaveBeenCalledTimes(1)
      })

      it('plans normally when no signal is supplied', async () => {
        mockAiGenerate.mockImplementation((prompt) =>
          /chapter skeleton/i.test(prompt)
            ? skeleton
            : JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }] })
        )
        const { generateStoryPlan } = useStoryDirector()
        const result = await generateStoryPlan({ goal: cancellableGoal(), evidence: '' })
        expect(result.chapters).toHaveLength(4)
      })
    })

    it('sets isPlanning ref correctly', async () => {
      mockAiGenerate.mockResolvedValue(makeValidResponse())
      const { generateStoryPlan, isPlanning } = useStoryDirector()
      const promise = generateStoryPlan({ goal, evidence: '' })
      expect(isPlanning.value).toBe(true)
      await promise
      expect(isPlanning.value).toBe(false)
    })

    it('retries on failed parse first attempt', async () => {
      mockAiGenerate
        .mockResolvedValueOnce('invalid response')
        .mockResolvedValueOnce(makeValidResponse())
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: '' })
      expect(result.chapters).toHaveLength(1)
      expect(mockAiGenerate).toHaveBeenCalledTimes(2)
    })

    it('throws when both attempts fail', async () => {
      mockAiGenerate.mockResolvedValue('invalid')
      const { generateStoryPlan, planError } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('invalid JSON')
      expect(planError.value).toContain('invalid JSON')
    })

    it('throws when long_term has no chapters', async () => {
      const fewActions = JSON.stringify({
        chapters: [],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(fewActions)
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('no chapters')
    })

    it('validates scene payloads with defaults', async () => {
      const minimalResponse = JSON.stringify({
        chapters: [
          {
            chapterNumber: 1,
            title: 'Chapter 1',
            emotionalTarget: 'Hope',
            estimatedWords: 6000,
            scenes: Array.from({ length: 4 }, (_, i) => ({
              sceneNumber: i + 1,
              title: `Scene ${i + 1}`,
              arcPosition: 'setup',
              obstacle: 'ob'
            }))
          }
        ],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(minimalResponse)
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: '' })
      result.scenes.forEach((s, _i) => {
        expect(s.tension).toBe('medium')
        expect(s.pacing).toBe('medium')
        expect(s.estimatedWords).toBeGreaterThan(0)
      })
    })

    it('uses short_term prompt for short_term horizon', async () => {
      const shortGoal = { ...goal, horizon: 'short_term' }
      mockAiGenerate.mockResolvedValue(makeValidResponse())
      const { generateStoryPlan } = useStoryDirector()
      await generateStoryPlan({ goal: shortGoal, evidence: '' })
      const systemPrompt = mockAiGenerate.mock.calls[0][1]
      expect(systemPrompt).toContain('short-term')
    })

    it('handles custom actions missing but parses successfully anyway', async () => {
      const response = JSON.stringify({
        chapters: [
          {
            chapterNumber: 1,
            emotionalTarget: 'Hope',
            estimatedWords: 6000,
            scenes: Array.from({ length: 4 }, (_, i) => ({
              sceneNumber: i + 1,
              title: `Scene ${i + 1}`,
              arcPosition: 'setup',
              obstacle: 'ob'
            }))
          }
        ],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(response)
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({
        goal: { ...goal, horizon: 'short_term' },
        evidence: ''
      })
      expect(result.chapters).toHaveLength(1)
    })

    it('handles missing AI model error gracefully', async () => {
      mockAiGenerate.mockRejectedValue(new Error('Model not found'))
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Model not found')
    })
  })
})

describe('enforceStructure', () => {
  it('trims to the exact chapter count and pads scenes/words', async () => {
    const { enforceStructure } = await import('@/composables/useStoryDirector')
    const raw = [
      { title: 'A', scenes: [{ title: 's1' }, { title: 's2' }, { title: 's3' }, { title: 's4' }] },
      { title: 'B', scenes: [{ title: 's1' }] },
      { title: 'C', scenes: [] }
    ]
    const out = enforceStructure(raw, {
      chapters: 2,
      scenesPerChapter: 3,
      wordsPerChapter: 3000,
      chaptersPerVolume: 2,
      volumes: 1
    })
    expect(out.length).toBe(2)
    for (const ch of out) {
      expect(ch.scenes.length).toBe(3)
      expect(ch.estimatedWords).toBe(3000)
      expect(ch.scenes.every((s) => s.estimatedWords === 1000)).toBe(true)
    }
    expect(out[0].chapterNumber).toBe(1)
    expect(out[1].chapterNumber).toBe(2)
  })

  it('pads chapters up to the requested count', async () => {
    const { enforceStructure } = await import('@/composables/useStoryDirector')
    const out = enforceStructure([{ title: 'Only', scenes: [{ title: 'x' }] }], {
      chapters: 4,
      scenesPerChapter: 2,
      wordsPerChapter: 1000
    })
    expect(out.length).toBe(4)
    expect(out.every((c) => c.scenes.length === 2)).toBe(true)
  })

  it('tags chapters with volumeIndex by chaptersPerVolume', async () => {
    const { enforceStructure } = await import('@/composables/useStoryDirector')
    const raw = Array.from({ length: 6 }, (_, i) => ({ title: `C${i}`, scenes: [] }))
    const out = enforceStructure(raw, {
      chapters: 6,
      scenesPerChapter: 1,
      wordsPerChapter: 800,
      chaptersPerVolume: 3,
      volumes: 2
    })
    expect(out.map((c) => c.volumeIndex)).toEqual([1, 1, 1, 2, 2, 2])
  })
})
