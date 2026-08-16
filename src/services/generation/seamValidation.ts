/**
 * Generation-time seam continuity check.
 *
 * The anchor phase of useVolumeStoryGenerator asks the model to carry cast across
 * chapter boundaries via prompt text only (openingConstraints / closingConstraints
 * at useVolumeStoryGenerator.ts:2118). Nothing verified it — the model was trusted
 * to honour the instruction. This module turns each generated anchor scene into the
 * same EntityStateRecord timeline the consistency engine consumes, then runs the
 * REAL engine seam rules (checkChapterSeam + checkSeamContinuity) over it and
 * returns advisory warnings.
 *
 * Deliberately non-blocking: a warning tells the author that a character present at
 * the end of one chapter does not appear in the next with no recorded departure —
 * the author judges whether the exit was deliberate. This is the generation-side
 * counterpart to the fixture validation in scripts/validate-100-chapter.mjs, so the
 * guarantee now holds for real LLM output, not just the test fixture.
 */

import type { EntityStateRecord } from './entityStates'
import { deriveEntityStates } from './entityStates'
import { checkChapterSeam, checkSeamContinuity } from './deterministicContradictions'

/** A single generated scene, in the shape deriveEntityStates reads. */
export interface SeamSceneDigest {
  projectId: string
  subsectionId: string
  chapterNumber: number
  sceneNumber: number
  location?: string | null
  /** Who is on stage in this scene (from the scene plan / brief). */
  charactersPresent: string[]
  keyFacts?: string[]
  summary?: string
  facts?: { characters?: string[]; objects?: string[] }
}

export interface SeamWarning {
  kind: 'chapter' | 'scene'
  /** For chapter seams: the earlier chapter of the broken boundary. */
  chapterNumber: number
  entityName: string
  description: string
}

/**
 * Derive entity states from the supplied anchor-scene digests and run the engine's
 * seam rules. Returns advisory seam_disconnect warnings.
 *
 * Pure and total: an empty or malformed digest list yields no states and no
 * warnings, so it is safe to call on every chapter's accumulated scenes without
 * ever being the thing that loses a scene.
 */
export function deriveSeamWarnings(digests: SeamSceneDigest[]): SeamWarning[] {
  if (!digests.length) return []

  const states: EntityStateRecord[] = digests.flatMap((d) =>
    deriveEntityStates({ projectId: d.projectId, digest: d })
  )

  const chapterByScene = new Map<string, number>()
  for (const d of digests) chapterByScene.set(d.subsectionId, d.chapterNumber)

  const contradictions = [
    ...checkChapterSeam(states),
    ...checkSeamContinuity(states)
  ].filter((c) => c.type === 'seam_disconnect')

  const warnings: SeamWarning[] = []
  for (const c of contradictions) {
    let kind: 'chapter' | 'scene' = 'scene'
    let chapterNumber = chapterByScene.get(c.sceneIds[0]) ?? 0

    // Chapter seams state their boundary explicitly: "...present at the end of
    // chapter N but does not appear in chapter M". The earlier chapter is N.
    const m = c.description.match(/chapter (\d+) but does not appear in chapter (\d+)/i)
    if (m) {
      kind = 'chapter'
      chapterNumber = Number(m[1])
    }

    warnings.push({
      kind,
      chapterNumber,
      entityName: c.entityName ?? '',
      description: c.description
    })
  }

  return warnings
}
