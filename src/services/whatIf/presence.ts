/**
 * Who is where, scene by scene: the check for a MISSING event
 * (WHATIF-AND-IMPORT-PLAN.md, §39).
 *
 * The fact check compares a scene's sentences with stated facts. On the live
 * Ethan Frome branch it could not catch chapter VIII ("Zeena's absence…",
 * "after Zeena left"): no fact was contradicted -- the rewritten chapters keep
 * Zeena at home and simply never show her leaving. What is wrong is an event
 * that did not happen, and only a record of where each person last was can
 * see that.
 *
 * So for each character the change names, the scenes after the change are
 * read in order, one narrow question per scene (reason first, as the planner
 * showed an 8B model needs): is this person here, where, is a leaving or a
 * return shown, and does any sentence treat them as away. Code then decides: a
 * person last SHOWN somewhere, treated as gone (or shown coming back) in a
 * later scene, with no scene showing them leave, is a missing event. Quotes must be found verbatim in the prose, as
 * everywhere else the critic reports something.
 *
 * Nothing about presence is assumed from the premise ("What if Mattie leaves
 * for good?" makes her absent): the first scene that shows a person sets
 * where they are.
 *
 * Measured live (§39): one "move" question let the model excuse chapter VIII
 * with "Zeena's return came late" -- a return is itself proof of a leaving
 * the story never showed -- and it quoted plain presence ("Zeena stood at the
 * door") as a move. So a leaving and a return are asked for separately, and a
 * quoted leaving must contain a leaving word.
 */

export interface TrackedCharacter {
  name: string
  /** Every form the prose may use: full name, aliases, first and last name. */
  forms: string[]
}

export interface Whereabouts {
  present: boolean
  where: string
  /** The scene that last showed it. */
  scene: string
}

export const PRESENCE_SCHEMA = {
  type: 'object',
  properties: {
    present: { type: 'string', enum: ['yes', 'no', 'unclear'] },
    where: { type: 'string' },
    shownLeaving: { type: 'string' },
    shownReturn: { type: 'string' },
    assumesAway: { type: 'string' }
  },
  required: ['present', 'where', 'shownLeaving', 'shownReturn', 'assumesAway']
}

export const PRESENCE_SYSTEM =
  'You track where the people in a story are. Quote the text exactly. Return ONLY valid JSON.'

const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'sir',
  'lady',
  'lord',
  'old',
  'young',
  'the'
])

/**
 * The characters a change names, with the forms the prose may use for each.
 * A first or last name two characters share ("Frome" for Ethan and Zeena) is
 * not a form of either: it would put one person in the other's scenes.
 */
