import { db } from './db-core'
import type {
  HumanReviewPack,
  HumanReviewResponse,
  HumanReviewSession,
  HumanReviewStudyRecord
} from '../types/humanReview'

/**
 * Local-only persistence for the human-review pilot.
 *
 * These rows never enter `SYNC_ENTITIES` and never touch cloud escalation.
 * A participant's labels stay on the supervised device until the facilitator
 * exports the raw JSON.
 */
export async function saveStudy(pack: HumanReviewPack): Promise<HumanReviewStudyRecord> {
  const existing = await db.humanReviewStudies
    .where('[studyId+packHash]')
    .equals([pack.studyId, pack.packHash])
    .first()
  if (existing) return existing as HumanReviewStudyRecord

  const record: HumanReviewStudyRecord = {
    studyId: pack.studyId,
    rubricVersion: pack.rubricVersion,
    title: pack.title,
    ...(pack.description ? { description: pack.description } : {}),
    packHash: pack.packHash,
    scenes: pack.scenes,
    importedAt: new Date().toISOString()
  }
  const id = await db.humanReviewStudies.add(record)
  return { ...record, id }
}

export async function getStudies(): Promise<HumanReviewStudyRecord[]> {
  return db.humanReviewStudies.orderBy('importedAt').reverse().toArray()
}

export async function getStudy(id: number): Promise<HumanReviewStudyRecord | undefined> {
  return db.humanReviewStudies.get(id)
}

export async function findSession(
  studyId: string,
  packHash: string,
  raterId: string,
  passLabel: string
): Promise<HumanReviewSession | undefined> {
  return db.humanReviewSessions
    .where('[studyId+packHash+raterId+passLabel]')
    .equals([studyId, packHash, raterId, passLabel])
    .first()
}

export async function createSession(
  input: Omit<HumanReviewSession, 'id' | 'startedAt' | 'updatedAt' | 'status'>
): Promise<HumanReviewSession> {
  const now = new Date().toISOString()
  const record: HumanReviewSession = {
    ...input,
    status: 'in-progress',
    startedAt: now,
    updatedAt: now
  }
  const id = await db.humanReviewSessions.add(record)
  return { ...record, id }
}

export async function getSessions(): Promise<HumanReviewSession[]> {
  return db.humanReviewSessions.orderBy('updatedAt').reverse().toArray()
}

export async function getSession(id: number): Promise<HumanReviewSession | undefined> {
  return db.humanReviewSessions.get(id)
}

export async function getResponses(sessionId: number): Promise<HumanReviewResponse[]> {
  return db.humanReviewResponses.where('sessionId').equals(sessionId).toArray()
}

export async function saveResponse(
  sessionId: number,
  response: Omit<HumanReviewResponse, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>
): Promise<HumanReviewResponse> {
  const existing = await db.humanReviewResponses
    .where('[sessionId+sceneId]')
    .equals([sessionId, response.sceneId])
    .first()
  const now = new Date().toISOString()
  const record: HumanReviewResponse = {
    ...response,
    sessionId,
    ...(existing ? { id: existing.id, createdAt: existing.createdAt } : { createdAt: now }),
    updatedAt: now
  }
  if (existing) {
    await db.humanReviewResponses.put(record)
  } else {
    record.id = await db.humanReviewResponses.add(record)
  }
  await db.humanReviewSessions.update(sessionId, { updatedAt: now })
  return record
}

export async function completeSession(sessionId: number): Promise<HumanReviewSession | undefined> {
  const now = new Date().toISOString()
  await db.humanReviewSessions.update(sessionId, {
    status: 'complete',
    completedAt: now,
    updatedAt: now
  })
  return getSession(sessionId)
}

/** Record that the participant accepted this consent version, and when. */
export async function markSessionConsented(
  sessionId: number,
  consentVersion: string
): Promise<HumanReviewSession | undefined> {
  const now = new Date().toISOString()
  await db.humanReviewSessions.update(sessionId, {
    consentVersion,
    consentedAt: now,
    updatedAt: now
  })
  return getSession(sessionId)
}

export async function deleteSession(sessionId: number): Promise<void> {
  await db.transaction('rw', db.humanReviewSessions, db.humanReviewResponses, async () => {
    await db.humanReviewResponses.where('sessionId').equals(sessionId).delete()
    await db.humanReviewSessions.delete(sessionId)
  })
}
