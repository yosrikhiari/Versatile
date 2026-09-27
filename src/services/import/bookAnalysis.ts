/**
 * Reading an existing book once so it has the story knowledge a generated
 * book has (WHATIF-AND-IMPORT-PLAN.md, step 3). This module is the pure part:
 * the per-scene extraction prompt and schema, chunking of long scenes,
 * merging chunk results, resolving name variants across the whole book, and
 * turning one scene's extraction into the `structured` record the writer
 * produces -- so an imported scene then goes through exactly the code a
 * generated one does (`writeSceneAnalysis` for the digest and entity states,
 * `syncChapterToBible` for the story bible and the network).
 */

import { wordCount } from './blocks'

// ── per-scene extraction ───────────────────────────────────────────────────

export interface SceneExtraction {
  summary: string
  pov: string
  location: string
  characters: Array<{ name: string; role?: string; description?: string }>
  places: Array<{ name: string; type?: string; description?: string }>
  keyFacts: string[]
  relationships: Array<{ from: string; to: string; label: string }>
}

export const SCENE_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    pov: { type: 'string' },
    location: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name']
      }
    },
    places: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name']
      }
    },
    keyFacts: { type: 'array', items: { type: 'string' } },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          label: { type: 'string' }
        },
        required: ['from', 'to', 'label']
      }
    }
  },
  required: ['summary', 'characters', 'places', 'keyFacts', 'relationships']
}

export const SCENE_EXTRACTION_SYSTEM =
  'You read one passage of a novel and record what it contains, exactly and briefly. ' +
  'Use names as the passage writes them. Never invent anything the passage does not say. ' +
  'Return ONLY valid JSON.'

export function sceneExtractionPrompt(args: {
  bookTitle: string
  chapterTitle: string
  sceneTitle: string
  part?: { index: number; of: number }
  text: string
}): string {
  const where = args.part ? ` (part ${args.part.index} of ${args.part.of})` : ''
  return `BOOK: ${args.bookTitle}
CHAPTER: ${args.chapterTitle}
SCENE: ${args.sceneTitle}${where}

PASSAGE:
${args.text}

Record, from this passage only:
- "summary": 2-3 plain sentences: who does what, and what changes.
- "pov": whose point of view the passage is told from ("narrator" for an unnamed first-person narrator, "" if it is not clear).
- "location": where it mainly happens ("" if not said).
- "characters": every NAMED person who appears or is spoken of, with "role" (a few words: "the narrator's host", "a detective") and a one-sentence "description" of them as this passage shows them. No unnamed people ("the porter").
- "places": every named place, with "type" (town, house, room, street...) and a one-sentence "description".
- "keyFacts": up to 5 durable facts later scenes must respect: who is alive, dead, hurt, married, where someone is, who knows or owns what. Not events that merely happen.
- "relationships": up to 5 relationships between two NAMED characters the passage shows, e.g. {"from":"Ethan","to":"Zeena","label":"married to"}.`
}

