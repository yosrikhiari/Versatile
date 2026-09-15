/**
 * v48 metadata helpers (Obsidian Properties / Longform scene-context analog).
 *
 * `backfillSceneContextV48` hydrates the editable scene-context columns
 * (charactersPresent / location / wordCount) on subsections from the derived
 * scene-digest layer. It is idempotent — it only fills EMPTY fields and never
 * clobbers a writer's manual edit. This is the single hydration path; the
 * digest rebuild (sceneAnalysis.writeSceneAnalysis) reads these columns back.
 */
import { getSubsections, updateSubsection } from './db-structure'
import { getProjectDigests } from './db-digests'
import { countWords as countProseWords } from '../utils/textUtils'

export function countWords(text: string | null | undefined): number {
  return countProseWords(text)
}

function isEmpty(value: any): boolean {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * Fill empty scene-context columns on every subsection of a project from its
 * scene digests. Returns the number of subsections that were updated.
 */
export async function backfillSceneContextV48(projectId: string): Promise<number> {
  const [subsections, digests] = await Promise.all([
    getSubsections(projectId),
    getProjectDigests(projectId)
  ])
  if (!subsections.length) return 0

  const digestBySubsection = new Map<string, any>()
  for (const d of digests) {
    if (d?.subsectionId) digestBySubsection.set(d.subsectionId, d)
  }

  let updated = 0
  for (const sub of subsections) {
    const digest = digestBySubsection.get(sub.id)
    const patch: any = {}

    if (isEmpty(sub.charactersPresent) && digest?.charactersPresent?.length) {
      patch.charactersPresent = digest.charactersPresent
    }
    if (isEmpty(sub.location) && digest?.location) {
      patch.location = digest.location
    }
    if (isEmpty(sub.wordCount)) {
      const fromDigest = digest?.wordCount
      const fromContent = sub.content ? countWords(sub.content) : 0
      const wc = fromDigest ?? fromContent
      if (wc) patch.wordCount = wc
    }

    if (Object.keys(patch).length) {
      await updateSubsection(sub.id, patch)
      updated++
    }
  }

  return updated
}
