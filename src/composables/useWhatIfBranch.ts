/**
 * What If, as a branch (WHATIF-AND-IMPORT-PLAN.md, step 4): fork the book at a
 * scene, plan what the change reaches, write it with the real writer, check
 * the scenes that were kept, then compare and merge back.
 *
 *   fork   -> the whole book copied into a new branch (prose, knowledge, and a
 *             link from every copy to the scene it came from)
 *   plan   -> the model decides keep / revise / drop for every later scene;
 *             saved on the branch for the author to change before anything is
 *             written
 *   write  -> dropped scenes removed, revised ones blanked with their new
 *             brief and written in order by the continuation writer (writer +
 *             gate) against the story up to the change; kept scenes checked
 *             against the change and repaired sentence by sentence
 *   merge  -> chosen scenes copied back onto the scenes they came from, each
 *             snapshotted first (restorable from the history drawer)
 *
 * Works on any book: an imported one needs only to have been read (step 3)
 * for summaries to plan from; an unread one plans from titles.
 */
import { reactive } from 'vue'
import type { useStoryCritic } from './useStoryCritic'
import type { Table } from 'dexie'
import { db } from '../services/db-core'
import { createBranch, updateBranch, copyManuscriptToBranch } from '../services/db-branches'
import { getProject } from '../services/db-projects'
import { updateSubsection, deleteSubsection } from '../services/db-structure'
import { getSceneDigest, deleteSceneDigest, deleteSceneEntityStates } from '../services/db-digests'
import { addSnapshot } from '../services/db-snapshots'
import { orderSections } from '../utils/sectionOrder'
import { stripHtmlBlock, countWords } from '../utils/textUtils'
import { aiGenerateJson } from './useAiService'
import {
  PRESENCE_SCHEMA,
  PRESENCE_SYSTEM,
  trackedCharacters,
  mentions,
  namedAbsence,
  presencePrompt,
  decidePresence,
  type Whereabouts
} from '../services/whatIf/presence'
import { narrativePerson, povDrift, povRule } from '../services/whatIf/pov'
import { narrativeTense, presentStretch, tenseDrift, tenseRule } from '../services/whatIf/tense'
import { FEATURES } from '../config/ai'
import {
  PLAN_SYSTEM,
  DIVERGENCE_SCHEMA,
  chooseDivergenceFact,
  premiseAsFact,
  divergencePrompt,
  FATE_SCHEMA,
  sceneFatePrompt,
  sceneEvidence,
  secondLook,
  decideFate,
  BRIEF_SCHEMA,
  sceneBriefPrompt,
  type PlannedScene,
  branchCanon,
  rewriteBrief,
  replaceSentenceInHtml,
  type BranchScene,
  type WhatIfPlan
} from '../services/whatIf/whatIfPlan'

type Id = string | number
interface Row {
  id: Id
  [k: string]: unknown
}
const tables = db as unknown as {
  branches: Table<Row, Id>
  sections: Table<Row, Id>
  subsections: Table<Row, Id>
}

export interface WhatIfMeta {
  premise: string
  /** The scene the change happens in, in the source branch. */
  sourceDivergenceId: Id
  /** Its copy in this branch. */
  divergenceId: Id
  status: 'forked' | 'planned' | 'writing' | 'written' | 'merged'
  plan?: WhatIfPlan
  createdAt: string
}

export interface WhatIfBranch {
  id: Id
  projectId: Id
  name: string
  sourceBranchId: Id | null
  whatIf: WhatIfMeta
}

/** One shared state, so the panel can show a run the app is doing. */
export const whatIfState = reactive({
  busy: false,
  phase: '' as '' | 'forking' | 'planning' | 'writing' | 'checking' | 'merging',
  message: '',
  error: '',
  /** The writer's own progress line while scenes are being written. */
  detail: ''
})

