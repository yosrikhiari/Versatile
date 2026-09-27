/**
 * Understand a book that was not written by the generator
 * (WHATIF-AND-IMPORT-PLAN.md, step 3): an imported novel, or a hand-written one.
 *
 * Two stages on the durable `analysisQueue` (IndexedDB), so a closed tab, a
 * crash or a Stop resumes where it left off instead of starting again:
 *
 * 1. `bookScene`, one job per scene: the local model reads the scene (in
 *    ~2,500-word passages when it is long) and records summary, cast, places,
 *    key facts and relationships. The result is stored on the job. A scene
 *    whose text has not changed since its job completed is not read again.
 * 2. Finish, once every scene is read: names are resolved across the whole
 *    book ("Holmes" = "Sherlock Holmes"), then chapter by chapter, in reading
 *    order, each scene's reading becomes the writer's own structured record
 *    and goes through the SAME code a generated scene does --
 *    `syncChapterToBible` fills the story bible and stamps the network's edges
 *    with the chapter they start in, `writeSceneAnalysis` writes the scene
 *    digest and entity states. Then the chapter/volume rollup, a story
 *    profile, the voice profile and the search index.
 *
 * One scene at a time, yielding to the writer (`awaitForegroundIdle`): the
 * local GPU serves one request at a time by design (providerGate), so this is
 * as fast as the hardware allows, not a queue waiting on itself.
 */
import { reactive } from 'vue'
import type { Table } from 'dexie'
import { aiGenerateJson, aiChoiceProbabilities } from './useAiService'
import { FEATURES } from '../config/ai'
import { awaitForegroundIdle } from '../services/providerGate'
import { stripHtmlBlock } from '../utils/textUtils'
import { hashContent } from '../services/generation/sceneDigest'
import { writeSceneAnalysis } from '../services/generation/sceneAnalysis'
import { db } from '../services/db-core'
import { updateProject, getProject } from '../services/db-projects'
import {
  enqueueAnalysisTasks,
  claimNextAnalysisTask,
  completeAnalysisTask,
  failAnalysisTask,
  resetStuckAnalysisTasks,
  getAnalysisQueueItems,
  type AnalysisQueueItem
} from '../services/analysisQueue'
import {
  SCENE_EXTRACTION_SCHEMA,
  SCENE_EXTRACTION_SYSTEM,
  STORY_PROFILE_SCHEMA,
  sceneExtractionPrompt,
  storyProfilePrompt,
  chunkParagraphs,
  cleanExtraction,
  mergeExtractions,
  resolveNames,
  resolvePlaces,
  placeCounts,
  familyVote,
  stabilizeRelations,
  assignAlias,
  characterCounts,
  toStructured,
  type SceneExtraction,
  type StoryProfile
} from '../services/import/bookAnalysis'

export interface BookScene {
  subsectionId: string | number
  sectionId: string | number
  volumeId: string | number | null
  chapterNumber: number
  sceneNumber: number
  chapterTitle: string
  title: string
  html: string
}

type Phase =
  'idle' | 'reading' | 'resolving' | 'linking' | 'profiling' | 'done' | 'stopped' | 'failed'

/** One shared state, so any panel can show the analysis the app is running. */
export const bookAnalysisState = reactive({
  projectId: null as string | number | null,
  phase: 'idle' as Phase,
  total: 0,
  done: 0,
  failed: 0,
  current: '',
  /** Mean seconds per scene read so far, for the time-left estimate. */
  secondsPerScene: 0,
  error: '',
  summary: null as null | {
    scenes: number
    characters: number
    locations: number
    edges: number
    aliases: number
  }
})

const TASK = 'bookScene' as const
let controller: AbortController | null = null

/** The book in reading order, from the loaded manuscript store. */
interface SectionRow {
  id: string | number
  title?: string
  volumeId?: string | number | null
}
interface SubsectionRow {
  id: string | number
  title?: string
  content?: string
  summary?: string
}
interface ReadPayload {
  subsectionId: string | number
  contentHash: string
}
interface NamedRow {
  id: string | number
  name: string
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))
const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'