/** Split a scene into passages of at most `maxWords`, at paragraph boundaries. */
export function chunkParagraphs(paragraphs: string[], maxWords = 2500): string[] {
  const chunks: string[] = []
  let cur: string[] = []
  let n = 0
  for (const p of paragraphs) {
    const w = wordCount(p)
    if (cur.length && n + w > maxWords) {
      chunks.push(cur.join('\n\n'))
      cur = []
      n = 0
    }
    cur.push(p)
    n += w
  }
  if (cur.length) chunks.push(cur.join('\n\n'))
  return chunks
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((t) => {
    const k = key(t)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const lower = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase()

type Loose = Record<string, unknown> | null | undefined

/** Anything the model returned, as a well-formed extraction. */
export function cleanExtraction(raw: unknown): SceneExtraction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  // A name, not a note about it: the live read returned "Zeena (his wife)",
  // which then became her canonical name.
  const name = (v: unknown) =>
    str(v)
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const list = (v: unknown): Loose[] => (Array.isArray(v) ? v : [])
  return {
    summary: str(r.summary),
    pov: name(r.pov),
    location: str(r.location),
    characters: uniqueBy(
      list(r.characters)
        .map((c: Loose) => ({
          name: name(c?.name),
          role: str(c?.role),
          description: str(c?.description)
        }))
        .filter((c) => c.name),
      (c) => lower(c.name)
    ),
    places: uniqueBy(
      list(r.places)
        .map((p: Loose) => ({
          name: str(p?.name),
          type: str(p?.type),
          description: str(p?.description)
        }))
        .filter((p) => p.name),
      (p) => lower(p.name)
    ),
    keyFacts: uniqueBy(list(r.keyFacts).map(str).filter(Boolean), lower).slice(0, 5),
    relationships: uniqueBy(
      list(r.relationships)
        .map((x: Loose) => ({ from: name(x?.from), to: name(x?.to), label: str(x?.label) }))
        .filter((x) => x.from && x.to && x.label && lower(x.from) !== lower(x.to)),
      (x) => `${lower(x.from)}|${lower(x.to)}|${lower(x.label)}`
    )
  }
}

/**
 * One extraction from the extractions of a long scene's passages. Lists are
 * unioned (first description wins); the summaries are joined in order -- a
 * long scene's summary is the sequence of its parts, not a guess at their
 * gist. `summary` can be replaced by a combining call when there are many.
 */
export function mergeExtractions(parts: SceneExtraction[]): SceneExtraction {
  if (parts.length === 1) return parts[0]
  const first = <T>(xs: T[]) => xs.find(Boolean)
  return cleanExtraction({
    summary: parts
      .map((p) => p.summary)
      .filter(Boolean)
      .join(' '),
    pov: first(parts.map((p) => p.pov)) || '',
    location: first(parts.map((p) => p.location)) || '',
    characters: parts.flatMap((p) => p.characters),
    places: parts.flatMap((p) => p.places),
    keyFacts: parts.flatMap((p) => p.keyFacts).slice(0, 8),
    relationships: parts.flatMap((p) => p.relationships)
  })
}

// ── names across the book ──────────────────────────────────────────────────

const HONORIFICS = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'doctor',
  'sir',
  'lady',
  'lord',
  'madame',
  'mme',
  'monsieur',
  'mademoiselle',
  'captain',
  'capt',
  'colonel',
  'col',
  'major',
  'professor',
  'prof',
  'father',
  'mother',
  'aunt',
  'uncle',
  'master',
  'mistress',
  'inspector',
  'rev',
  'reverend'
])

const FEMALE = new Set([
  'mrs',
  'miss',
  'ms',
  'lady',
  'madame',
  'mme',
  'mademoiselle',
  'aunt',
  'mother',
  'mistress'
])
const MALE = new Set(['mr', 'sir', 'lord', 'monsieur', 'uncle', 'father', 'master'])

/**
 * The one thing an honorific says that matters for merging: "Mrs. Ned Hale"
 * is not Ned Hale. Dropping honorifics entirely made "Ned" (her husband) an
 * alias of her in Ethan Frome.
 */
export function nameGender(name: string): 'f' | 'm' | '' {
  const raw = lower(name).replace(/\./g, '').split(/\s+/)
  if (raw.some((t) => FEMALE.has(t))) return 'f'
  if (raw.some((t) => MALE.has(t))) return 'm'
  return ''
}

/** "Mr. Sherlock Holmes" -> ["sherlock", "holmes"]. */
export function nameTokens(name: string): string[] {
  return lower(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t.replace(/\.$/, '')))
}

export interface NameResolution {
  /** Every name form seen -> the canonical name it stands for. */
  canonical: Map<string, string>
  /** Canonical name -> the other forms it was written as. */
  aliases: Map<string, string[]>
  /** Short forms that fit more than one full name ("Frome": Ethan or Zeena), for a model to settle. */
  ambiguous: Array<{ name: string; candidates: string[] }>
}

/**
 * Group name forms that mean the same person, by rule. The canonical form is
 * the longest full name ("Sherlock Holmes"); a form whose words all appear in
 * exactly one longer name is an alias of it ("Holmes", "Mr. Holmes",
 * "Sherlock"). A form that fits several ("Frome" in "Ethan Frome" and "Zeena
 * Frome") is left separate and reported as ambiguous -- merging on a surname
 * alone would fuse a husband and wife into one character.
 */
