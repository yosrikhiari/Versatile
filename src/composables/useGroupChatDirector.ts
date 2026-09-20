import { aiGenerateStructured } from './useAiService'
import { FEATURES } from '../config/ai'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import type { SessionBudget } from '../services/aiProviderBudget'

/**
 * The group-chat director: one cheap structured call per turn that decides
 * which characters answer, in what order, and whether anyone interrupts.
 *
 * The director never writes dialogue — it only returns character names. The
 * speakers themselves are voiced by the existing responder
 * (`useCharacterChat`), so streaming, cleanup and persistence are unchanged.
 * Any failure degrades to "the first profile speaks" (F3); a turn never dies
 * because the director stuttered.
 */

export type ChatEnergy = 'calm' | 'lively' | 'chaotic'

export const SURPRISE_ODDS: Record<ChatEnergy, number> = {
  calm: 0.05,
  lively: 0.15,
  chaotic: 0.3
}

export const MAX_SPEAKERS_PER_TURN = 3

export interface DirectorProfile {
  // The bible id, untouched: Dexie auto-ids are numbers and the render lookup
  // (`storyBibleStore.characters.find((c) => c.id === id)`) is strict — a
  // String() coercion here silently unnames every reply downstream.
  id: string | number
  name: string
  stakes: string
}

export interface DirectorPick {
  /** Character ids in speaking order (1–3, de-duplicated, known ids only). */
  speakers: Array<string | number>
  surprise: boolean
}

export interface PickSpeakersArgs {
  transcript: string
  profiles: DirectorProfile[]
  energy?: ChatEnergy | string
  lastSpeakerId?: string | number | null
  sessionBudget?: SessionBudget | null
}

function normalizeEnergy(energy: ChatEnergy | string | undefined): ChatEnergy {
  if (energy === 'calm' || energy === 'lively' || energy === 'chaotic') return energy
  return 'lively'
}

function oneLineStakes(character: {
  role?: string
  goal?: string
  voice?: string
  traits?: string[]
}): string {
  const bits: string[] = []
  if (character.role) bits.push(character.role)
  if (character.goal) bits.push(`wants ${character.goal}`)
  if (character.voice) bits.push(`voice: ${character.voice}`)
  if (character.traits && character.traits.length) bits.push(character.traits.join(', '))
  return bits.join(' — ') || 'cast member'
}

/** Cast cards for the given character ids, in bible order. */
export function profilesForChat(characterIds: Array<string | number>): DirectorProfile[] {
  const bible = useStoryBibleStore()
  return characterIds
    .map((id) => bible.characters.find((c) => c.id === id) || null)
    .filter(
      (c): c is { id: string | number; name: string } & Record<string, unknown> => !!c && !!c.name
    )
    .map((c) => ({
      id: c.id,
      name: String(c.name),
      stakes: oneLineStakes(
        c as { role?: string; goal?: string; voice?: string; traits?: string[] }
      )
    }))
}

export function buildDirectorPrompt(
  transcript: string,
  profiles: DirectorProfile[],
  energy: ChatEnergy
): string {
  const odds = Math.round(SURPRISE_ODDS[energy] * 100)
  const cast = profiles.map((p) => `- ${p.name}: ${p.stakes}`).join('\n')
  return [
    'You are the director of a live cast chat. Pick who speaks next.',
    '',
    'CAST:',
    cast,
    '',
    'RULES:',
    '- Reply with 1 to 3 names, in speaking order, using exact names from CAST.',
    '- Usually the addressed or most affected character answers first.',
    `- About ${odds}% of turns, let someone interrupt or have two characters exchange one line before the user replies; set surprise true only then.`,
    '- Never invent a speaker outside CAST.',
    '',
    'TRANSCRIPT (most recent last):',
    transcript || '(no messages yet)'
  ].join('\n')
}

const DIRECTOR_SYSTEM = 'You direct a fiction cast chat. Return only the casting decision as JSON.'

const DIRECTOR_SCHEMA = {
  type: 'object',
  properties: {
    speakers: { type: 'array', items: { type: 'string' } },
    surprise: { type: 'boolean' }
  },
  required: ['speakers']
}

/** Map model-returned names to known ids; unknown names are dropped. */
function resolveSpeakers(
  names: unknown,
  profiles: DirectorProfile[],
  lastSpeakerId: string | number | null
): Array<string | number> {
  if (!Array.isArray(names)) return []
  const byName = new Map(profiles.map((p) => [p.name.trim().toLowerCase(), p.id]))
  const seen = new Set<string | number>()
  const ids: Array<string | number> = []
  for (const raw of names) {
    if (typeof raw !== 'string') continue
    const id = byName.get(raw.trim().toLowerCase())
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  // No immediate repeats: the last speaker yields unless they are the only pick.
  const withoutRepeat = ids.filter((id) => id !== lastSpeakerId)
  const chosen = (withoutRepeat.length ? withoutRepeat : ids).slice(0, MAX_SPEAKERS_PER_TURN)
  return chosen
}

export async function pickSpeakers(args: PickSpeakersArgs): Promise<DirectorPick> {
  const { transcript, profiles } = args
  const fallback: DirectorPick = {
    speakers: profiles.length ? [profiles[0].id] : [],
    surprise: false
  }
  if (!profiles.length) return fallback
  const energy = normalizeEnergy(args.energy)
  const lastSpeakerId = args.lastSpeakerId || null
  try {
    const data = (await aiGenerateStructured(
      buildDirectorPrompt(transcript, profiles, energy),
      DIRECTOR_SYSTEM,
      {
        feature: FEATURES.CHARACTER_CHAT,
        role: 'utility',
        schema: DIRECTOR_SCHEMA,
        schemaName: 'director_pick',
        maxTokens: 256,
        temperature: 0.3,
        sessionBudget: args.sessionBudget ?? null
      }
    )) as { speakers?: unknown; surprise?: unknown }
    const speakers = resolveSpeakers(data?.speakers, profiles, lastSpeakerId)
    return {
      speakers: speakers.length ? speakers : fallback.speakers,
      surprise: data?.surprise === true && speakers.length > 0
    }
  } catch {
    return fallback
  }
}
