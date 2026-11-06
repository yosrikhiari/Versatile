import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  completeSession,
  createSession,
  deleteSession,
  findSession,
  getResponses,
  getSession,
  getSessions,
  getStudies,
  getStudy,
  saveResponse as persistResponse,
  saveStudy
} from '../services/db-human-review'
import {
  RUBRIC_DIMENSIONS,
  orderScenesForRater,
  parseStudyPack,
  validatePassLabel,
  validateRaterId
} from '../services/humanReviewPack'
import { buildHumanReviewExport } from '../services/humanReviewExport'
import type {
  HumanReviewExport,
  HumanReviewResponse,
  HumanReviewScene,
  HumanReviewSession,
  HumanReviewStudyRecord,
  OverallMark,
  RubricDimension,
  RubricMark
} from '../types/humanReview'

const OVERALL: OverallMark[] = ['Keep', 'Revise']
const MARKS: RubricMark[] = ['Problem', 'Fine', 'Unsure']

export interface ResponseDraft {
  overall: OverallMark | null
  dims: Partial<Record<RubricDimension, RubricMark>>
  note: string
}

export const useHumanReviewStore = defineStore('humanReview', () => {
  const studies = ref<HumanReviewStudyRecord[]>([])
  const sessions = ref<HumanReviewSession[]>([])
  const sessionProgress = ref<Record<number, number>>({})
  const activeStudy = ref<HumanReviewStudyRecord | null>(null)
  const activeSession = ref<HumanReviewSession | null>(null)
  const responses = ref<HumanReviewResponse[]>([])
  const sceneOrder = ref<HumanReviewScene[]>([])
  const loading = ref(false)
  const error = ref('')

  const currentSceneIndex = computed(() => {
    const answered = new Set(responses.value.map((response) => response.sceneId))
    return sceneOrder.value.findIndex((scene) => !answered.has(scene.sceneId))
  })
  const currentScene = computed(() =>
    currentSceneIndex.value >= 0 ? sceneOrder.value[currentSceneIndex.value] : null
  )
  const progress = computed(() =>
    sceneOrder.value.length ? responses.value.length / sceneOrder.value.length : 0
  )
  const isComplete = computed(
    () =>
      activeSession.value?.status === 'complete' ||
      (sceneOrder.value.length > 0 && responses.value.length >= sceneOrder.value.length)
  )
  const inProgressSessions = computed(() =>
    sessions.value.filter((session) => session.status === 'in-progress')
  )
  const completedSessions = computed(() =>
    sessions.value.filter((session) => session.status === 'complete')
  )

  function setError(err: unknown, fallback = 'Review study failed.'): void {
    error.value = err instanceof Error ? err.message : String(err || fallback)
  }

  function clearError(): void {
    error.value = ''
  }

  function setOrder(study: HumanReviewStudyRecord, session: HumanReviewSession): void {
    sceneOrder.value = orderScenesForRater(study.scenes, {
      studyId: study.studyId,
      packHash: study.packHash,
      raterId: session.raterId,
      passLabel: session.passLabel
    })
  }

  async function refreshProgress(): Promise<void> {
    const next: Record<number, number> = {}
    await Promise.all(
      sessions.value.map(async (session) => {
        if (session.id == null) return
        next[session.id] = (await getResponses(session.id)).length
      })
    )
    sessionProgress.value = next
  }

  async function load(): Promise<void> {
    loading.value = true
    clearError()
    try {
      studies.value = await getStudies()
      sessions.value = await getSessions()
      await refreshProgress()
    } catch (err) {
      setError(err, 'Could not load the review studies.')
    } finally {
      loading.value = false
    }
  }

  async function importStudy(input: string | unknown): Promise<HumanReviewStudyRecord> {
    loading.value = true
    clearError()
    try {
      const parsed: unknown =
        typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input
      const pack = parseStudyPack(parsed)
      const record = await saveStudy(pack)
      studies.value = await getStudies()
      return record
    } catch (err) {
      setError(err, 'Could not import that study pack.')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function startSession(input: {
    studyRecordId: number
    raterId: string
    passLabel: string
  }): Promise<HumanReviewSession> {
    loading.value = true
    clearError()
    try {
      const raterId = validateRaterId(input.raterId)
      const passLabel = validatePassLabel(input.passLabel)
      const study = await getStudy(input.studyRecordId)
      if (!study) throw new Error('Study pack not found.')

      const existing = await findSession(study.studyId, study.packHash, raterId, passLabel)
      const session =
        existing ||
        (await createSession({
          studyRecordId: study.id!,
          studyId: study.studyId,
          packHash: study.packHash,
          raterId,
          passLabel
        }))

      activeStudy.value = study
      activeSession.value = session
      responses.value = await getResponses(session.id!)
      setOrder(study, session)
      sessions.value = await getSessions()
      await refreshProgress()
      return session
    } catch (err) {
      setError(err, 'Could not start that review session.')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function resumeSession(sessionId: number): Promise<void> {
    loading.value = true
    clearError()
    try {
      const session = await getSession(sessionId)
      if (!session) throw new Error('Review session not found.')
      const study = await getStudy(session.studyRecordId)
      if (!study) throw new Error('The study pack for this session is missing.')
      activeStudy.value = study
      activeSession.value = session
      responses.value = await getResponses(session.id!)
      setOrder(study, session)
    } catch (err) {
      setError(err, 'Could not resume that session.')
      throw err
    } finally {
      loading.value = false
    }
  }

  function leaveSession(): void {
    activeStudy.value = null
    activeSession.value = null
    responses.value = []
    sceneOrder.value = []
    clearError()
  }

  async function saveDraft(draft: ResponseDraft, sceneId?: string): Promise<HumanReviewResponse> {
    clearError()
    try {
      const targetId = sceneId || currentScene.value?.sceneId
      const target = sceneOrder.value.find((scene) => scene.sceneId === targetId)
      if (!activeSession.value?.id || !target) {
        throw new Error('No active scene to save.')
      }
      if (!draft.overall || !OVERALL.includes(draft.overall)) {
        throw new Error('Choose Keep or Revise for the overall decision.')
      }
      for (const dim of RUBRIC_DIMENSIONS) {
        if (!draft.dims[dim] || !MARKS.includes(draft.dims[dim] as RubricMark)) {
          throw new Error(`Choose Problem, Fine or Unsure for ${dim.replace(/_/g, ' ')}.`)
        }
      }
      const saved = await persistResponse(activeSession.value.id, {
        sceneId: target.sceneId,
        overall: draft.overall,
        dims: draft.dims as Record<RubricDimension, RubricMark>,
        note: draft.note.trim()
      })
      const idx = responses.value.findIndex((response) => response.sceneId === saved.sceneId)
      if (idx >= 0) responses.value[idx] = saved
      else responses.value.push(saved)

      if (responses.value.length >= sceneOrder.value.length) {
        const completed = await completeSession(activeSession.value.id)
        if (completed) activeSession.value = completed
      }
      sessions.value = await getSessions()
      await refreshProgress()
      return saved
    } catch (err) {
      setError(err, 'Could not save that scene.')
      throw err
    }
  }

  async function exportSession(sessionId: number): Promise<HumanReviewExport> {
    clearError()
    try {
      const session = await getSession(sessionId)
      if (!session) throw new Error('Review session not found.')
      const study = await getStudy(session.studyRecordId)
      if (!study) throw new Error('The study pack for this session is missing.')
      const saved = await getResponses(sessionId)
      return buildHumanReviewExport(study, session, saved)
    } catch (err) {
      setError(err, 'Could not export that session.')
      throw err
    }
  }

  async function removeSession(sessionId: number): Promise<void> {
    clearError()
    try {
      await deleteSession(sessionId)
      if (activeSession.value?.id === sessionId) leaveSession()
      sessions.value = await getSessions()
      await refreshProgress()
    } catch (err) {
      setError(err, 'Could not delete that session.')
      throw err
    }
  }

  return {
    studies,
    sessions,
    sessionProgress,
    activeStudy,
    activeSession,
    responses,
    sceneOrder,
    loading,
    error,
    currentSceneIndex,
    currentScene,
    progress,
    isComplete,
    inProgressSessions,
    completedSessions,
    setError,
    clearError,
    load,
    importStudy,
    startSession,
    resumeSession,
    leaveSession,
    saveDraft,
    exportSession,
    removeSession
  }
})