export function resolveNames(counts: Map<string, number>): NameResolution {
  const names = [...counts.keys()]
  // A key is the name's words plus what its honorific says about gender:
  // "Mr. Holmes" and "MR. HOLMES" share one, "Mrs. Hale" and "Hale" do not.
  const keyOf = (n: string) => {
    const t = nameTokens(n).join(' ')
    const g = nameGender(n)
    return t ? (g ? `${g}:${t}` : t) : ''
  }
  const byKey = new Map<string, string[]>()
  for (const n of names) {
    const k = keyOf(n)
    if (!k) continue
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(n)
  }
  const keys = [...byKey.keys()]
  const tokens = (k: string) => k.replace(/^[fm]:/, '').split(' ')
  const gender = (k: string) => (/^[fm]:/.test(k) ? k[0] : '')
  const display = (k: string) =>
    // The most frequent spelling of a key is how it is shown.
    [...byKey.get(k)!].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0]

  /** Can a form with key `k` stand for the person named by the key `c`? */
  const fits = (k: string, c: string) => {
    const gk = gender(k)
    const gc = gender(c)
    if (gk && gc && gk !== gc) return false
    const tk = tokens(k)
    const tc = tokens(c)
    // A bare first name is not a titled person's alias ("Ned" is not
    // "Mrs. Ned Hale"); a bare surname can be ("Hale" of "Mrs. Hale").
    if (!gk && gc && !(tk.length === 1 && tk[0] === tc[tc.length - 1])) return false
    return tk.every((t) => tc.includes(t))
  }

  const parent = new Map<string, string>()
  const ambiguous: NameResolution['ambiguous'] = []
  for (const k of keys) {
    const tk = tokens(k)
    const containers = keys.filter((o) => {
      if (o === k) return false
      const longer = tokens(o).length > tk.length
      // Same words, one titled and one not ("Holmes" / "Mr. Holmes"): the
      // untitled form joins the titled one when there is only one.
      const sameWords = tokens(o).join(' ') === tk.join(' ') && !gender(k) && !!gender(o)
      return (longer || sameWords) && fits(k, o)
    })
    // Only the longest containers matter ("holmes" in "sherlock holmes").
    const maxLen = Math.max(0, ...containers.map((c) => tokens(c).length))
    const top = containers.filter((c) => tokens(c).length === maxLen)
    if (top.length === 1) parent.set(k, top[0])
    else if (top.length > 1) ambiguous.push({ name: display(k), candidates: top.map(display) })
  }
  const root = (k: string): string => {
    let cur = k
    for (let i = 0; i < 10 && parent.has(cur); i++) cur = parent.get(cur)!
    return cur
  }
  // Shown as: the most used spelling among the group's forms that have the
  // full name's words -- "Sherlock Holmes" over "Holmes", but "Holmes" over
  // "Mr. Holmes" when the book never uses a longer name.
  const members = new Map<string, string[]>()
  for (const k of keys) {
    const r = root(k)
    if (!members.has(r)) members.set(r, [])
    members.get(r)!.push(k)
  }
  const shownFor = new Map<string, string>()
  for (const [r, ks] of members) {
    const full = ks
      .filter((k) => tokens(k).length === tokens(r).length)
      .flatMap((k) => byKey.get(k)!)
    shownFor.set(
      r,
      full.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0] || display(r)
    )
  }
  const canonical = new Map<string, string>()
  const aliases = new Map<string, string[]>()
  for (const k of keys) {
    const canon = shownFor.get(root(k))!
    for (const form of byKey.get(k)!) {
      canonical.set(form, canon)
      if (form !== canon) {
        if (!aliases.has(canon)) aliases.set(canon, [])
        aliases.get(canon)!.push(form)
      }
    }
  }
  return { canonical, aliases, ambiguous }
}

// ── places ─────────────────────────────────────────────────────────────────

