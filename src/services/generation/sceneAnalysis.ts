/**
 * The one place a scene's derived artifacts are written.
 *
 * A scene digest and its entity states are the same derivation from the same
 * inputs at the same moment — splitting them across call sites is how the
 * digest layer ended up with two writers and the state layer with none. Both
 * the generation commit path and the backfill queue go through here, so a scene
 * can never end up with a digest and no states.
 *
 * Best-effort by contract. These are optimisations for later analysis; neither
 * may ever be the thing that loses a committed scene, so every failure is
 * reported to the caller rather than thrown.
 */

import { buildSceneDigest, type SceneDigest } from './sceneDigest'
import { deriveEntityStates, type EntityStateType } from './entityStates'
import { putSceneDigest, replaceSceneEntityStates } from '../db-digests'
import { db } from '../db-core'
import { countWords } from '../../utils/textUtils'

export interface SceneAnalysisResult {
  digest: SceneDigest | null
  stateCount: number
  /** Non-fatal failures, for the caller's health ledger. */
  errors: string[]
}

/**
 * Name → story-bible id, for the entity types that have bible records.
 *
 * Loaded lazily so this module stays importable without a Pinia instance — the
 * backfill queue runs outside component setup, and tests import the derivation
 * with no store at all. A missing store is not an error: unresolved names fall
 * back to name-derived keys, which is exactly what objects always use.
 */
async function buildBibleResolver(): Promise<
  ((type: EntityStateType, name: string) => string | number | null) | undefined
> {
  try {
    const { useStoryBibleStore } = await import('../../stores/storyBibleStore')
    const bible: any = useStoryBibleStore()
    const norm = (s: any) =>
      String(s ?? '')
        .trim()
        .toLowerCase()

    const maps: Record<string, Map<string, any>> = {
      character: new Map((bible.characters || []).map((c: any) => [norm(c.name), c.id])),
      location: new Map((bible.locations || []).map((l: any) => [norm(l.name), l.id])),
      plotThread: new Map((bible.plotThreads || []).map((t: any) => [norm(t.title), t.id]))
    }

    return (type, name) => maps[type]?.get(norm(name)) ?? null
  } catch {
    return undefined
  }
}

export async function writeSceneAnalysis({
  projectId,
  subsectionId,
  prose,
  structured,
  scene
}: {
  projectId: string
  subsectionId: string
  prose: string
  structured?: any
  scene?: any
}): Promise<SceneAnalysisResult> {
  const errors: string[] = []
  if (!projectId || !subsectionId) {
    return { digest: null, stateCount: 0, errors: ['missing projectId or subsectionId'] }
  }

  // Single authority for scene context (schema v49). The subsection's own
  // `pov` / `location` / `charactersPresent` columns are the author's; when
  // they are set they win over whatever the writer reported, and when they are
  // empty the digest's values hydrate them so the next edit starts from what
  // the prose actually did. Best-effort: a missing row (tests, imports) means
  // the digest is built from the writer's metadata alone, as before.
  let row: any = null
  try {
    row = await db.subsections.get(subsectionId as any)
  } catch {
    row = null
  }
  const sceneForDigest = row
    ? {
        ...(scene || {}),
        ...(row.pov ? { pov: row.pov } : {}),
        ...(row.location ? { location: row.location } : {}),
        ...(Array.isArray(row.charactersPresent) && row.charactersPresent.length
          ? { charactersPresent: row.charactersPresent }
          : {})
      }
    : scene
  const structuredForDigest =
    row && Array.isArray(row.charactersPresent) && row.charactersPresent.length
      ? {
          ...(structured || {}),
          usedEntities: {
            ...((structured || {}).usedEntities || {}),
            characterNames: row.charactersPresent
          }
        }
      : structured

  let digest: SceneDigest | null = null
  try {
    digest = buildSceneDigest({
      projectId,
      subsectionId,
      prose,
      structured: structuredForDigest,
      scene: sceneForDigest
    })
    await putSceneDigest(digest)
  } catch (err: any) {
    errors.push(`scene digest not written: ${err?.message || err}`)
    // Without a digest there is nothing to derive states from.
    return { digest: null, stateCount: 0, errors }
  }

  let stateCount = 0
  try {
    const resolve = await buildBibleResolver()
    const states = deriveEntityStates({ projectId, digest, resolve })
    // Replace even when empty: a rewrite that removes a death must remove the
    // row that recorded it, or the timeline keeps asserting text that is gone.
    stateCount = await replaceSceneEntityStates(projectId, String(subsectionId), states)
  } catch (err: any) {
    errors.push(`entity states not written: ${err?.message || err}`)
  }

  // Hydrate the empty columns from what was just derived — fill only, never
  // overwrite. `wordCount` is recomputed from the committed prose so a
  // rewrite of the same scene corrects it.
  if (row) {
    try {
      const patch: any = {}
      if (!row.pov && digest.pov) patch.pov = digest.pov
      if (!row.location && digest.location) patch.location = digest.location
      if (
        (!Array.isArray(row.charactersPresent) || row.charactersPresent.length === 0) &&
        digest.charactersPresent.length
      ) {
        patch.charactersPresent = digest.charactersPresent
      }
      const wc = countWords(prose)
      if (wc && row.wordCount !== wc) patch.wordCount = wc
      if (Object.keys(patch).length) await db.subsections.update(subsectionId as any, patch)
    } catch (err: any) {
      errors.push(`scene context not hydrated: ${err?.message || err}`)
    }
  }

  return { digest, stateCount, errors }
}
