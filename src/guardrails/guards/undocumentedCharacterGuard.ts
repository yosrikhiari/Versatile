import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'
import type { GroundingService } from '../ontology/grounding'

/**
 * Detects a *person name appearing in the prose body* that is not part of the
 * known cast (characters + aliases) or known locations.
 *
 * This catches the failure mode the `entity` guard cannot: `entity` only
 * validates the scene's declared `characters` *metadata* list. A character can
 * still be introduced directly in the narrative ("Aiden stepped from the shadows")
 * without ever being added to that list — the exact "undocumented character"
 * regression (finding F2). This guard reads the actual prose so such a name
 * surfaces for review instead of slipping into the published chapter.
 *
 * Advisory (detective) by design: a legitimate mid-draft introduction should
 * not block generation, it should be promoted into the cast. Escalate to
 * blocking only if a project forbids unplanned characters.
 */

const TITLE_PREFIXES = [
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'professor', 'sir', 'lord', 'lady',
  'capt', 'captain', 'col', 'colonel', 'gen', 'general', 'maj', 'major',
  'sgt', 'sergeant', 'pvt', 'private', 'det', 'detective', 'insp', 'inspector',
  'officer', 'agent', 'king', 'queen', 'prince', 'princess', 'duke', 'duchess',
  'earl', 'baron', 'president', 'chancellor', 'governor', 'mayor', 'rev',
  'reverend', 'father', 'mother', 'uncle', 'aunt', 'grandma', 'grandpa',
  'madam', 'madame'
]

// Adjectives / common nouns that, when leading a capitalized span, usually mark
// a place/object/title rather than a person name. Keeps the detective feed quiet.
const STOP_FIRST = new Set([
  'the', 'a', 'an', 'ancient', 'old', 'young', 'little', 'great', 'silent',
  'dark', 'bright', 'hidden', 'forgotten', 'cursed', 'sacred', 'holy',
  'black', 'white', 'red', 'blue', 'green', 'golden', 'silver', 'iron',
  'stone', 'wooden', 'glass', 'high', 'low', 'broken', 'fallen', 'rising',
  'distant', 'near', 'far', 'last', 'first', 'second', 'third', 'final',
  'cold', 'warm', 'bitter', 'sweet', 'dead', 'living', 'lost', 'found',
  // Capitalized prepositions/connectives that open a name span but are not names
  // themselves (e.g. "At Duskwane's Redoubt" must not become a person name).
  'at', 'in', 'on', 'to', 'from', 'with', 'by', 'into', 'upon', 'for', 'of',
  'over', 'under', 'through', 'after', 'before', 'between', 'behind', 'beside'
])

const NON_PERSON = new Set([
  'council', 'order', 'guild', 'empire', 'kingdom', 'realm', 'city', 'town',
  'village', 'river', 'mountain', 'sea', 'forest', 'castle', 'palace', 'temple',
  'university', 'academy', 'library', 'market', 'tavern', 'inn', 'school',
  'company', 'group', 'team', 'family', 'clan', 'tribe', 'senate', 'parliament',
  'army', 'fleet', 'church', 'court', 'society', 'brotherhood', 'tower',
  'hall', 'bridge', 'gate', 'wall', 'road', 'path', 'field', 'valley', 'lake',
  'island', 'continent', 'world', 'house', 'order', 'chapter', 'tome', 'book',
  'scroll', 'sword', 'shield', 'knife', 'blade', 'staff', 'crown', 'throne'
])

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const NAME_SPAN_RE = new RegExp(
  `(?:\\b(?:${TITLE_PREFIXES.map(escapeRe).join('|')})\\b\\.?\\s+)?` +
    `[A-Z][a-zA-Z'’]+(?:\\s+[A-Z][a-zA-Z'’]+){1,3}`,
  'g'
)

// When the regex keeps a title prefix inside the span ("Agent Chen" matched as
// two capitalized words), strip it so the residual name is what we look up.
const LEADING_TITLE_RE = new RegExp(`^(?:${TITLE_PREFIXES.map(escapeRe).join('|')})\\.?\\s+`, 'i')

interface KnownNames {
  /** Lowercased full names + aliases + their first-two-word prefixes. */
  full: Set<string>
  /** Lowercased first tokens of every known name. */
  firstToken: Set<string>
}

function buildKnownNames(grounding: GroundingService): KnownNames {
  const full = new Set<string>()
  const firstToken = new Set<string>()

  const add = (name: string) => {
    const lower = name.trim().toLowerCase()
    if (!lower) return
    const tokens = lower.split(/\s+/).filter(Boolean)
    full.add(lower)
    // Both the leading and every consecutive two-token window are indexed, so a
    // name that drops a leading article ("Lattice Spire" vs the known "the
    // Lattice Spire") or is referenced by an inner pair ("Floating Market" vs
    // "the Floating Market of Cinder") still resolves to a known entity instead
    // of being flagged as an undocumented character.
    for (let i = 0; i + 1 < tokens.length; i++) full.add(`${tokens[i]} ${tokens[i + 1]}`)
    if (tokens.length >= 2) full.add(tokens.slice(0, 2).join(' '))
    firstToken.add(tokens[0])
  }

  for (const entity of grounding.getEntitiesByType('character')) {
    if (!entity) continue
    add(entity.name)
    for (const alias of entity.aliases ?? []) add(alias)
  }
  // Known locations are not people — keep them out of the "undocumented" bucket.
  for (const entity of grounding.getEntitiesByType('location')) {
    if (!entity) continue
    add(entity.name)
    for (const alias of entity.aliases ?? []) add(alias)
  }

  return { full, firstToken }
}

function isKnown(candidate: string, known: KnownNames): boolean {
  const lower = candidate.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!lower) return true
  if (known.full.has(lower)) return true

  const tokens = lower.split(/\s+/).filter(Boolean)
  if (tokens.length === 1) return known.firstToken.has(tokens[0])
  if (known.full.has(tokens.slice(0, 2).join(' '))) return true
  return known.firstToken.has(tokens[0])
}

function isPersonLike(span: string): boolean {
  const tokens = span.replace(/[^A-Za-z' ]/g, ' ').split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return false
  if (STOP_FIRST.has(tokens[0].toLowerCase())) return false
  if (tokens.some(t => NON_PERSON.has(t.toLowerCase()))) return false
  return tokens.every(t => /^[A-Z][a-zA-Z'’]+$/.test(t))
}

export function createUndocumentedCharacterGuard(
  grounding: GroundingService,
  enabled: boolean = true
): GuardFunction {
  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    const content = typeof data.content === 'string' ? data.content : ''
    if (!content) return []

    grounding.refresh()
    const characters = grounding.getEntitiesByType('character')
    if (characters.length === 0) return []

    const known = buildKnownNames(grounding)
    const found = new Set<string>()

    let match: RegExpExecArray | null
    NAME_SPAN_RE.lastIndex = 0
    while ((match = NAME_SPAN_RE.exec(content)) !== null) {
      const raw = match[0].trim()
      const span = raw.replace(LEADING_TITLE_RE, '').trim()
      if (!isPersonLike(span)) continue
      if (isKnown(span, known)) continue
      found.add(span)
    }

    if (found.size === 0) return []

    const undocumented = [...found]
    return [
      {
        kind: 'undocumented_character',
        passed: false,
        severity: 'detective',
        message: `Undocumented character name(s) in prose: ${undocumented.join(', ')}`,
        details: {
          undocumented,
          note: 'Promote to the cast/character list, or remove if unintended. Not blocking.'
        },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now()
      }
    ]
  }
}