// Words that name a kind of place, not a place: "the kitchen" is only a place
// in the bible when the book keeps going back to it.
const GENERIC_PLACE = new Set(
  (
    'house home kitchen farm farmhouse church chapel road room parlour parlor yard stable hall ' +
    'landing gate graveyard cemetery village town city street lane school schoolhouse office ' +
    'post-office post mill saw-mill sawmill junction flats pond lake river hill woods wood forest ' +
    'field fields barn shop store station inn tavern bar hotel garden porch door window bedroom ' +
    'attic cellar stairs staircase household upper lower'
  ).split(' ')
)
const ARTICLES = new Set(['the', 'a', 'an'])

/** "The Frome’s Farm" / "Fromes' farm" -> ["frome", "farm"]. */
export function placeTokens(name: string): string[] {
  return lower(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[,.;:()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/(['’]s|s['’])$/, '').replace(/['’]/g, ''))
    .filter((t) => t && !ARTICLES.has(t))
}

/**
 * Group place forms: same words once articles and possessives are gone, or a
 * form whose words all fit exactly one longer name ("Starkfield" in
 * "Starkfield, Massachusetts"; "Farm" in "Frome farm"). The name shown is the
 * group's most used spelling. `keep` says which places belong in the bible:
 * any with a proper name, and a generic one ("the kitchen") only when three or
 * more scenes are set there.
 */
export function resolvePlaces(sceneCounts: Map<string, number>): {
  canonical: Map<string, string>
  keep: (canonicalName: string) => boolean
} {
  const byKey = new Map<string, string[]>()
  for (const n of sceneCounts.keys()) {
    const k = placeTokens(n).join(' ')
    if (!k) continue
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(n)
  }
  const keys = [...byKey.keys()]
  const words = (k: string) => k.split(' ')
  const parent = new Map<string, string>()
  for (const k of keys) {
    const tk = words(k)
    const containers = keys.filter(
      (o) => o !== k && words(o).length > tk.length && tk.every((t) => words(o).includes(t))
    )
    const maxLen = Math.max(0, ...containers.map((c) => words(c).length))
    const top = containers.filter((c) => words(c).length === maxLen)
    if (top.length === 1) parent.set(k, top[0])
  }
  const root = (k: string) => {
    let cur = k
    for (let i = 0; i < 10 && parent.has(cur); i++) cur = parent.get(cur)!
    return cur
  }
  const groups = new Map<string, string[]>()
  for (const k of keys) {
    const r = root(k)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(...byKey.get(k)!)
  }
  const canonical = new Map<string, string>()
  const total = new Map<string, number>()
  const generic = new Map<string, boolean>()
  for (const [r, forms] of groups) {
    const shown = [...forms].sort(
      (a, b) => (sceneCounts.get(b) || 0) - (sceneCounts.get(a) || 0)
    )[0]
    for (const f of forms) canonical.set(f, shown)
    total.set(
      shown,
      forms.reduce((n, f) => n + (sceneCounts.get(f) || 0), 0)
    )
    generic.set(
      shown,
      words(r).every((t) => GENERIC_PLACE.has(t))
    )
  }
  return {
    canonical,
    keep: (n) => !generic.get(n) || (total.get(n) || 0) >= 3
  }
}

/** In how many scenes each place form appears (its list or as the scene's location). */
export function placeCounts(extractions: SceneExtraction[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of extractions) {
    for (const n of new Set([...e.places.map((p) => p.name), e.location].filter(Boolean))) {
      counts.set(n, (counts.get(n) || 0) + 1)
    }
  }
  return counts
}

// ── relation labels ────────────────────────────────────────────────────────

/**
 * The network's relation types. The model words the same relationship
 * differently in every chapter ("loves", "has romantic feelings for",
 * "emotionally attached"), and the network closes a link whenever its type
 * changes -- so on the live read most links lasted one chapter and the book
 * got 112 of them. Folding labels into these types keeps a relationship that
 * did not change as one link. `symmetric` ones are stored in one direction.
 */
const RELATIONS: Array<[RegExp, string, boolean]> = [
  [/\b(ex-|former)/i, 'formerly close to', false],
  [/\b(married|marriage|husband|wife|spouse|widow)/i, 'married to', true],
  [/\bcousin/i, 'cousin of', true],
  [/\b(brother|sister|sibling)/i, 'sibling of', true],
  [/\b(father|mother|parent)\b/i, 'parent of', false],
  [/\b(son|daughter|child)\b/i, 'child of', false],
  [/\b(relative|kin|uncle|aunt|niece|nephew|grand|step-?|in-law)/i, 'related to', true],
  [
    /\b(lov|romantic|affection|infatuat|attached|feelings for|courts?\b|courting|smitten|desire)/i,
    'in love with',
    false
  ],
  [/\bemployer\b/i, 'employs', false],
  [/\b(employ|servant|hired|help\b|assistant|works? for|subordinate)/i, 'works for', false],
  [/\b(rival|compet)/i, 'rival of', true],
  [
    /\b(resent|jealous|hostil|mistreat|oppos|dominat|threat|hate|dislike|contempt)/i,
    'hostile to',
    false
  ],
  [/\b(care|nurs|looks? after|responsible|protect|depend)/i, 'cares for', false],
  [/\b(friend|companion|ally)/i, 'friends with', true],
  [/\bneighbo/i, 'neighbour of', true],
  [/\b(acquaint|knows?\b|stranger|met\b|observer|guest|host|visitor)/i, 'acquainted with', true]
]

/** A relation label as one of the network's types (or itself, shortened, when none fits). */
export function normalizeRelation(label: string): { label: string; symmetric: boolean } {
  for (const [re, type, symmetric] of RELATIONS)
    if (re.test(label)) return { label: type, symmetric }
  return {
    label: lower(label).split(/\s+/).slice(0, 4).join(' '),
    symmetric: false
  }
}

// ── family links ───────────────────────────────────────────────────────────

const FAMILY: Array<[string, RegExp]> = [
  ['marriage', /\b(married|marriage|husband|wife|spouse|widow(er)?)\b/i],
  ['parent', /\b(father|mother|parent|son|daughter|child)\b/i],
  ['sibling', /\b(brother|sister|sibling)\b/i],
  ['kin', /\b(uncle|aunt|niece|nephew|cousin|grand\w*|relative|step-?\w*|in-law)\b/i]
]

export function familyKind(label: string): string | null {
  for (const [kind, re] of FAMILY) if (re.test(label)) return kind
  return null
}

/**
 * Which family links the book states more than once. A family relation
 * claimed by one scene only is far more likely a misreading than a fact --
 * the live Ethan Frome read had Ethan as Mattie's "father" and "husband",
 * each in a single scene, against a book that says otherwise throughout.
 * Other relations ("loves", "rival of") pass as they are.
 */
export function familyVote(
  extractions: SceneExtraction[],
  canonical: Map<string, string>
): (from: string, to: string, label: string) => boolean {
  const c = (n: string) => canonical.get(n) || n
  const pair = (a: string, b: string) => [lower(c(a)), lower(c(b))].sort().join('|')
  const scenes = new Map<string, number>()
  for (const e of extractions) {
    const seen = new Set<string>()
    for (const r of e.relationships) {
      const kind = familyKind(r.label)
      if (kind) seen.add(`${pair(r.from, r.to)}|${kind}`)
    }
    for (const k of seen) scenes.set(k, (scenes.get(k) || 0) + 1)
  }
  // Marriage is exclusive: for each person, only the partner the book marries
  // them to most often. The live read married Ethan to Mattie in two scenes,
  // against five that married him to Zeena; two scenes pass a vote of two.
  const spouseScenes = new Map<string, Map<string, number>>()
  for (const [k, n] of scenes) {
    const [a, b, kind] = k.split('|')
    if (kind !== 'marriage') continue
    for (const [x, y] of [
      [a, b],
      [b, a]
    ]) {
      if (!spouseScenes.has(x)) spouseScenes.set(x, new Map())
      spouseScenes.get(x)!.set(y, n)
    }
  }
  const isChiefSpouse = (x: string, y: string) => {
    const m = spouseScenes.get(x)
    if (!m) return false
    const best = Math.max(...m.values())
    return (m.get(y) || 0) === best
  }
  return (from, to, label) => {
    const kind = familyKind(label)
    if (!kind) return true
    if ((scenes.get(`${pair(from, to)}|${kind}`) || 0) < 2) return false
    if (kind !== 'marriage') return true
    const a = lower(c(from))
    const b = lower(c(to))
    return isChiefSpouse(a, b) && isChiefSpouse(b, a)
  }
}

/** Settle an ambiguous short form after the fact (a model's choice, or the author's). */
export function assignAlias(res: NameResolution, name: string, to: string): void {
  const canon = res.canonical.get(to) || to
  res.canonical.set(name, canon)
  if (!res.aliases.has(canon)) res.aliases.set(canon, [])
  if (!res.aliases.get(canon)!.includes(name) && name !== canon) res.aliases.get(canon)!.push(name)
  res.ambiguous = res.ambiguous.filter((a) => a.name !== name)
}

export function characterCounts(extractions: SceneExtraction[]): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (n: string) => n && counts.set(n, (counts.get(n) || 0) + 1)
  for (const e of extractions) {
    for (const c of e.characters) add(c.name)
    for (const r of e.relationships) {
      add(r.from)
      add(r.to)
    }
    if (e.pov && !/^(narrator|unknown|none)$/i.test(e.pov)) add(e.pov)
  }
  return counts
}

// ── the writer's record ────────────────────────────────────────────────────

export interface StructuredScene {
  summary: string
  keyFacts: string[]
  metadataStatus: 'ok'
  usedEntities: { characterNames: string[]; locationNames: string[]; objectNames: string[] }
  newEntities: {
    characters: Array<{ name: string; role: string; description: string }>
    locations: Array<{ name: string; type: string; description: string }>
    plotThreads: Array<{ title: string; status: string; summary: string }>
  }
  networkEvents: Array<{ from: string; to: string; label: string }>
}

/**
 * One scene's extraction as the writer's structured output, with every name
 * replaced by its canonical form. `keep` drops people the book barely
 * mentions from the bible (they stay in the scene's cast and digest).
 */
export function toStructured(
  e: SceneExtraction,
  canonical: Map<string, string>,
  keep: (canonicalName: string) => boolean = () => true,
  opts: {
    places?: { canonical: Map<string, string>; keep: (name: string) => boolean }
    relation?: (from: string, to: string, label: string) => boolean
  } = {}
): StructuredScene {
  const c = (n: string) => canonical.get(n) || n
  const pc = (n: string) => opts.places?.canonical.get(n) || n
  const keepPlace = opts.places?.keep || (() => true)
  const relation = opts.relation || (() => true)
  const places = uniqueBy(
    e.places.map((p) => ({ ...p, name: pc(p.name) })),
    (p) => lower(p.name)
  )
  const chars = uniqueBy(
    e.characters.map((x) => ({ ...x, name: c(x.name) })),
    (x) => lower(x.name)
  )
  const out: StructuredScene = {
    summary: e.summary,
    keyFacts: e.keyFacts,
    metadataStatus: 'ok',
    usedEntities: {
      characterNames: chars.map((x) => x.name),
      locationNames: places.map((p) => p.name),
      objectNames: []
    },
    newEntities: {
      characters: chars
        .filter((x) => keep(x.name))
        .map((x) => ({
          name: x.name,
          role: x.role || 'unknown',
          description: x.description || ''
        })),
      locations: places
        .filter((p) => keepPlace(p.name))
        .map((p) => ({
          name: p.name,
          type: p.type || 'unknown',
          description: p.description || ''
        })),
      plotThreads: []
    },
    networkEvents: uniqueBy(
      e.relationships
        .filter((r) => relation(r.from, r.to, r.label))
        .map((r) => {
          const n = normalizeRelation(r.label)
          const [from, to] =
            n.symmetric && lower(c(r.to)) < lower(c(r.from))
              ? [c(r.to), c(r.from)]
              : [c(r.from), c(r.to)]
          return { from, to, label: n.label }
        })
        .filter((r) => keep(r.from) && keep(r.to) && lower(r.from) !== lower(r.to)),
      (r) => `${lower(r.from)}|${lower(r.to)}|${lower(r.label)}`
    )
  }
  // A link needs both people in the bible before it is written: the network
  // drops links to names it does not know. On the live read the prologue's
  // "Ethan married to Zeena" was dropped because Zeena was only named in the
  // link, not in the prologue's cast -- and once relationships were sent only
  // when they change, nothing later brought it back.
  const known = new Set(out.newEntities.characters.map((x) => lower(x.name)))
  for (const ev of out.networkEvents) {
    for (const n of [ev.from, ev.to]) {
      if (!known.has(lower(n))) {
        known.add(lower(n))
        out.newEntities.characters.push({ name: n, role: 'unknown', description: '' })
      }
    }
  }
  return out
}

// ── one relationship per pair, over the whole book ─────────────────────────

const STRENGTH: Record<string, number> = {
  'married to': 9,
  'parent of': 8,
  'child of': 8,
  'sibling of': 8,
  'cousin of': 8,
  'related to': 8,
  employs: 6,
  'works for': 6,
  'in love with': 5,
  'formerly close to': 5,
  'rival of': 4,
  'hostile to': 4,
  'cares for': 3,
  'friends with': 3,
  'neighbour of': 2,
  'acquainted with': 1
}
const STRUCTURAL = 6

/**
 * What the import sends the network, chapter by chapter. The network keeps
 * one relationship per pair and a new kind of link closes the old one -- right
 * for the writer, who reports a relationship when it changes, wrong for a
 * reader that describes every pair in every chapter: on the live read
 * "married to" was closed by "cares for" in one chapter and reopened in the
 * next, four times. So, walking the book in order, per pair:
 *
 * - a structural link (marriage, family, employment) stays; a mood does not
 *   replace it;
 * - a weaker description does not replace a stronger one ("acquainted with"
 *   does not undo "in love with"), except the explicit change "formerly close to";
 * - the same link again is not sent again.
 *
 * `chapters` are the structured scenes of each chapter in reading order; their
 * `networkEvents` are filtered in place.
 */
export function stabilizeRelations(chapters: StructuredScene[][]): void {
  const current = new Map<string, string>()
  const strength = (label: string) => STRENGTH[label] ?? 2
  for (const scenes of chapters) {
    for (const scene of scenes) {
      const events = [...scene.networkEvents].sort((a, b) => strength(b.label) - strength(a.label))
      const kept: StructuredScene['networkEvents'] = []
      for (const ev of events) {
        const pair = [lower(ev.from), lower(ev.to)].sort().join('|')
        const now = current.get(pair)
        if (now === ev.label) continue
        if (now) {
          const s = strength(now)
          if (s >= STRUCTURAL && strength(ev.label) < STRUCTURAL) continue
          if (strength(ev.label) < s && ev.label !== 'formerly close to') continue
        }
        current.set(pair, ev.label)
        kept.push(ev)
      }
      scene.networkEvents = kept
    }
  }
}

// ── the story profile ──────────────────────────────────────────────────────

export interface StoryProfile {
  genre: string
  tone: string
  premise: string
  centralConflict: string
  themes: string[]
  setting: string
}

export const STORY_PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    genre: { type: 'string' },
    tone: { type: 'string' },
    premise: { type: 'string' },
    centralConflict: { type: 'string' },
    themes: { type: 'array', items: { type: 'string' } },
    setting: { type: 'string' }
  },
  required: ['genre', 'tone', 'premise', 'centralConflict', 'themes', 'setting']
}

export function storyProfilePrompt(title: string, chapterSummaries: string[]): string {
  return `BOOK: ${title}

WHAT HAPPENS, CHAPTER BY CHAPTER:
${chapterSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Describe this book as it is written (not as it could be):
- "genre": one or two words.
- "tone": a few words.
- "premise": one sentence: the situation the story starts from.
- "centralConflict": one sentence: what is at stake and against what.
- "themes": up to 4 short themes.
- "setting": where and when, in one sentence.`
}
