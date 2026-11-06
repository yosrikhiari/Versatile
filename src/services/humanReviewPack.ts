import { sha256Hex } from '../evaluation/labelDerivation'
import type { HumanReviewPack, HumanReviewScene, RubricDimension } from '../types/humanReview'

/**
 * The frozen human-review pack and the small amount of pure logic around it.
 *
 * This is deliberately separate from `SceneLabel`: the production label schema
 * is pass/revise/rewrite with numeric scores, while the frozen research rubric
 * is Keep/Revise plus Problem/Fine/Unsure. Mixing the two would make a pilot
 * response look like a production evaluation.
 */
export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  'continuity',
  'voice',
  'show_tell',
  'pacing',
  'emotional_goal'
]

export const STUDY_SCENE_COUNT = 12
const MAX_TEXT_CHARS = 200_000
const MAX_TOTAL_CHARS = 2_000_000
const MAX_FACTS = 100

const PACK_KEYS = new Set(['studyId', 'rubricVersion', 'title', 'description', 'scenes'])
const SCENE_KEYS = new Set(['sceneId', 'sceneTitle', 'text', 'brief', 'facts', 'source'])

const AI_NAME_MARKERS = [
  'claude',
  'gpt',
  'llm',
  'openai',
  'anthropic',
  'gemini',
  'qwen',
  'mistral',
  'llama',
  'model-generated'
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Study pack: "${field}" must be a non-empty string.`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  where: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Study pack: unsupported field "${key}" in ${where}. Packs may not include critic or gate output.`
      )
    }
  }
}

function normalizeScene(value: unknown, index: number): HumanReviewScene {
  if (!isObject(value)) {
    throw new Error(`Study pack: scene ${index + 1} is not an object.`)
  }
  rejectUnknownKeys(value, SCENE_KEYS, `scene ${index + 1}`)
  const text = requiredString(value.text, `scenes[${index}].text`)
  if (text.length > MAX_TEXT_CHARS) {
    throw new Error(`Study pack: scene ${index + 1} text is too long.`)
  }
  const facts = value.facts
  if (facts !== undefined && (!Array.isArray(facts) || facts.length > MAX_FACTS)) {
    throw new Error(`Study pack: scenes[${index}].facts must be an array of at most ${MAX_FACTS}.`)
  }
  const normalizedFacts =
    facts === undefined
      ? undefined
      : facts.map((fact, factIndex) => {
          if (typeof fact !== 'string' || !fact.trim()) {
            throw new Error(
              `Study pack: scenes[${index}].facts[${factIndex}] must be a non-empty string.`
            )
          }
          return fact.trim()
        })

  return {
    sceneId: requiredString(value.sceneId, `scenes[${index}].sceneId`),
    sceneTitle: optionalString(value.sceneTitle) || `Scene ${index + 1}`,
    text,
    ...(optionalString(value.brief) ? { brief: optionalString(value.brief) } : {}),
    ...(normalizedFacts ? { facts: normalizedFacts } : {}),
    ...(optionalString(value.source) ? { source: optionalString(value.source) } : {})
  }
}

/** Parse and validate the frozen v1 pack. Unknown fields are rejected. */
export function parseStudyPack(input: unknown): HumanReviewPack {
  if (!isObject(input)) {
    throw new Error('Study pack: expected a JSON object.')
  }
  rejectUnknownKeys(input, PACK_KEYS, 'the pack')

  const studyId = requiredString(input.studyId, 'studyId')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(studyId)) {
    throw new Error('Study pack: "studyId" must be 3-80 safe characters.')
  }
  if (input.rubricVersion !== 'v1') {
    throw new Error('Study pack: only rubric version v1 is supported.')
  }
  const title = requiredString(input.title, 'title')
  const description = optionalString(input.description)

  if (!Array.isArray(input.scenes) || input.scenes.length !== STUDY_SCENE_COUNT) {
    throw new Error(`Study pack: exactly ${STUDY_SCENE_COUNT} scenes are required.`)
  }

  const scenes = input.scenes.map((scene, index) => normalizeScene(scene, index))
  const ids = new Set<string>()
  let totalChars = 0
  for (const scene of scenes) {
    if (ids.has(scene.sceneId)) {
      throw new Error(`Study pack: duplicate sceneId "${scene.sceneId}".`)
    }
    ids.add(scene.sceneId)
    totalChars += scene.text.length
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    throw new Error('Study pack: total scene text is too large.')
  }

  const packHash = sha256Hex(
    canonicalPackJson({ studyId, rubricVersion: 'v1', title, description, scenes })
  )

  return {
    studyId,
    rubricVersion: 'v1',
    title,
    ...(description ? { description } : {}),
    packHash,
    scenes
  }
}

function canonicalPackJson(pack: Omit<HumanReviewPack, 'packHash'>): string {
  return JSON.stringify({
    studyId: pack.studyId,
    rubricVersion: pack.rubricVersion,
    title: pack.title,
    description: pack.description || '',
    scenes: pack.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sceneTitle: scene.sceneTitle,
      text: scene.text,
      brief: scene.brief || '',
      facts: scene.facts || [],
      source: scene.source || ''
    }))
  })
}

/** Anonymous participant code; AI/model names are refused for provenance. */
export function validateRaterId(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    throw new Error('Rater ID is required. Use an anonymous participant code.')
  }
  if (trimmed.length > 40) {
    throw new Error('Rater ID must be 40 characters or fewer.')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(trimmed)) {
    throw new Error('Rater ID may use letters, numbers, spaces, hyphens and underscores.')
  }
  const lower = trimmed.toLowerCase()
  if (AI_NAME_MARKERS.some((marker) => lower.includes(marker))) {
    throw new Error(
      'Use an anonymous participant code. AI/model names are reserved and would fail the human-provenance check.'
    )
  }
  return trimmed
}

export function validatePassLabel(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return 'Pass 1'
  if (trimmed.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(trimmed)) {
    throw new Error('Pass label must be 40 characters or fewer and use safe characters.')
  }
  return trimmed
}

export interface SceneOrderSeed {
  studyId: string
  packHash: string
  raterId: string
  passLabel: string
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic presentation order, seeded by study, pack, rater and pass.
 * The same session resumes in the same order; another rater sees another order.
 */
export function orderScenesForRater<T>(scenes: T[], seed: SceneOrderSeed): T[] {
  const random = mulberry32(
    fnv1a(`${seed.studyId}|${seed.packHash}|${seed.raterId}|${seed.passLabel}`)
  )
  const shuffled = [...scenes]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = shuffled[i] as T
    shuffled[i] = shuffled[j] as T
    shuffled[j] = tmp
  }
  return shuffled
}
