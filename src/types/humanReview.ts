export type RubricVersion = 'v1'
export type RubricMark = 'Problem' | 'Fine' | 'Unsure'
export type OverallMark = 'Keep' | 'Revise'
export type RubricDimension = 'continuity' | 'voice' | 'show_tell' | 'pacing' | 'emotional_goal'

export interface HumanReviewScene {
  sceneId: string
  sceneTitle: string
  text: string
  brief?: string
  facts?: string[]
  source?: string
}

export interface HumanReviewPack {
  studyId: string
  rubricVersion: RubricVersion
  title: string
  description?: string
  packHash: string
  scenes: HumanReviewScene[]
}

/** The imported pack, persisted locally so a session can resume. */
export interface HumanReviewStudyRecord {
  id?: number
  studyId: string
  rubricVersion: RubricVersion
  title: string
  description?: string
  packHash: string
  scenes: HumanReviewScene[]
  importedAt: string
}

export type HumanReviewSessionStatus = 'in-progress' | 'complete'

export interface HumanReviewSession {
  id?: number
  studyRecordId: number
  studyId: string
  packHash: string
  raterId: string
  passLabel: string
  status: HumanReviewSessionStatus
  startedAt: string
  updatedAt: string
  completedAt?: string
  /**
   * Consent is recorded as a version plus a timestamp — never a name,
   * signature or free text. A session created before this field exists has
   * none and is asked again before it can resume.
   */
  consentVersion?: string
  consentedAt?: string
}

export interface HumanReviewResponse {
  id?: number
  sessionId: number
  sceneId: string
  overall: OverallMark
  dims: Record<RubricDimension, RubricMark>
  note: string
  createdAt: string
  updatedAt: string
}

/** One row shape consumed by `tools/labelling/agreement.py`. */
export interface RaterLabelRow {
  sceneId: string
  overall: OverallMark
  dims: Record<RubricDimension, RubricMark>
  note: string
  labeller: string
  studyId: string
  rubricVersion: RubricVersion
  packHash: string
  pass: string
}

export interface HumanReviewExport {
  studyId: string
  rubricVersion: RubricVersion
  packHash: string
  raterId: string
  pass: string
  sessionId: number
  exportedAt: string
  labels: RaterLabelRow[]
}
