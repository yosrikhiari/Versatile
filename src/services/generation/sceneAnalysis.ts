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
    const norm = (s: any) => String(s ?? '').trim().toLowerCase()

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

  let digest: SceneDigest | null = null
  try {
    digest = buildSceneDigest({ projectId, subsectionId, prose, structured, scene })
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

  return { digest, stateCount, errors }
}
