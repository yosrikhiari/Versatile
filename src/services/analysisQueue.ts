/**
 * Persistent Analysis Queue — idle-priority work queue with resumable progress.
 *
 * The digest backfill and other analysis tasks run at idle priority (yielding to
 * foreground generation via `awaitForegroundIdle`). This queue persists work items
 * to IndexedDB so progress survives tab close, crash, or browser restart.
 *
 * Each queue item is a unit of work (e.g., "build scene digest for subsection X").
 * Items are processed at idle priority via `awaitForegroundIdle` and status is
 * tracked for resumable progress reporting.
 */

import { db as _db } from './db-core'

const db = _db as any

export type AnalysisTaskType = 'sceneDigest' | 'chapterDigest' | 'volumeDigest' | 'entityStates' | 'contradictionCheck' | 'custom'

export interface AnalysisQueueItem {
  id?: number
  projectId: string
  taskType: AnalysisTaskType
  /** Opaque payload specific to the task type. */
  payload: Record<string, unknown>
  /** 'pending' | 'running' | 'completed' | 'failed' */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Progress within this item (0-100). */
  progress?: number
  /** Error message if failed. */
  error?: string
  /** When the item was created. */
  createdAt: string
  /** When the item was last updated. */
  updatedAt: string
  /** How many times this item has been retried. */
  retryCount?: number
  /** Max retries before giving up. */
  maxRetries?: number
}

/**
 * Enqueue a batch of analysis tasks.
 * Returns the IDs of the created items.
 */
export async function enqueueAnalysisTasks(
  projectId: string,
  tasks: Array<{ taskType: AnalysisTaskType; payload: Record<string, unknown>; maxRetries?: number }>
): Promise<number[]> {
  if (!tasks.length) return []
  const now = new Date().toISOString()
  const items = tasks.map((t) => ({
    projectId,
    taskType: t.taskType,
    payload: t.payload,
    status: 'pending' as const,
    progress: 0,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    maxRetries: t.maxRetries ?? 3
  }))
  const ids = await db.analysisQueue.bulkAdd(items)
  return ids as number[]
}

/**
 * Get the next pending item for a project, mark it running, and return it.
 * Returns null if no pending items.
 */
export async function claimNextAnalysisTask(projectId: string): Promise<AnalysisQueueItem | null> {
  // Find first pending item
  const item = await db.analysisQueue
    .where('[projectId+status]')
    .equals([projectId, 'pending'])
    .first()
  if (!item) return null

  // Atomically claim it
  const updated = await db.analysisQueue.update(item.id, {
    status: 'running',
    progress: 0,
    updatedAt: new Date().toISOString()
  })
  if (!updated) return null // Race condition, try again

  return { ...item, status: 'running', progress: 0, updatedAt: new Date().toISOString() }
}

/**
 * Update progress of a running item.
 */
export async function updateAnalysisTaskProgress(
  id: number,
  progress: number
): Promise<void> {
  await db.analysisQueue.update(id, {
    progress: Math.max(0, Math.min(100, progress)),
    updatedAt: new Date().toISOString()
  })
}

/**
 * Mark an item as completed.
 */
export async function completeAnalysisTask(id: number): Promise<void> {
  await db.analysisQueue.update(id, {
    status: 'completed',
    progress: 100,
    updatedAt: new Date().toISOString()
  })
}

/**
 * Mark an item as failed, with optional retry.
 * If retries remain, resets to 'pending' for retry.
 */
export async function failAnalysisTask(
  id: number,
  error: string
): Promise<void> {
  const item = await db.analysisQueue.get(id)
  if (!item) return

  const retries = (item.retryCount ?? 0) + 1
  const maxRetries = item.maxRetries ?? 3

  if (retries >= maxRetries) {
    await db.analysisQueue.update(id, {
      status: 'failed',
      error,
      retryCount: retries,
      updatedAt: new Date().toISOString()
    })
  } else {
    await db.analysisQueue.update(id, {
      status: 'pending',
      error,
      retryCount: retries,
      progress: 0,
      updatedAt: new Date().toISOString()
    })
  }
}

/**
 * Get queue statistics for a project.
 */
export async function getAnalysisQueueStats(projectId: string): Promise<{
  total: number
  pending: number
  running: number
  completed: number
  failed: number
  totalProgress: number // 0-100 average across all items
}> {
  const items = await db.analysisQueue.where('projectId').equals(projectId).toArray()
  const stats = { total: items.length, pending: 0, running: 0, completed: 0, failed: 0, totalProgress: 0 }
  let progressSum = 0
  for (const item of items) {
    stats[item.status as keyof typeof stats]++
    progressSum += item.progress ?? 0
  }
  stats.totalProgress = items.length ? Math.round(progressSum / items.length) : 0
  return stats
}

/**
 * Get all items for a project (for UI display).
 */
export async function getAnalysisQueueItems(projectId: string): Promise<AnalysisQueueItem[]> {
  return db.analysisQueue.where('projectId').equals(projectId).sortBy('createdAt')
}

/**
 * Clear completed/failed items for a project (cleanup).
 */
export async function clearAnalysisQueueHistory(projectId: string, keepFailed = false): Promise<number> {
  const toDelete = await db.analysisQueue
    .where('projectId')
    .equals(projectId)
    .filter((item: any) => item.status === 'completed' || (keepFailed ? false : item.status === 'failed'))
    .primaryKeys()
  if (toDelete.length) {
    await db.analysisQueue.bulkDelete(toDelete)
  }
  return toDelete.length
}

/**
 * Reset stuck 'running' items back to 'pending' (e.g., after crash).
 */
export async function resetStuckAnalysisTasks(projectId: string): Promise<number> {
  const stuck = await db.analysisQueue
    .where('[projectId+status]')
    .equals([projectId, 'running'])
    .toArray()
  if (!stuck.length) return 0

  await db.transaction('rw', db.analysisQueue, async () => {
    for (const item of stuck) {
      await db.analysisQueue.update(item.id, {
        status: 'pending',
        progress: 0,
        updatedAt: new Date().toISOString()
      })
    }
  })
  return stuck.length
}

/**
 * Re-queue all failed items for a project (retry).
 */
export async function retryFailedAnalysisTasks(projectId: string): Promise<number> {
  const failed = await db.analysisQueue
    .where('[projectId+status]')
    .equals([projectId, 'failed'])
    .toArray()
  if (!failed.length) return 0

  await db.transaction('rw', db.analysisQueue, async () => {
    for (const item of failed) {
      await db.analysisQueue.update(item.id, {
        status: 'pending',
        error: undefined,
        retryCount: 0,
        progress: 0,
        updatedAt: new Date().toISOString()
      })
    }
  })
  return failed.length
}