// One private writer, like useChapterStoryGenerator's: a generator instance
// is plain state with no component lifecycle, and the panel reads its progress.
let engine: {
  writeWhatIf: (a: unknown) => Promise<unknown>
  progress: { statusText: string }
} | null = null
async function writer() {
  if (!engine) {
    const { useVolumeStoryGenerator } = await import('./useVolumeStoryGenerator')
    engine = useVolumeStoryGenerator() as unknown as typeof engine
  }
  return engine!
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function getBranchRow(branchId: Id): Promise<WhatIfBranch> {
  const b = (await tables.branches.get(branchId)) as unknown as WhatIfBranch | undefined
  if (!b?.whatIf) throw new Error('This branch is not a What If.')
  return b
}

async function saveMeta(branchId: Id, patch: Partial<WhatIfMeta>) {
  const b = await getBranchRow(branchId)
  await updateBranch(branchId, { whatIf: { ...b.whatIf, ...patch } })
}

/** A branch's scenes in reading order, with what the book knows about each. */
export async function branchScenes(projectId: Id, branchId: Id): Promise<BranchScene[]> {
  const [sections, subsections] = await Promise.all([
    tables.sections.where({ projectId, branchId }).toArray(),
    tables.subsections.where({ projectId, branchId }).toArray()
  ])
  const out: BranchScene[] = []
  const ordered = orderSections(sections as never[]) as unknown as Row[]
  for (const [ci, sec] of ordered.entries()) {
    const subs = subsections
      .filter((s) => s.sectionId === sec.id)
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    for (const sub of subs) {
      const digest = (await getSceneDigest(projectId as string, sub.id as string)) as
        { summary?: string; keyFacts?: string[] } | undefined
      out.push({
        subsectionId: sub.id,
        sourceSubsectionId: (sub.sourceSubsectionId as Id) ?? null,
        sceneNumber: out.length + 1,
        chapterNumber: ci + 1,
        chapterTitle: String(sec.title || `Chapter ${ci + 1}`),
        title: String(sub.title || `Scene ${out.length + 1}`),
        summary: String(digest?.summary || sub.summary || ''),
        keyFacts: Array.isArray(digest?.keyFacts) ? digest!.keyFacts! : []
      })
    }
  }
  return out
}

function splitAt(scenes: BranchScene[], divergenceId: Id) {
  const at = scenes.findIndex((s) => String(s.subsectionId) === String(divergenceId))
  if (at < 0) throw new Error('The scene the change happens in is no longer in the branch.')
  return { before: scenes.slice(0, at), divergence: scenes[at], later: scenes.slice(at + 1) }
}

const PLAN_OPTS = { feature: FEATURES.STORY_GENERATION, role: 'utility' as const }

/**
 * The plan, one small question at a time (see whatIfPlan's per-scene planner):
 * the change as a fact, then each later scene's fate (reason first), then a
 * brief for each scene that changes, written knowing the alternate version so
 * far.
 */
async function planPerScene(
  bookTitle: string,
  premise: string,
  before: BranchScene[],
  divergence: BranchScene,
  later: BranchScene[]
): Promise<WhatIfPlan> {
  const div = (await aiGenerateJson(
    divergencePrompt({ bookTitle, premise, before, divergence }),
    PLAN_SYSTEM,
    {
      ...PLAN_OPTS,
      temperature: 0.3,
      schema: DIVERGENCE_SCHEMA,
      schemaName: 'what_if_change'
    }
  ).catch(() => null)) as { divergenceFact?: string; divergenceBrief?: string } | null
  const fact = chooseDivergenceFact(div?.divergenceFact, premise)
  // Who the change is about, so each scene's fate is decided on what its own
  // text says about them, not on a summary that dropped them (§43).
  const { useStoryBibleStore } = await import('../stores/storyBibleStore')
  const people = trackedCharacters(
    `${fact} ${premiseAsFact(premise)}`,
    useStoryBibleStore().characters as Array<{ name?: unknown; aliases?: unknown }>
  )
  const first: PlannedScene = {
    ...divergence,
    action: 'revise',
    brief: div?.divergenceBrief?.trim() || `${premise}. ${divergence.summary}`,
    reason: 'the scene where the story changes'
  }
  const scenes: PlannedScene[] = []
  for (const scene of later) {
    whatIfState.detail = `Scene ${scene.sceneNumber} of ${later.at(-1)?.sceneNumber ?? scene.sceneNumber}`
    const ask = (evidence?: string[]) =>
      aiGenerateJson(sceneFatePrompt({ divergenceFact: fact, scene, evidence }), PLAN_SYSTEM, {
        ...PLAN_OPTS,
        temperature: 0,
        schema: FATE_SCHEMA,
        schemaName: 'what_if_scene'
      }).catch(() => null)
    // No usable answer: the scene stays as written, and says so.
    let fate = decideFate(await ask()) || {
      action: 'keep' as const,
      reason: 'no decision; kept as written'
    }
    // A scene about to be kept gets a second look at its own sentences about
    // the people the change names: a summary drops them (§43).
    if (fate.action === 'keep' && people.length) {
      const row = await tables.subsections.get(scene.subsectionId)
      const evidence = sceneEvidence(stripHtmlBlock(String(row?.content || '')), people)
      if (evidence.length) fate = secondLook(fate, decideFate(await ask(evidence)))
    }
    const planned: PlannedScene = { ...scene, action: fate.action, brief: '', reason: fate.reason }
    if (fate.action === 'revise') {
      const b = (await aiGenerateJson(
        sceneBriefPrompt({ divergenceFact: fact, scene }),
        PLAN_SYSTEM,
        { ...PLAN_OPTS, temperature: 0.3, schema: BRIEF_SCHEMA, schemaName: 'what_if_brief' }
      ).catch(() => null)) as { brief?: string } | null
      planned.brief =
        b?.brief?.trim() ||
        `${scene.summary || scene.title} -- rewritten so it follows from: ${fact}`
    }
    scenes.push(planned)
  }
  whatIfState.detail = ''
  return { premise, divergenceFact: fact, divergence, scenes: [first, ...scenes] }
}

/**
 * One scene against a list of facts: the critic's quoted contradictions, each
 * repaired sentence by sentence. 'review' when a repair could not be placed.
 */
async function checkAndRepair(
  critic: ReturnType<typeof useStoryCritic>,
  characters: unknown,
  subsectionId: Id,
  ledger: string[]
): Promise<'ok' | 'repaired' | 'needs review'> {
  const row = await tables.subsections.get(subsectionId)
  let html = String(row?.content || '')
  const report = (await critic
    .checkContradictions({
      characters,
      locations: [],
      sceneProse: [{ prose: stripHtmlBlock(html), chapterNumber: null }],
      synopsis: '',
      ledger
    })
    .catch(() => null)) as {
    characterIssues?: Array<{ contradictions: Array<{ between: string[] }> }>
  } | null
  const pairs = (report?.characterIssues || []).flatMap((i) =>
    i.contradictions.map((c) => c.between)
  )
  if (!pairs.length) return 'ok'
  let allFixed = true
  for (const [sentence, fact] of pairs) {
    const fixed = await critic.repairSentence(sentence, fact)
    const r =
      fixed == null ? { html, replaced: false } : replaceSentenceInHtml(html, sentence, fixed)
    allFixed = allFixed && r.replaced
    html = r.html
  }
  await updateSubsection(subsectionId as string, {
    content: html,
    wordCount: countWords(stripHtmlBlock(html)),
    ...(allFixed ? {} : { contentStatus: 'review' })
  })
  return allFixed ? 'repaired' : 'needs review'
}

export function useWhatIfBranch() {
  async function run<T>(phase: typeof whatIfState.phase, message: string, fn: () => Promise<T>) {
    if (whatIfState.busy) throw new Error('A What If is already running.')
    Object.assign(whatIfState, { busy: true, phase, message, error: '' })
    try {
      return await fn()
    } catch (e) {
      whatIfState.error = errMsg(e)
      throw e
    } finally {
      Object.assign(whatIfState, { busy: false, phase: '', message: '' })
    }
  }

  /** Copy the book into a new branch that diverges at `sourceSubsectionId`. */
  function fork(projectId: Id, sourceBranchId: Id, sourceSubsectionId: Id, premise: string) {
    return run('forking', 'Copying the book into a new branch', async () => {
      const text = premise.trim()
      if (!text) throw new Error('Say what changes first.')
      const words = text.split(/\s+/)
      const name = `What if: ${words.slice(0, 8).join(' ')}${words.length > 8 ? '…' : ''}`
      const branch = (await createBranch(projectId, name, sourceBranchId, {
        description: text,
        status: 'divergent'
      })) as Row
      const maps = await copyManuscriptToBranch(projectId, sourceBranchId, branch.id)
      const divergenceId = maps.subsections.get(sourceSubsectionId)
      if (divergenceId == null) throw new Error('That scene is not in the branch being copied.')
      const whatIf: WhatIfMeta = {
        premise: text,
        sourceDivergenceId: sourceSubsectionId,
        divergenceId,
        status: 'forked',
        createdAt: new Date().toISOString()
      }
      await updateBranch(branch.id, { whatIf })
      return { ...(branch as unknown as WhatIfBranch), whatIf }
    })
  }

  /** Ask the model what the change reaches; saved on the branch for the author to edit. */
  function plan(projectId: Id, branchId: Id) {
    return run('planning', 'Working out which scenes the change reaches', async () => {
      const b = await getBranchRow(branchId)
      const scenes = await branchScenes(projectId, branchId)
      const { before, divergence, later } = splitAt(scenes, b.whatIf.divergenceId)
      const project = await getProject(projectId)
      const bookTitle = String(project?.name || 'Untitled')
      const planned = await planPerScene(bookTitle, b.whatIf.premise, before, divergence, later)
      await saveMeta(branchId, { plan: planned, status: 'planned' })
      return planned
    })
  }

  /** The author's edits to the plan (actions, briefs). */
  async function savePlan(branchId: Id, planned: WhatIfPlan) {
    await saveMeta(branchId, { plan: planned })
  }

  /**
   * Read the rewritten scenes (summary, facts: the branch's own knowledge),
   * then check every scene after the change, in order, against the change
   * and the facts of the rewritten scenes before it, repairing what
   * contradicts. Runs after writing; `recheck` runs it again on its own.
   */
  async function verify(projectId: Id, planned: WhatIfPlan, only?: Id) {
    // `only`: check one scene again (after "Rewrite this scene", §40). The
    // scenes before it are unchanged, so their facts come from their digests
    // and each person's last sighting from the previous walk.
    const isOnly = (id: Id) => only == null || String(id) === String(only)
    // Every scene after the change, rewritten or kept, checked in order
    // against the change and the facts of the rewritten scenes before it.
    // The first live branch checked only the kept scenes and only against
    // the change: a rewritten chapter VIII still said "after Zeena left"
    // (the writer's own gate does not know the change), and the kept
    // epilogue passed while still recounting the sled crash the rewritten
    // chapter IX no longer has.
    whatIfState.phase = 'checking'
    whatIfState.message = 'Reading the rewritten scenes'
    const project = await getProject(projectId)
    const { readScene } = await import('./useBookAnalysis')
    const { writeSceneAnalysis } = await import('../services/generation/sceneAnalysis')
    const factsOf = new Map<Id, string[]>()
    for (const s of planned.scenes) {
      if (s.outcome !== 'written') continue
      if (!isOnly(s.subsectionId)) {
        const digest = (await getSceneDigest(projectId as string, s.subsectionId as string)) as
          { keyFacts?: string[] } | undefined
        if (digest?.keyFacts?.length) factsOf.set(s.subsectionId, digest.keyFacts)
        continue
      }
      whatIfState.detail = s.title
      const row = await tables.subsections.get(s.subsectionId)
      const html = String(row?.content || '')
      const reading = await readScene(
        String(project?.name || 'Untitled'),
        {
          subsectionId: s.subsectionId,
          sectionId: (row?.sectionId as Id) ?? '',
          volumeId: null,
          chapterNumber: s.chapterNumber,
          sceneNumber: s.sceneNumber,
          chapterTitle: s.chapterTitle,
          title: s.title,
          html
        },
        new AbortController().signal
      ).catch(() => null)
      if (!reading) continue
      factsOf.set(s.subsectionId, reading.keyFacts)
      // The branch's own knowledge of the new scene (summary, facts, cast).
      await writeSceneAnalysis({
        projectId: projectId as string,
        subsectionId: s.subsectionId as string,
        prose: stripHtmlBlock(html),
        structured: {
          summary: reading.summary,
          keyFacts: reading.keyFacts,
          metadataStatus: 'ok',
          usedEntities: { characterNames: reading.characters.map((c) => c.name) }
        },
        scene: {
          sceneNumber: s.sceneNumber,
          chapterNumber: s.chapterNumber,
          title: s.title,
          pov: reading.pov,
          location: reading.location
        }
      }).catch(() => null)
      if (reading.summary)
        await updateSubsection(s.subsectionId as string, { summary: reading.summary })
    }

    whatIfState.message = 'Checking every scene after the change against it'
    const { useStoryCritic } = await import('./useStoryCritic')
    const { useStoryBibleStore } = await import('../stores/storyBibleStore')
    const critic = useStoryCritic()
    const characters = useStoryBibleStore().characters
    const ledger: string[] = [planned.divergenceFact]
    for (const s of planned.scenes) {
      if (s.action === 'drop' || s.outcome === 'failed') continue
      if (!isOnly(s.subsectionId)) {
        if (
          only == null ||
          planned.scenes.indexOf(s) < planned.scenes.findIndex((x) => isOnly(x.subsectionId))
        )
          ledger.push(...(factsOf.get(s.subsectionId) || []))
        continue
      }
      whatIfState.detail = s.title
      const verdict = await checkAndRepair(critic, characters, s.subsectionId, [...ledger])
      if (s.action === 'keep') s.outcome = verdict === 'ok' ? 'kept' : verdict
      else if (verdict !== 'ok')
        s.outcome = verdict === 'repaired' ? 'written, repaired' : 'written, needs review'
      ledger.push(...(factsOf.get(s.subsectionId) || []))
    }

    // Who is where: a person the change names, last SHOWN somewhere and
    // treated as gone later with no scene showing them leave (§39). The fact
    // check above cannot see a missing event; this walks each person's
    // whereabouts through the scenes in order. It flags and does not rewrite:
    // live, a one-sentence repair kept the absence in new words ("The silence
    // of Zeena's absence...") and, on a false alarm, changed the original
    // epilogue. A scene built on an event that never happened needs the
    // author, or a rewrite, not a patched sentence.
    whatIfState.message = 'Following where each person the change names is'
    const tracked = trackedCharacters(
      `${planned.divergenceFact} ${premiseAsFact(planned.premise)}`,
      characters as Array<{ name?: unknown; aliases?: unknown }>
    )
    const target = only == null ? null : planned.scenes.find((x) => isOnly(x.subsectionId))
    for (const who of tracked) {
      let last: Whereabouts | null = null
      const known = target?.lastSeen && who.name in target.lastSeen
      for (const s of planned.scenes) {
        if (s.action === 'drop' || s.outcome === 'failed') continue
        if (known && s !== target) continue
        if (target && known) last = target.lastSeen?.[who.name] ?? null
        const row = await tables.subsections.get(s.subsectionId)
        const prose = stripHtmlBlock(String(row?.content || ''))
        if (!mentions(prose, who)) continue
        s.lastSeen = { ...(s.lastSeen || {}), [who.name]: last }
        whatIfState.detail = `${who.name} · ${s.title}`
        const answer = await aiGenerateJson(
          presencePrompt({ who, last, sceneTitle: `${s.chapterTitle}, ${s.title}`, prose }),
          PRESENCE_SYSTEM,
          { ...PLAN_OPTS, temperature: 0, schema: PRESENCE_SCHEMA, schemaName: 'whereabouts' }
        ).catch(() => null)
        const { issue, next } = decidePresence(
          answer,
          prose,
          who,
          last,
          `${s.chapterTitle}`,
          s.action === 'keep'
        )
        last = next
        if (issue && isOnly(s.subsectionId)) {
          await updateSubsection(s.subsectionId as string, { contentStatus: 'review' })
          s.outcome = s.action === 'keep' ? 'needs review' : 'written, needs review'
          s.presenceIssues = [...(s.presenceIssues || []), { who: who.name, ...issue }]
        }
        if (s === target) break
      }
    }
    // Narrative person (§44): a rewritten scene told in another person than
    // its original is flagged. Code only, no model call.
    for (const s of planned.scenes) {
      if (!isOnly(s.subsectionId) || !String(s.outcome || '').startsWith('written')) continue
      if (s.sourceSubsectionId == null) continue
      const [row, src] = await Promise.all([
        tables.subsections.get(s.subsectionId),
        tables.subsections.get(s.sourceSubsectionId)
      ])
      const before = stripHtmlBlock(String(src?.content || ''))
      const after = stripHtmlBlock(String(row?.content || ''))
      const drift = povDrift(before, after)
      if (drift) s.povDrift = drift
      else delete s.povDrift
      // And tense (§45): the whole scene in another tense, or a past-tense
      // scene that slides into the present for a stretch.
      const tDrift = tenseDrift(before, after)
      const slip = tDrift ? null : presentStretch(before, after)
      if (tDrift) s.tenseDrift = tDrift
      else delete s.tenseDrift
      if (slip) s.tenseSlip = slip
      else delete s.tenseSlip
      if (!drift && !tDrift && !slip) continue
      s.outcome = 'written, needs review'
      await updateSubsection(s.subsectionId as string, { contentStatus: 'review' })
    }
    whatIfState.detail = ''
  }

  /** The writer, on the branch, over its blank scenes (each with its brief). */
  async function writePending(
    projectId: Id,
    branchId: Id,
    canon: string,
    planned: WhatIfPlan,
    targetWords: number
  ) {
    const { useBranchStore } = await import('../stores/branchStore')
    await useBranchStore().switchTo(projectId as string, branchId as string)
    const w = await writer()
    const { watch } = await import('vue')
    const stop = watch(
      () => w.progress.statusText,
      (t) => (whatIfState.detail = t),
      { immediate: true }
    )
    await w
      .writeWhatIf({
        projectId,
        canon,
        instructions: `WHAT IF: ${planned.premise}\nTHE CHANGE (now true): ${planned.divergenceFact}`,
        targetWords
      })
      .finally(() => {
        stop()
        whatIfState.detail = ''
      })
  }

  /**
   * "Rewrite this scene" (§40): write one flagged scene again, with every
   * missing event the who-is-where check found as a rule in its brief, then
   * check that scene again. The old text is kept for undo. A one-sentence
   * repair could not fix a chapter built on an event that never happened;
   * the scene has to be written knowing it did not.
   */
  function rewriteScene(projectId: Id, branchId: Id, subsectionId: Id) {
    return run('writing', 'Rewriting the scene', async () => {
      const b = await getBranchRow(branchId)
      const planned = b.whatIf.plan
      const s = planned?.scenes.find((x) => String(x.subsectionId) === String(subsectionId))
      if (!planned || !s || s.action === 'drop')
        throw new Error('That scene is not in this branch.')
      const scenes = await branchScenes(projectId, branchId)
      const { before } = splitAt(scenes, b.whatIf.divergenceId)
      const row = await tables.subsections.get(s.subsectionId)
      const old = String(row?.content || '')
      const src =
        s.sourceSubsectionId == null ? null : await tables.subsections.get(s.sourceSubsectionId)
      const srcProse = stripHtmlBlock(String(src?.content || ''))
      const brief = rewriteBrief(
        s,
        narrativePerson(srcProse).person,
        narrativeTense(srcProse).tense
      )
      const targetWords = Number(row?.wordCount) || countWords(stripHtmlBlock(old)) || 1200
      await updateSubsection(s.subsectionId as string, {
        description: brief,
        content: '',
        wordCount: 0,
        contentStatus: 'pending'
      })
      await deleteSceneDigest(projectId as string, s.subsectionId as string)
      await deleteSceneEntityStates(projectId as string, String(s.subsectionId))
      await writePending(projectId, branchId, branchCanon(planned, before), planned, targetWords)
      const now = await tables.subsections.get(s.subsectionId)
      if (!stripHtmlBlock(String(now?.content || ''))) {
        // Nothing written: put the scene back as it was.
        await updateSubsection(s.subsectionId as string, {
          content: old,
          wordCount: countWords(stripHtmlBlock(old)),
          contentStatus: 'review'
        })
        throw new Error('The writer produced nothing; the scene is unchanged.')
      }
      const ruled = [
        ...new Set((s.presenceIssues || []).filter((p) => !p.fromKept).map((p) => p.who))
      ]
      s.previousContent = old
      s.action = 'revise'
      s.brief = brief
      s.outcome = 'written'
      delete s.presenceIssues
      await verify(projectId, planned, s.subsectionId)
      // The rewrite was told these people never left. A sentence that still
      // puts one of them next to an absence breaks that rule even when they
      // are also in the scene -- the case the who-is-where question lets
      // through (a live rewrite kept "He thought of Zeena's absence, of the
      // way she'd left" and passed, §41).
      const prose = stripHtmlBlock(String(now?.content || ''))
      const { useStoryBibleStore } = await import('../stores/storyBibleStore')
      const characters = useStoryBibleStore().characters as Array<{
        name?: unknown
        aliases?: unknown
      }>
      for (const who of trackedCharacters(ruled.join(' '), characters)) {
        if (!ruled.includes(who.name)) continue
        const sentence = namedAbsence(prose, who)
        if (!sentence) continue
        s.outcome = 'written, needs review'
        s.presenceIssues = [
          ...(s.presenceIssues || []),
          {
            who: who.name,
            sentence,
            fact: `Rewritten with the rule that ${who.name} never left, but this sentence still has ${who.name} gone.`
          }
        ]
      }
      if (s.outcome === 'written, needs review')
        await updateSubsection(s.subsectionId as string, { contentStatus: 'review' })
      await saveMeta(branchId, { plan: planned })
      return planned
    })
  }

  /** Put back the text a "Rewrite this scene" replaced. */
  function undoRewrite(branchId: Id, subsectionId: Id) {
    return run('writing', 'Putting the scene back', async () => {
      const b = await getBranchRow(branchId)
      const planned = b.whatIf.plan
      const s = planned?.scenes.find((x) => String(x.subsectionId) === String(subsectionId))
      if (!planned || !s || s.previousContent == null) throw new Error('Nothing to undo.')
      await updateSubsection(s.subsectionId as string, {
        content: s.previousContent,
        wordCount: countWords(stripHtmlBlock(s.previousContent)),
        contentStatus: 'review'
      })
      delete s.previousContent
      s.outcome = 'written, needs review'
      await saveMeta(branchId, { plan: planned })
      return planned
    })
  }

  /** Carry out the plan in the branch, then check every scene after the change. */
  function write(projectId: Id, branchId: Id) {
    return run('writing', 'Rewriting the scenes the change reaches', async () => {
      const b = await getBranchRow(branchId)
      const planned = b.whatIf.plan
      if (!planned) throw new Error('Plan the branch first.')
      const scenes = await branchScenes(projectId, branchId)
      const { before } = splitAt(scenes, b.whatIf.divergenceId)

      // Scene lengths as written: the rewritten ones keep the book's pace.
      const revised = planned.scenes.filter((s) => s.action === 'revise')
      const lengths: number[] = []
      for (const s of revised) {
        const row = await tables.subsections.get(s.subsectionId)
        lengths.push(
          Number(row?.wordCount) || countWords(stripHtmlBlock(String(row?.content || '')))
        )
      }
      const sorted = lengths.filter((n) => n > 0).sort((a, b) => a - b)
      const targetWords = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1200

      for (const s of planned.scenes) {
        const id = s.subsectionId
        if (s.action === 'drop') {
          await deleteSubsection(id as string)
          s.outcome = 'dropped'
        } else if (s.action === 'revise') {
          // The writer keeps the original's narrative person (§44) and tense
          // (§45): a rewrite told in "he" or "walks" what the book tells in
          // "I" and "walked".
          const original = await tables.subsections.get(id)
          const prose = stripHtmlBlock(String(original?.content || ''))
          const rules = [
            povRule(narrativePerson(prose).person),
            tenseRule(narrativeTense(prose).tense)
          ]
            .filter(Boolean)
            .join('\n')
          await updateSubsection(id as string, {
            description: rules ? `${s.brief}\n${rules}` : s.brief,
            content: '',
            wordCount: 0,
            contentStatus: 'pending'
          })
        }
        if (s.action !== 'keep') {
          await deleteSceneDigest(projectId as string, id as string)
          await deleteSceneEntityStates(projectId as string, String(id))
        }
      }
      await saveMeta(branchId, { plan: planned, status: 'writing' })

      await writePending(projectId, branchId, branchCanon(planned, before), planned, targetWords)
      for (const s of revised) {
        const row = await tables.subsections.get(s.subsectionId)
        s.outcome = stripHtmlBlock(String(row?.content || '')) ? 'written' : 'failed'
      }

      await verify(projectId, planned)
      await saveMeta(branchId, { plan: planned, status: 'written' })
      return planned
    })
  }

  /** Check a written branch again (after the author has edited its scenes). */
  function recheck(projectId: Id, branchId: Id) {
    return run('checking', 'Checking every scene after the change against it', async () => {
      const b = await getBranchRow(branchId)
      const planned = b.whatIf.plan
      if (!planned) throw new Error('Plan the branch first.')
      for (const s of planned.scenes) {
        if (s.outcome === 'written, repaired' || s.outcome === 'written, needs review')
          s.outcome = 'written'
        if (s.outcome === 'repaired' || s.outcome === 'needs review') s.outcome = 'kept'
        delete s.presenceIssues
        delete s.povDrift
        delete s.tenseDrift
        delete s.tenseSlip
      }
      await verify(projectId, planned)
      await saveMeta(branchId, { plan: planned })
      return planned
    })
  }

  /** Source scene vs branch scene, for every scene the plan touched. */
  async function compare(projectId: Id, branchId: Id) {
    const b = await getBranchRow(branchId)
    const planned = b.whatIf.plan
    if (!planned) return []
    const rows = []
    for (const s of planned.scenes) {
      const source =
        s.sourceSubsectionId != null ? await tables.subsections.get(s.sourceSubsectionId) : null
      const copy = s.action === 'drop' ? null : await tables.subsections.get(s.subsectionId)
      const before = String(source?.content || '')
      const after = String(copy?.content || '')
      if (s.action === 'keep' && before === after) continue
      rows.push({
        sceneNumber: s.sceneNumber,
        title: s.title,
        chapterTitle: s.chapterTitle,
        action: s.action,
        outcome: s.outcome || null,
        sourceId: s.sourceSubsectionId,
        branchId: s.subsectionId,
        before,
        after
      })
    }
    return rows
  }

  /**
   * Copy the chosen scenes back onto the scenes they came from. Every source
   * scene is snapshotted first ("Before What If: ..."), so the history drawer
   * can restore it; a dropped scene is removed from the book after its
   * snapshot is taken.
   */
  function merge(projectId: Id, branchId: Id, sourceIds?: Id[]) {
    return run('merging', 'Bringing the chosen scenes into the book', async () => {
      const b = await getBranchRow(branchId)
      const chosen = new Set((sourceIds || []).map(String))
      const rows = await compare(projectId, branchId)
      let merged = 0
      for (const r of rows) {
        if (r.sourceId == null) continue
        if (sourceIds && !chosen.has(String(r.sourceId))) continue
        const label = `Before What If: ${b.whatIf.premise}`.slice(0, 120)
        if (r.before) await addSnapshot(projectId, r.sourceId, r.before, label)
        if (r.action === 'drop') {
          await deleteSubsection(r.sourceId as string)
        } else {
          await updateSubsection(r.sourceId as string, {
            content: r.after,
            wordCount: countWords(stripHtmlBlock(r.after))
          })
        }
        merged++
      }
      await saveMeta(branchId, { status: 'merged' })
      return merged
    })
  }

  /** Every What If branch of a project, newest first. */
  async function list(projectId: Id): Promise<WhatIfBranch[]> {
    const all = (await tables.branches.where({ projectId }).toArray()) as unknown as WhatIfBranch[]
    return all
      .filter((b) => b.whatIf)
      .sort((a, b) => String(b.whatIf.createdAt).localeCompare(String(a.whatIf.createdAt)))
  }

  return {
    fork,
    plan,
    savePlan,
    write,
    rewriteScene,
    undoRewrite,
    recheck,
    compare,
    merge,
    list,
    state: whatIfState
  }
}
