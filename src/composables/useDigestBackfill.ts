/**
 * Bring existing manuscripts into the digest layer.
 *
 * Scenes written before digests existed — and every hand-written or imported
 * chapter, which never passes through `CommitService.commitAndStoreScene` — have
 * no digest. Without a backfill the analysis paths silently fall back to the
 * per-scene LLM loop for exactly the manuscripts big enough to need them.
 *
 * Runs at idle priority. `awaitForegroundIdle` yields to generation, because a
 * background re-index that sits in front of the scene the author is waiting on
 * is worse than no backfill at all — the same reason `providerGate` carries a
 * foreground marker rather than a plain semaphore.
 *
 * No LLM calls: `buildSceneDigest` derives everything from prose plus whatever
 * metadata the scene already carries. A backfilled digest therefore has
 * `metadataStatus: 'skipped'` and weaker facts than one written at commit time —
 * which is honest, and better than nothing to analyse.
 *
 * Phase 3: Persistent queue with resumable progress. Work is enqueued in
 * `analysisQueue` table and processed at idle priority. Progress survives
 * tab close/crash and can be resumed.
 */
import { ref, computed } from 'vue'
import { getProjectDigests, putSceneDigest } from '../services/db-digests'
import { buildSceneDigest, isDigestStale } from '../services/generation/sceneDigest'
import { awaitForegroundIdle } from '../services/providerGate'
import { enqueueAnalysisTasks, claimNextAnalysisTask, completeAnalysisTask, failAnalysisTask, resetStuckAnalysisTasks, getAnalysisQueueStats, getAnalysisQueueItems, type AnalysisQueueItem } from '../services/analysisQueue'

export function useDigestBackfill() {
  const isRunning = ref(false)
  const processed = ref(0)
  const total = ref(0)
  const failed = ref(0)
  let cancelled = false

  function cancel() {
    cancelled = true
  }

  /**
   * Scenes with content but no fresh digest.
   *
   * Staleness is checked against the STRIPPED prose, because that is what the
   * digest was hashed from. Comparing against raw HTML made every scene look
   * stale forever and the backfill rewrote the whole manuscript on every run.
   */
  async function findPending(projectId: string, subsections: any[]) {
    const existing = await getProjectDigests(projectId)
    const byId = new Map(existing.map((d: any) => [d.subsectionId, d]))
    return (subsections || []).filter((s) => {
      const prose = stripHtml(s?.content)
      if (!prose) return false
      return isDigestStale(byId.get(s.id), prose)
    })
  }

  /**
   * Enqueue digest backfill tasks into the persistent analysis queue.
   * Returns the number of tasks enqueued.
   */
  async function enqueue(projectId: string, subsections: any[]) {
    if (!projectId) return 0
    const pending = await findPending(projectId, subsections)
    if (!pending.length) return 0

    const tasks = pending.map((sub) => ({
      taskType: 'sceneDigest' as const,
      payload: {
        projectId,
        subsectionId: sub.id,
        prose: stripHtml(sub.content),
        scene: {
          sceneNumber: sub.sceneNumber ?? sub.order ?? null,
          title: sub.title,
          charactersPresent: sub.charactersPresent,
          location: sub.location
        }
      }
    }))

    await enqueueAnalysisTasks(projectId, tasks)
    return tasks.length
  }

  /**
   * Run the backfill by processing enqueued tasks from the persistent queue.
   * Resumes from where it left off if previously interrupted.
   *
   * @returns how many digests were written.
   */
  async function run(projectId: string) {
    if (isRunning.value || !projectId) return 0
    cancelled = false
    isRunning.value = true
    processed.value = 0
    failed.value = 0

    // Reset any stuck 'running' items from a previous crash
    await resetStuckAnalysisTasks(projectId)

    try {
      let totalProcessed = 0
      while (!cancelled) {
        const task = await claimNextAnalysisTask(projectId)
        if (!task) break // No more pending tasks

        await awaitForegroundIdle()
        if (cancelled) break

        try {
          const payload = task.payload as any
          const prose = payload.prose
          if (!prose) throw new Error('No prose in task payload')

          await putSceneDigest(
            buildSceneDigest({
              projectId,
              subsectionId: payload.subsectionId,
              prose,
              structured: { summary: payload.summary || '', metadataStatus: 'skipped' },
              scene: payload.scene
            })
          )

          await completeAnalysisTask(task.id!)
          totalProcessed++
          processed.value++
        } catch (err: any) {
          failed.value++
          totalProcessed++
          processed.value++
          await failAnalysisTask(task.id!, err?.message || String(err))
        }
      }

      processed.value = totalProcessed
      return totalProcessed
    } catch (err) {
      // Re-throw to propagate error to caller (e.g., for test that expects rejection)
      isRunning.value = false
      throw err
    } finally {
      isRunning.value = false
    }
  }

  const stats = computed(() => getAnalysisQueueStats)

  return {
    enqueue,
    run,
    cancel,
    isRunning,
    processed,
    total: computed(() => total.value),
    failed,
    stats,
    getItems: (projectId: string) => getAnalysisQueueItems(projectId)
  }
}

function stripHtml(html: any): string {
  return String(html ?? '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