export function trackedCharacters(
  text: string,
  characters: Array<{ name?: unknown; aliases?: unknown }>
): TrackedCharacter[] {
  const nameWords = (name: string) => {
    const words = name.split(/\s+/).map((w) => w.replace(/[.,]$/, ''))
    return (words.length > 1 ? [words[0], words[words.length - 1]] : []).filter(
      (w) => w.length >= 3 && !TITLES.has(w.toLowerCase())
    )
  }
  const shared = new Map<string, number>()
  for (const c of characters || []) {
    for (const w of new Set(nameWords(String(c?.name || '').trim()))) {
      shared.set(w, (shared.get(w) || 0) + 1)
    }
  }
  const out: TrackedCharacter[] = []
  for (const c of characters || []) {
    const name = String(c?.name || '').trim()
    if (!name) continue
    const forms = new Set<string>([name])
    for (const a of Array.isArray(c?.aliases) ? c.aliases : []) {
      if (typeof a === 'string' && a.trim().length >= 3) forms.add(a.trim())
    }
    for (const w of nameWords(name)) {
      if ((shared.get(w) || 0) < 2) forms.add(w)
    }
    const named = [...forms].some((f) => new RegExp(`\\b${escapeRe(f)}\\b`).test(text))
    if (named) out.push({ name, forms: [...forms] })
  }
  return out
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function mentions(prose: string, who: TrackedCharacter): boolean {
  return who.forms.some((f) => new RegExp(`\\b${escapeRe(f)}\\b`).test(prose))
}

export function presencePrompt(args: {
  who: TrackedCharacter
  last: Whereabouts | null
  sceneTitle: string
  prose: string
}): string {
  const known = args.last
    ? `Earlier in this version of the story, ${args.who.name} was last shown ${args.last.present ? 'present' : 'away'}: ${args.last.where} (${args.last.scene}).`
    : `Nothing earlier in this version says where ${args.who.name} is.`
  return `${known}
${args.who.name} may also be called: ${args.who.forms.join(', ')}.

SCENE ("${args.sceneTitle}"):
${args.prose}

Answer about ${args.who.name} in THIS scene, in order:
- "present": "yes" if ${args.who.name} is physically in the scene, "no" if not, "unclear".
- "where": where ${args.who.name} is during the scene, in a few words ("" if not said).
- "shownLeaving": copy exactly the sentence in which this scene SHOWS ${args.who.name} leaving the place, going away or dying, as it happens; "" if the scene does not show it. Mentioning that they are gone is not showing them leave.
- "shownReturn": copy exactly a sentence in which ${args.who.name} comes back or returns from being away (not just walking into a room); "" if none.
- "assumesAway": copy exactly a sentence that treats ${args.who.name} as gone, away or absent at this point of the story (for example "after she left", "her absence"); not a habit, a memory or a wish; "" if there is none.
Every sentence you copy must name ${args.who.name}.`
}

// Code checks on the quotes (§39, second live run). Asked about ETHAN, the
// model quoted "Zeena's absence..."; it took "Mattie appeared behind them" for
// a return, and "Zeena waited until he had gone" for Zeena leaving. So every
// quote must name the person, a return must say one, and a leaving verb must
// follow the person's name within a few words and not be an absence ("Zeena's
// absence left the house") or an earlier leaving ("had left").
const LEAVE_VERB =
  '(left|leaves|leaving|went|goes|going|departed|departs|drove|rode|walked out|set (?:off|out)|died|dies|fled)'
const RETURN_WORD =
  /\b(return\w*|came back|comes back|coming back|back (?:from|home)|home from|got back)\b/i
const NOT_A_LEAVING = /\b(absence|without (?:her|him)|had (?:left|gone)|since (?:she|he))\b/i
const ABSENCE_CUE =
  "(absence|absent|away|gone|missing|wasn[’']t (?:coming|there|home|here)|hadn[’']t come|was not (?:coming|there|home|here))"

/**
 * The first sentence of the scene that puts the person's name next to an
 * absence: "Zeena's absence", "Zeena was gone", "Zeena wasn't coming", "the
 * absence of Zeena". Only a possessive or a few linking words may come
 * between ("Zeena only looked away" is not an absence).
 */
export function namedAbsence(prose: string, who: TrackedCharacter): string {
  const sentences = prose.split(/(?<=[.!?”"])\s+/)
  const link = '(?:\\s+(?:was|is|had|has|been|still|long|already|now))*'
  return (
    sentences.find((s) =>
      who.forms.some(
        (f) =>
          new RegExp(`\\b${escapeRe(f)}\\b(?:[’']s)?${link}\\s+${ABSENCE_CUE}\\b`, 'i').test(s) ||
          new RegExp(`\\b${ABSENCE_CUE}\\W+of\\W+${escapeRe(f)}\\b`, 'i').test(s)
      )
    ) || ''
  ).trim()
}

const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

export interface PresenceIssue {
  sentence: string
  /** Why the sentence is wrong, shown to the author beside it. */
  fact: string
}

/**
 * One scene's answer, judged by code. Returns the missing-event issue (if
 * any) and where the person is after this scene.
 */
export function decidePresence(
  answer: unknown,
  prose: string,
  who: TrackedCharacter,
  last: Whereabouts | null,
  sceneTitle: string
): { issue: PresenceIssue | null; next: Whereabouts | null } {
  const a = (answer && typeof answer === 'object' ? answer : {}) as Record<string, unknown>
  const text = norm(prose)
  // The model often wraps its quote in quotation marks; the flagged sentence
  // must be the one the prose has (third live run).
  const quoted = (v: unknown) => {
    const q =
      typeof v === 'string'
        ? v
            .trim()
            .replace(/^["“”]+|["“”]+$/g, '')
            .trim()
        : ''
    return q && norm(q).length >= 8 && text.includes(norm(q)) ? q : ''
  }
  const names = (q: string) => (q && mentions(q, who) ? q : '')
  // The model saw the absence but quoted a sentence without the name ("Her
  // things remained in their place..."): take the scene's own sentence that
  // puts the name next to an absence ("Zeena wasn't coming."), if there is
  // one (§41, trial 2). Next to, so "Ethan felt Zeena's absence" is not Ethan.
  const unnamed = quoted(a.assumesAway)
  const away = names(unnamed) || (unnamed && a.present !== 'yes' ? namedAbsence(prose, who) : '')
  const returning = names(quoted(a.shownReturn))
  const back = RETURN_WORD.test(returning) ? returning : ''
  const leaving = names(quoted(a.shownLeaving))
  const leaves = who.forms.some((f) =>
    new RegExp(`\\b${escapeRe(f)}\\b(?:\\W+\\w+){0,3}?\\W+${LEAVE_VERB}\\b`, 'i').test(leaving)
  )
  const left =
    leaves &&
    !NOT_A_LEAVING.test(leaving) &&
    norm(leaving) !== norm(away) &&
    norm(leaving) !== norm(back)
      ? leaving
      : ''
  const present = a.present === 'yes'
  const where = typeof a.where === 'string' ? a.where.trim() : ''

  // Treated as gone while not here, or shown coming BACK: either way the
  // story has them leave, and if no scene showed it, that event is missing.
  let issue: PresenceIssue | null = null
  const gone = (away && !present) || back
  if (last?.present && gone && !left) {
    issue = {
      sentence: away || back,
      fact: `${who.name} is still ${last.where || 'where the story last showed them'}: last shown there in ${last.scene}, and the story never shows ${who.name} leaving.`
    }
  }

  let next = last
  if (present)
    next = { present: true, where: where || last?.where || 'in the scene', scene: sceneTitle }
  else if (left) next = { present: false, where: where || 'away', scene: sceneTitle }
  return { issue, next }
}