export function bookScenes(
  sortedSections: SectionRow[],
  subsectionsBySection: Record<string, SubsectionRow[]>
): BookScene[] {
  const out: BookScene[] = []
  sortedSections.forEach((sec, ci) => {
    for (const sub of subsectionsBySection[sec.id] || []) {
      if (!stripHtmlBlock(sub.content)) continue
      out.push({
        subsectionId: sub.id,
        sectionId: sec.id,
        volumeId: sec.volumeId ?? null,
        chapterNumber: ci + 1,
        sceneNumber: out.length + 1,
        chapterTitle: sec.title || `Chapter ${ci + 1}`,
        title: sub.title || `Scene ${out.length + 1}`,
        html: sub.content || ''
      })
    }
  })
  return out
}

function paragraphsOf(html: string): string[] {
  const parts = String(html || '')
    .split(/<\/p>|<br\s*\/?>|\n{2,}/i)
    .map((p) => stripHtmlBlock(p))
    .filter(Boolean)
  return parts.length ? parts : [stripHtmlBlock(html)]
}

async function readScene(
  bookTitle: string,
  scene: BookScene,
  signal: AbortSignal
): Promise<SceneExtraction> {
  const chunks = chunkParagraphs(paragraphsOf(scene.html))
  const parts: SceneExtraction[] = []
  for (const [i, text] of chunks.entries()) {
    await awaitForegroundIdle('ollama', signal)
    const raw = await aiGenerateJson(
      sceneExtractionPrompt({
        bookTitle,
        chapterTitle: scene.chapterTitle,
        sceneTitle: scene.title,
        part: chunks.length > 1 ? { index: i + 1, of: chunks.length } : undefined,
        text
      }),
      SCENE_EXTRACTION_SYSTEM,
      {
        feature: FEATURES.WORLDBUILDING,
        role: 'utility',
        background: true,
        temperature: 0.2,
        schema: SCENE_EXTRACTION_SCHEMA,
        schemaName: 'scene_reading',
        signal
      }
    )
    parts.push(cleanExtraction(raw))
  }
  return mergeExtractions(parts)
}

/** Queue a read for every scene with no current reading. Returns how many were queued. */
async function enqueueReads(projectId: string, scenes: BookScene[]): Promise<number> {
  const items = (await getAnalysisQueueItems(projectId)).filter((i) => i.taskType === TASK)
  const current = new Set(
    items
      .filter((i) => i.status !== 'failed')
      .map((i) => {
        const p = i.payload as unknown as ReadPayload
        return `${p.subsectionId}|${p.contentHash}`
      })
  )
  const todo = scenes.filter(
    (s) => !current.has(`${s.subsectionId}|${hashContent(stripHtmlBlock(s.html))}`)
  )
  await enqueueAnalysisTasks(
    projectId,
    todo.map((s) => ({
      taskType: TASK,
      payload: { subsectionId: s.subsectionId, contentHash: hashContent(stripHtmlBlock(s.html)) },
      maxRetries: 2
    }))
  )
  return todo.length
}

/** The latest completed reading of each scene, in book order; null where there is none. */
async function readings(
  projectId: string,
  scenes: BookScene[]
): Promise<Array<SceneExtraction | null>> {
  const items = (await getAnalysisQueueItems(projectId)).filter(
    (i: AnalysisQueueItem) => i.taskType === TASK && i.status === 'completed'
  )
  const latest = new Map<string, AnalysisQueueItem>()
  for (const i of items) {
    const p = i.payload as unknown as ReadPayload
    latest.set(`${p.subsectionId}|${p.contentHash}`, i)
  }
  return scenes.map((s) => {
    const hit = latest.get(`${s.subsectionId}|${hashContent(stripHtmlBlock(s.html))}`)
    return hit?.result ? cleanExtraction(hit.result) : null
  })
}

/**
 * A short form that fits two full names ("Mrs. Frome": Ethan or Zeena) is
 * settled by the model's own probability over the candidates, given the
 * scenes it appears in -- a one-token choice read from the logits, not a
 * JSON enum (§33: the enum answer is not the model's most likely one). Below
 * 0.6 it stays a separate name; merging two people is worse than not.
 */
