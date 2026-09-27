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
import { FEATURES } from '../config/ai'
import {
  PLAN_SCHEMA,
  PLAN_SYSTEM,
  planPrompt,
  cleanPlan,
  branchCanon,
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
      const raw = await aiGenerateJson(
        planPrompt({
          bookTitle: String(project?.name || 'Untitled'),
          premise: b.whatIf.premise,
          before,
          divergence,
          later
        }),
        PLAN_SYSTEM,
        {
          feature: FEATURES.STORY_GENERATION,
          role: 'utility',
          temperature: 0.3,
          schema: PLAN_SCHEMA,
          schemaName: 'what_if_plan'
        }
      ).catch(() => null)
      const planned = cleanPlan(raw, b.whatIf.premise, divergence, later)
      await saveMeta(branchId, { plan: planned, status: 'planned' })
      return planned
    })
  }

  /** The author's edits to the plan (actions, briefs). */
  async function savePlan(branchId: Id, planned: WhatIfPlan) {
    await saveMeta(branchId, { plan: planned })
  }

  /** Carry out the plan in the branch, then check what was kept. */
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
          await updateSubsection(id as string, {
            description: s.brief,
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
          canon: branchCanon(planned, before),
          instructions: `WHAT IF: ${planned.premise}\nTHE CHANGE (now true): ${planned.divergenceFact}`,
          targetWords
        })
        .finally(() => {
          stop()
          whatIfState.detail = ''
        })
      for (const s of revised) {
        const row = await tables.subsections.get(s.subsectionId)
        s.outcome = stripHtmlBlock(String(row?.content || '')) ? 'written' : 'failed'
      }

      // The kept scenes after the change, checked against it.
      whatIfState.phase = 'checking'
      whatIfState.message = 'Checking the scenes that were kept'
      const { useStoryCritic } = await import('./useStoryCritic')
      const { useStoryBibleStore } = await import('../stores/storyBibleStore')
      const critic = useStoryCritic()
      const characters = useStoryBibleStore().characters
      for (const s of planned.scenes.filter((x) => x.action === 'keep')) {
        const row = await tables.subsections.get(s.subsectionId)
        let html = String(row?.content || '')
        const report = await critic
          .checkContradictions({
            characters,
            locations: [],
            sceneProse: [{ prose: stripHtmlBlock(html), chapterNumber: null }],
            synopsis: '',
            ledger: [planned.divergenceFact]
          })
          .catch(() => null)
        const pairs = (report?.characterIssues || []).flatMap(
          (i: { contradictions: Array<{ between: string[] }> }) =>
            i.contradictions.map((c) => c.between)
        )
        if (!pairs.length) {
          s.outcome = 'kept'
          continue
        }
        let allFixed = true
        for (const [sentence, fact] of pairs) {
          const fixed = await critic.repairSentence(sentence, fact)
          const r =
            fixed == null ? { html, replaced: false } : replaceSentenceInHtml(html, sentence, fixed)
          allFixed = allFixed && r.replaced
          html = r.html
        }
        await updateSubsection(s.subsectionId as string, {
          content: html,
          wordCount: countWords(stripHtmlBlock(html)),
          ...(allFixed ? {} : { contentStatus: 'review' })
        })
        s.outcome = allFixed ? 'repaired' : 'needs review'
      }
      await saveMeta(branchId, { plan: planned, status: 'written' })
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

  return { fork, plan, savePlan, write, compare, merge, list, state: whatIfState }
}
