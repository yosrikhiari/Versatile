/**
 * The artifacts a generation run must leave behind, beyond prose.
 *
 * A WAL-level audit of a real run found it wrote exactly four object stores:
 * `subsections` (the prose), `storyDocuments` (an auto style-guide regen fired
 * as a side effect of saving a subsection), and two embedding caches. Nothing
 * else. In particular:
 *
 *   - `snapshots` was empty, so a run that rewrote thirteen scenes had no
 *     rollback point anywhere. That is a data-loss risk with nothing to do with
 *     quality.
 *   - `storyStateSnapshots` was empty, which is what `useContextRetrieval` reads
 *     for cross-session memory — so every run left nothing for the next one to
 *     build on, independently of the story-bible bug.
 *   - `sessionArchive` was empty, so there was no run history to retrieve.
 *
 * These are separate from the `EMPTY_METADATA` chain: those tables were never
 * wired to generation at all, so fixing the metadata path does not fix them.
 *
 * Everything here is best-effort and never throws — a failed artifact must not
 * lose a written volume. But unlike the code this replaces, failures are
 * *returned* rather than swallowed, so `runHealth` can count them and the run
 * can report that it did not fully deliver.
 */

import { addSnapshot } from '../db-snapshots'
import { saveStateSnapshot, saveSessionArchive } from '../db-archive'
import { ARCHIVE_TYPES, SIGNAL } from '../../config/archive'

export interface ArtifactOutcome {
  ok: boolean
  detail: string
}

/**
 * Capture a restore point for every chapter that already has content, before a
 * run is allowed to overwrite any of it.
 *
 * Deliberately per-section rather than one blob: `snapshots` is keyed by
 * `[projectId+chapterId]` and the restore UI works a chapter at a time, so a
 * single combined record would not be restorable through any existing path.
 *
 * Empty chapters are skipped — there is nothing to lose, and a snapshot per
 * empty chapter would bury the useful ones in the restore list.
 */
export async function snapshotBeforeRun(
  projectId: any,
  sections: any[],
  label = 'Before generation'
): Promise<ArtifactOutcome & { count: number }> {
  if (!projectId || !Array.isArray(sections)) {
    return { ok: true, count: 0, detail: 'nothing to snapshot' }
  }

  let count = 0
  const failures: string[] = []
  for (const section of sections) {
    const content = section?.content
    if (!content || !String(content).trim()) continue
    try {
      await addSnapshot(projectId, section.id, content, label)
      count++
    } catch (err: any) {
      failures.push(`${section?.title || section?.id}: ${err?.message || err}`)
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      count,
      detail: `snapshotted ${count}, failed ${failures.length}: ${failures.join('; ')}`
    }
  }
  return {
    ok: true,
    count,
    detail: count ? `${count} chapter snapshot(s) taken` : 'no existing content to snapshot'
  }
}

/**
 * Persist the end-of-run story state.
 *
 * `useContextRetrieval.getContextPackage` reads the latest state snapshot as one
 * of its three context sources; with the table empty it silently contributed
 * nothing, and the run's own outcome was invisible to the next session.
 */
export async function saveRunStateSnapshot(
  projectId: any,
  state: any
): Promise<ArtifactOutcome> {
  if (!projectId || !state) return { ok: true, detail: 'no state to save' }
  try {
    // `sessionId` is nullable in the schema and no run-level session id exists
    // yet; the timestamp is what the retrieval path orders by.
    await saveStateSnapshot(projectId, null, state)
    return { ok: true, detail: 'state snapshot saved' }
  } catch (err: any) {
    return { ok: false, detail: `state snapshot: ${err?.message || err}` }
  }
}

/**
 * Record the run in the session archive.
 *
 * Signal is derived, not assumed: a run that tripped invariants is `partial`,
 * not `accepted`. `getSessionArchive` filters on `minSignal`, so mislabelling a
 * degraded run as accepted would feed it back into future context as though it
 * had gone well.
 */
export async function archiveRun(
  projectId: any,
  summary: {
    scenesWritten: number
    wordCount: number
    degradationSummary?: string
    violations?: Array<{ severity: string; message: string }>
    halted?: boolean
  }
): Promise<ArtifactOutcome> {
  if (!projectId) return { ok: true, detail: 'no project' }

  const blocking = (summary.violations || []).filter((v) => v.severity === 'block')
  const signal = summary.halted || blocking.length > 0 ? SIGNAL.PARTIAL : SIGNAL.ACCEPTED

  try {
    await saveSessionArchive(
      projectId,
      ARCHIVE_TYPES.SESSION_END,
      {
        scenesWritten: summary.scenesWritten,
        wordCount: summary.wordCount,
        degradation: summary.degradationSummary || '',
        violations: (summary.violations || []).map((v) => v.message),
        halted: !!summary.halted
      },
      ['generation'],
      signal
    )
    return { ok: true, detail: `run archived (${signal})` }
  } catch (err: any) {
    return { ok: false, detail: `session archive: ${err?.message || err}` }
  }
}