async function settleAmbiguous(
  res: ReturnType<typeof resolveNames>,
  extractions: SceneExtraction[],
  signal: AbortSignal
) {
  for (const amb of [...res.ambiguous]) {
    const where = extractions
      .filter((e) => e.characters.some((c) => c.name === amb.name))
      .slice(0, 3)
      .map((e) => `- ${e.summary}`)
      .join('\n')
    const letters = amb.candidates.map((_, i) => String.fromCharCode(65 + i))
    const options = amb.candidates.map((c, i) => `${letters[i]}) ${c}`).join('\n')
    await awaitForegroundIdle('ollama', signal)
    const probs = await aiChoiceProbabilities(
      `In a novel, the name "${amb.name}" appears in these scenes:\n${where}\n\nWho is "${amb.name}"?\n${options}\n\nAnswer with one letter.`,
      'You identify characters in a novel. Answer with one letter.',
      letters,
      { feature: FEATURES.WORLDBUILDING, role: 'utility', background: true, signal }
    )
    if (!probs) continue
    const [best, p] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0] || []
    if (best && p >= 0.6) assignAlias(res, amb.name, amb.candidates[letters.indexOf(best)])
  }
}

export function useBookAnalysis() {
  function stop() {
    controller?.abort()
  }

  /**
   * Read the open project's book and link what was read. The project must be
   * the one loaded in the stores: the bible sync and the chapter numbering
   * read them.
   */
  /**
   * One reading of a book at a time, across tabs: a browser-wide lock per
   * project (Web Locks; released by the browser when a tab closes). Two runs
   * on one book -- a second tab, or a hot-reloaded copy of this module --
   * each linked every chapter, so the network got its links twice.
   */
  async function run(projectId: string) {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks
    if (!locks) return runLocked(projectId)
    return locks.request(
      `versatile-book-analysis-${projectId}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          bookAnalysisState.projectId = projectId
          bookAnalysisState.phase = 'failed'
          bookAnalysisState.error = 'This book is already being read in another tab or window.'
          return null
        }
        return runLocked(projectId)
      }
    )
  }

  async function runLocked(projectId: string) {
    if (bookAnalysisState.phase === 'reading' || bookAnalysisState.phase === 'linking') return
    const { useManuscriptStore } = await import('../stores/manuscriptStore')
    const { useStoryBibleStore } = await import('../stores/storyBibleStore')
    const manuscript = useManuscriptStore()
    const bible = useStoryBibleStore()

    controller = new AbortController()
    const signal = controller.signal
    Object.assign(bookAnalysisState, {
      projectId,
      phase: 'reading',
      total: 0,
      done: 0,
      failed: 0,
      current: '',
      error: '',
      summary: null
    })

    try {
      const project = await getProject(projectId)
      const bookTitle = project?.name || 'Untitled'
      const scenes = bookScenes(
        manuscript.sortedSections as unknown as SectionRow[],
        manuscript.subsectionsBySection as unknown as Record<string, SubsectionRow[]>
      )
      if (!scenes.length) throw new Error('This project has no scenes with text to read.')
      await resetStuckAnalysisTasks(projectId, [TASK])
      await enqueueReads(projectId, scenes)
      const before = await readings(projectId, scenes)
      bookAnalysisState.total = scenes.length
      bookAnalysisState.done = before.filter(Boolean).length
      const byId = new Map(scenes.map((s) => [String(s.subsectionId), s]))

      // ── stage 1: read every scene ──
      let spent = 0
      let timed = 0
      for (;;) {
        if (signal.aborted) throw new DOMException('stopped', 'AbortError')
        const task = await claimNextAnalysisTask(projectId, [TASK])
        if (!task) break
        const scene = byId.get(String((task.payload as unknown as ReadPayload).subsectionId))
        if (!scene) {
          await completeAnalysisTask(task.id!)
          continue
        }
        bookAnalysisState.current = `${scene.chapterTitle} · ${scene.title}`
        const t0 = performance.now()
        try {
          const reading = await readScene(bookTitle, scene, signal)
          await completeAnalysisTask(task.id!, reading)
          bookAnalysisState.done++
          spent += (performance.now() - t0) / 1000
          timed++
          bookAnalysisState.secondsPerScene = Math.round(spent / timed)
        } catch (err) {
          if (signal.aborted || isAbort(err)) {
            // Back to pending: a stopped read is not a failed one.
            await resetStuckAnalysisTasks(projectId, [TASK])
            throw err
          }
          bookAnalysisState.failed++
          await failAnalysisTask(task.id!, errMsg(err))
        }
      }

      // ── stage 2: names across the book ──
      bookAnalysisState.phase = 'resolving'
      bookAnalysisState.current = 'Matching names across the book'
      const got = await readings(projectId, scenes)
      const extractions = got.filter((e): e is SceneExtraction => !!e)
      const res = resolveNames(characterCounts(extractions))
      await settleAmbiguous(res, extractions, signal)
      // A person the book names in one scene only stays in that scene's cast
      // but does not get a bible entry; the narrator of every scene does.
      const scenesOf = new Map<string, number>()
      for (const e of extractions) {
        for (const n of new Set(e.characters.map((c) => res.canonical.get(c.name) || c.name))) {
          scenesOf.set(n, (scenesOf.get(n) || 0) + 1)
        }
      }
      const povs = new Set(extractions.map((e) => res.canonical.get(e.pov) || e.pov))
      const keep = (n: string) => (scenesOf.get(n) || 0) >= 2 || povs.has(n)
      const places = resolvePlaces(placeCounts(extractions))
      const relation = familyVote(extractions, res.canonical)

      // ── stage 3: link, chapter by chapter, through the writer's own path ──
      bookAnalysisState.phase = 'linking'
      await bible.loadAll(projectId)
      const { syncChapterToBible } = await import('./generation/writing/bibleSync')
      const { useChapterGenerationSync } = await import('./useChapterGenerationSync')
      const ctx = {
        bibleChangesDiscovered: { value: 0 },
        scenesSynced: { value: 0 },
        runHealth: { record: () => {} },
        structuredResults: [] as unknown[],
        sync: useChapterGenerationSync()
      }
      let edges = 0
      const chapters = [...new Set(scenes.map((s) => s.chapterNumber))]
      // Every chapter's records first, so relationships can be settled over
      // the whole book before any is written.
      const plan = chapters.map((ch) => {
        const inChapter = scenes
          .map((s, i) => ({ s, e: got[i] }))
          .filter((x) => x.s.chapterNumber === ch && x.e)
        return {
          inChapter,
          structured: inChapter.map((x) =>
            toStructured(x.e!, res.canonical, keep, { places, relation })
          )
        }
      })
      stabilizeRelations(plan.map((p) => p.structured))
      for (const { inChapter, structured } of plan) {
        if (signal.aborted) throw new DOMException('stopped', 'AbortError')
        if (!inChapter.length) continue
        bookAnalysisState.current = inChapter[0].s.chapterTitle
        const synced = await syncChapterToBible(
          ctx as unknown as Parameters<typeof syncChapterToBible>[0],
          {
            projectId,
            volumeId: inChapter[0].s.volumeId,
            chapterId: inChapter[0].s.sectionId,
            scenes: structured.map((st, k) => ({ sceneIndex: k, structured: st }))
          }
        )
        edges += synced.edgesWritten
        // Digests after the sync, so entity states resolve to bible ids.
        for (const [k, { s, e }] of inChapter.entries()) {
          await writeSceneAnalysis({
            projectId,
            // The row's own id, not a string of it: scene ids are numbers,
            // and "5" is a different key from 5 -- the first live read left
            // every scene with two digests and never hydrated its columns.
            subsectionId: s.subsectionId as string,
            prose: stripHtmlBlock(s.html),
            structured: structured[k],
            scene: {
              sceneNumber: s.sceneNumber,
              chapterNumber: s.chapterNumber,
              title: s.title,
              pov: res.canonical.get(e!.pov) || e!.pov,
              location: places.canonical.get(e!.location) || e!.location,
              charactersPresent: structured[k].usedEntities.characterNames
            }
          })
          // The scene's summary column, for retrieval and What If -- only if empty.
          const subs = (db as unknown as { subsections: Table<SubsectionRow, string | number> })
            .subsections
          const row = await subs.get(s.subsectionId)
          if (row && !row.summary && e!.summary) {
            await subs.update(s.subsectionId, { summary: e!.summary })
          }
        }
      }
      // Aliases on the characters they belong to, for search and later imports;
      // and a role and description for anyone who entered the bible through a
      // link before any scene described them.
      const firstSeen = new Map<string, { role: string; description: string }>()
      for (const e of extractions) {
        for (const ch of e.characters) {
          const n = res.canonical.get(ch.name) || ch.name
          const prev = firstSeen.get(n)
          if (!prev || (!prev.description && ch.description)) {
            firstSeen.set(n, {
              role: prev?.role || ch.role || '',
              description: ch.description || ''
            })
          }
        }
      }
      let aliasCount = 0
      for (const c of bible.characters as unknown as Array<
        NamedRow & { role?: string; description?: string }
      >) {
        const forms = res.aliases.get(c.name)
        const seen = firstSeen.get(c.name)
        const patch: Record<string, unknown> = {}
        if (forms?.length) patch.aliases = forms
        if (seen && (!c.role || c.role === 'unknown') && seen.role) patch.role = seen.role
        if (seen && !c.description && seen.description) patch.description = seen.description
        if (Object.keys(patch).length) await bible.updateCharacterData(c.id, patch, projectId)
        aliasCount += forms?.length || 0
      }
      const { rollupProjectDigests } = await import('../services/generation/digestContext')
      await rollupProjectDigests({ projectId })

      // ── stage 4: profile, voice, search index ──
      bookAnalysisState.phase = 'profiling'
      bookAnalysisState.current = 'Describing the book'
      const chapterSummaries = chapters.map((ch) =>
        scenes
          .map((s, i) => ({ s, e: got[i] }))
          .filter((x) => x.s.chapterNumber === ch && x.e?.summary)
          .map((x) => x.e!.summary)
          .join(' ')
          .split(/\s+/)
          .slice(0, 80)
          .join(' ')
      )
      let profile: StoryProfile | null = null
      try {
        await awaitForegroundIdle('ollama', signal)
        profile = (await aiGenerateJson(
          storyProfilePrompt(bookTitle, chapterSummaries),
          'You describe novels accurately and briefly. Return ONLY valid JSON.',
          {
            feature: FEATURES.WORLDBUILDING,
            role: 'utility',
            background: true,
            temperature: 0.2,
            schema: STORY_PROFILE_SCHEMA,
            schemaName: 'story_profile',
            signal
          }
        )) as StoryProfile
      } catch (err) {
        if (signal.aborted) throw err
        console.warn('[bookAnalysis] story profile failed:', errMsg(err))
      }
      try {
        const { analyzeVoiceProfile } = await import('../services/generation/voiceAnalyzer')
        const voice = analyzeVoiceProfile([manuscript.getFullText()])
        if (voice) await bible.setVoiceProfile(voice)
      } catch (err) {
        console.warn('[bookAnalysis] voice profile failed:', errMsg(err))
      }
      try {
        const { indexProject } = await import('../services/storyVectorIndex')
        await indexProject(projectId)
      } catch (err) {
        // No embedding model is not a failed analysis; Related/Lookup say so themselves.
        console.warn('[bookAnalysis] search index not built:', errMsg(err))
      }

      const summary = {
        scenes: extractions.length,
        characters: bible.characters.length,
        locations: bible.locations.length,
        edges,
        aliases: aliasCount
      }
      await updateProject(projectId, {
        ...(profile ? { storyProfile: profile } : {}),
        ...(profile?.genre && !project?.genre ? { genre: profile.genre } : {}),
        analysis: {
          status: bookAnalysisState.failed ? 'partial' : 'done',
          at: new Date().toISOString(),
          ...summary,
          failed: bookAnalysisState.failed
        }
      })
      bookAnalysisState.summary = summary
      bookAnalysisState.phase = 'done'
      bookAnalysisState.current = ''
      return summary
    } catch (err) {
      if (signal.aborted || isAbort(err)) {
        bookAnalysisState.phase = 'stopped'
        return null
      }
      bookAnalysisState.phase = 'failed'
      bookAnalysisState.error = errMsg(err)
      throw err
    } finally {
      controller = null
    }
  }

  return { run, stop, state: bookAnalysisState }
}
