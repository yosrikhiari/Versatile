/**
 * Dev-only: inject a large, well-structured sample story into the local Dexie DB
 * so the UI can be exercised at scale without running a full generation. Exposed
 * on `window.VersatileSeed` in dev builds (see main.ts) — call
 * `await VersatileSeed.seedDemoStory()` from the browser console.
 *
 * Creates, under the `test` demo account:
 *   - 1 project, 10 volumes (each a story arc)
 *   - 100 chapters (sections, 10 per volume), 3 scenes (subsections) each = 300 scenes
 *   - a ~300-word prose scene, with `charactersPresent` / `location` / `keyFacts`
 *     so the consistency & seam pipeline can read it
 *   - a story bible of 10 characters / 8 locations / 10 plot threads
 *   - a STORY NETWORK that is organised into 10 volume groups with intra-group and
 *     cross-group (hero / antagonist) edges, so it renders connected, not empty.
 *
 * Seam continuity is preserved on purpose: each chapter carries at least one
 * character from the previous chapter, so the story reads as one continuous arc.
 *
 * Idempotent: a second call with the same title returns the existing project id
 * and does nothing else. Pass `{ force: true }` to wipe and reseed. Scenes are
 * inserted directly (no embedding extraction) so 300 of them seed in seconds
 * without an Ollama backend.
 */

import { db } from './db-core'
import { addSection, addVolume } from './db-structure'
import { countWords } from '../utils/textUtils'
import { saveNodeInstances, saveNodePositions, addGraphEdgesBatch, saveGraphGroups, saveNodeParents } from './db-graph'

const DEMO_USERNAME = 'test'
const DEMO_HASH = 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae'
const PROJECT_TITLE = 'Demo: The Lighthouse Watch (100 chapters)'

// Deterministic pseudo-random so the demo is reproducible across reseeds.
function rng(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

type Entity = { name: string; role: string; goal: string; voice: string; notes: string; home: number }
type Place = { name: string; description: string; home: number }
type Volume = { title: string; summary: string; thread: string; loc: string; cast: string[]; color: string }

const CHARACTERS: Entity[] = [
  { name: 'Captain Halden', role: 'Keeper', goal: 'Keep the light through the dark', voice: 'weathered, terse', notes: 'Forty years a keeper.', home: 0 },
  { name: 'Mira', role: 'Apprentice', goal: 'Prove herself as Halden’s heir', voice: 'eager, observant', notes: 'Halden’s daughter.', home: 0 },
  { name: 'Old Tom', role: 'Lookout', goal: 'Carry word between shore and tower', voice: 'garrulous', notes: 'Former keeper, now the cove’s eyes.', home: 0 },
  { name: 'Seraphine', role: 'Scholar', goal: 'Recover the lost lore', voice: 'precise', notes: 'Keeper of the Sunken Library.', home: 2 },
  { name: 'Bran', role: 'Smuggler', goal: 'Survive the coming war', voice: 'sly', notes: 'Moves between every shore.', home: 1 },
  { name: 'Lady Elowen', role: 'Noble', goal: 'Hold the Ironhold', voice: 'commanding', notes: 'Heir of the keep.', home: 3 },
  { name: 'Father Aldous', role: 'Priest', goal: 'Keep faith in the dark', voice: 'gentle', notes: 'Chaplain of Ironhold.', home: 3 },
  { name: 'Kestrel', role: 'Scout', goal: 'Map the wilds', voice: 'sharp', notes: 'Walker of the Whispering Woods.', home: 4 },
  { name: 'Wynn', role: 'Child', goal: 'Find their family', voice: 'curious', notes: 'Orphan of the marsh.', home: 4 },
  { name: 'Morgath', role: 'Usurper', goal: 'Seize the light for himself', voice: 'cold', notes: 'Exiled keeper, returned.', home: 7 }
]

const LOCATIONS: Place[] = [
  { name: 'The Lighthouse', description: 'A striped tower on the headland.', home: 0 },
  { name: 'The Cove', description: 'A sheltered bay below the tower.', home: 1 },
  { name: 'The Village', description: 'Clusters of cottages inland.', home: 1 },
  { name: 'The Sunken Library', description: 'A flooded archive of drowned books.', home: 2 },
  { name: 'Ironhold Keep', description: 'A stone fortress on the cliff.', home: 3 },
  { name: 'The Whispering Woods', description: 'A forest that remembers.', home: 4 },
  { name: 'The Saltmarsh', description: 'Misted flats where the tide forgets.', home: 5 },
  { name: 'The Highlands', description: 'Windswept moors above the coves.', home: 6 }
]

const VOLUMES: Volume[] = [
  { title: 'The Darkened Lamp', summary: 'The lamp fails; the keepers hold the line.', thread: 'The Darkened Lamp', loc: 'The Lighthouse', cast: ['Captain Halden', 'Mira', 'Old Tom'], color: '#5b8def' },
  { title: 'Word from the Cove', summary: 'A message washes in; the village hides a secret.', thread: 'The Message in the Bottle', loc: 'The Cove', cast: ['Mira', 'Old Tom', 'Seraphine'], color: '#3f9e8f' },
  { title: "The Scholar's Secret", summary: 'The Sunken Library gives up one of its dead.', thread: 'The Sunken Archive', loc: 'The Sunken Library', cast: ['Seraphine', 'Bran'], color: '#9b6bd6' },
  { title: 'Court of Thorns', summary: 'Ironhold’s succession turns violent.', thread: 'The Ironhold Succession', loc: 'Ironhold Keep', cast: ['Lady Elowen', 'Father Aldous'], color: '#d68b4a' },
  { title: 'The Whispering Woods', summary: 'The forest recalls what was buried.', thread: 'The Woods Remember', loc: 'The Whispering Woods', cast: ['Kestrel', 'Wynn'], color: '#4a9bd6' },
  { title: 'The Saltmarsh Pact', summary: 'A truce is signed in the mist.', thread: 'The Marsh Accord', loc: 'The Saltmarsh', cast: ['Bran', 'Lady Elowen'], color: '#5bb58f' },
  { title: 'The Highland War', summary: 'The moors burn; the scout and the keeper ride.', thread: 'The Highland Rising', loc: 'The Highlands', cast: ['Kestrel', 'Captain Halden'], color: '#c2503f' },
  { title: 'Morgath Rises', summary: 'The exiled keeper returns for the light.', thread: 'The Usurper’s Claim', loc: 'Ironhold Keep', cast: ['Morgath', 'Lady Elowen'], color: '#8a4ad6' },
  { title: 'The Long Siege', summary: 'All who remain gather at the lighthouse.', thread: 'The Siege of the Light', loc: 'The Lighthouse', cast: ['Captain Halden', 'Mira', 'Old Tom', 'Seraphine', 'Bran', 'Lady Elowen', 'Father Aldous', 'Kestrel', 'Wynn'], color: '#d64a7a' },
  { title: 'The Light Restored', summary: 'The lamp is lit; the dark is named.', thread: 'The Light Restored', loc: 'The Lighthouse', cast: ['Captain Halden', 'Mira', 'Old Tom', 'Seraphine', 'Bran', 'Lady Elowen', 'Father Aldous', 'Kestrel', 'Wynn', 'Morgath'], color: '#e0b341' }
]

function sceneProse(a: string, b: string, c: string | null, loc: string, thread: string, v: number, ch: number, s: number): string {
  const seed = v * 1000 + ch * 100 + s * 7 + 1
  const r = (n: number) => rng(seed + n)
  const pick = (arr: string[]) => arr[Math.floor(r(3) * arr.length) % arr.length]
  const third = c ? ` ${c}` : ''
  // Thread titles all begin with "The"; strip it so article phrases read
  // "the Message in the Bottle" rather than "the The Message in the Bottle".
  const thr = thread.replace(/^The\s+/, '')
  const S: string[] = []
  S.push(pick([
    `${a} reached ${loc} while the light was still failing.`,
    `${a} was already at ${loc} when the bell sounded.`,
    `Before the others woke, ${a} had crossed into ${loc}.`
  ]))
  S.push(pick([
    `${b} found ${a} there, and said nothing at first.`,
    `${b} arrived at ${loc} with news that would not wait.`,
    `${b} watched ${a} from the doorway of ${loc}.`
  ]))
  S.push(`${a} spoke of the ${thr}, and ${b} answered carefully.`)
  S.push(pick([
    `The ${thr} had begun to turn, though neither said it aloud.`,
    `Somewhere in ${loc} the ${thr} kept its own counsel.`,
    `What the ${thr} wanted, ${loc} had not yet given.`
  ]))
  if (c) S.push(`${c} joined them, and the balance in the room shifted.`)
  S.push(pick([
    `${a} had carried the weight of ${loc} longer than anyone remembered.`,
    `There was a correctness to ${a}'s hands that ${loc} seemed to answer.`,
    `${a} had learned ${loc} the way others learn a language.`
  ]))
  S.push(pick([
    `In chapter ${ch} of this volume, ${a} moved against ${b}, and the air in ${loc} went still.`,
    `In chapter ${ch}, a choice opened at ${loc}, and ${a} took it.`,
    `In chapter ${ch}, ${b} revealed what the ${thr} had hidden.`
  ]))
  S.push(pick([
    `By the time the light returned, something in ${loc} had changed.`,
    `When the light returned to ${loc}, ${a} was not the same.`,
    `The return of the light found ${loc} holding its breath.`
  ]))
  S.push(`${b} would remember ${loc} for the rest of the ${thr}.`)
  if (c) S.push(`${c} left ${loc} changed, and told no one why.`)
  S.push(pick([
    `Later, ${a} would say the ${thr} had chosen them, not the other way around.`,
    `The ${thr} did not end that day, only changed its shape.`,
    `${loc} kept the secret of the ${thr} long after they were gone.`
  ]))
  S.push(pick([
    `${a} and ${b}${third} stood together as the dark pressed the glass.`,
    `Whatever came next, ${loc} had made its judgement known.`,
    `The ${thr} would outlast the chapter, and the chapter the season.`
  ]))
  const para = (start: number) => S.slice(start, start + 4).join(' ')
  return [para(0), para(4), para(8)].join('\n\n')
}

async function ensureDemoUser(): Promise<string> {
  const existing = await (db as any).users.where('username').equals(DEMO_USERNAME).first()
  if (existing) return existing.id
  return (db as any).users.add({
    username: DEMO_USERNAME,
    passwordHash: DEMO_HASH,
    displayName: 'Test User',
    createdAt: new Date().toISOString()
  })
}

/** Wipe any previously-seeded demo project and all of its dependent tables. */
async function clearDemoProject(projectId: string) {
  const sections = await (db as any).sections.where('projectId').equals(projectId).toArray()
  await (db as any).subsections.where('projectId').equals(projectId).delete()
  for (const s of sections) await (db as any).sections.delete(s.id)
  await (db as any).volumes.where('projectId').equals(projectId).delete()
  await (db as any).characters.where('projectId').equals(projectId).delete()
  await (db as any).locations.where('projectId').equals(projectId).delete()
  await (db as any).plotThreads.where('projectId').equals(projectId).delete()
  await (db as any).manuscripts.where('projectId').equals(projectId).delete()
  await (db as any).graphEdges.where('projectId').equals(projectId).delete()
  await (db as any).graphNodeInstances.where('projectId').equals(projectId).delete()
  await (db as any).graphNodePositions.where('projectId').equals(projectId).delete()
  await (db as any).graphNodeParents.where('projectId').equals(projectId).delete()
  await (db as any).graphGroupsV2.where('projectId').equals(projectId).delete()
  await (db as any).groupEdges.where('projectId').equals(projectId).delete()
  await (db as any).projects.delete(projectId)
}

export async function seedDemoStory(opts: { force?: boolean } = {}): Promise<{ projectId: string; title: string; note: string }> {
  const now = new Date().toISOString()
  const userId = await ensureDemoUser()

  const prior = await (db as any).projects.where('name').equals(PROJECT_TITLE).first()
  if (prior && !opts.force) {
    console.info(`[seedDemoStory] Demo project already exists (id=${prior.id}). Pass { force: true } to reseed.`)
    return { projectId: prior.id, title: PROJECT_TITLE, note: 'already present' }
  }
  if (prior && opts.force) await clearDemoProject(prior.id)

  const projectId = await (db as any).projects.add({
    userId,
    name: PROJECT_TITLE,
    genre: 'Gothic Fantasy Saga',
    synopsis: 'Ten volumes, a hundred chapters, and one failing light — the keepers, the court, the woods, and the usurper who would take the lamp for himself.',
    createdAt: now,
    updatedAt: now
  })

  // ---- Volumes ----
  const volumeRows = VOLUMES.map((v, i) => ({
    projectId,
    title: v.title,
    description: v.summary,
    color: v.color,
    sectionIds: [] as string[],
    volumeOrder: i
  }))
  const volumeIds = await (db as any).volumes.bulkAdd(volumeRows, { allKeys: true })
  const volumeIdByIndex = VOLUMES.map((_, i) => volumeIds[i] as string)

  // ---- Story bible ----
  const characterIds = await (db as any).characters.bulkAdd(
    CHARACTERS.map((c) => ({ projectId, generationStatus: 'done', ...c, createdAt: now, updatedAt: now })),
    { allKeys: true }
  )
  const locationIds = await (db as any).locations.bulkAdd(
    LOCATIONS.map((l) => ({ projectId, generationStatus: 'done', ...l, createdAt: now, updatedAt: now })),
    { allKeys: true }
  )
  const threadIds = await (db as any).plotThreads.bulkAdd(
    VOLUMES.map((v) => ({ projectId, generationStatus: 'done', title: v.thread, status: 'active', notes: v.summary, createdAt: now, updatedAt: now })),
    { allKeys: true }
  )

  const charIdByName = new Map<string, string>()
  CHARACTERS.forEach((c, i) => charIdByName.set(c.name, characterIds[i] as string))
  const locIdByName = new Map<string, string>()
  LOCATIONS.forEach((l, i) => locIdByName.set(l.name, locationIds[i] as string))
  const threadIdByIndex = VOLUMES.map((_, i) => threadIds[i] as string)

  // ---- Sections (chapters) ----
  // Distinct, deterministic chapter subtitles so no two chapters read identically.
  const CHAPTER_SUBTITLES = [
    'The Failing Light', 'A Knock Below', 'The Cold Bell', 'Salt on the Wind', 'The Drowned Letter',
    'What the Tide Brought', 'The Long Watch', 'Embers in the Glass', 'The Quiet Hour', 'Before the Dawn',
    'The Iron Door', 'Whispers in the Keep', 'The Sunken Page', 'A Name Recalled', 'The Bent Pin',
    'The Marsh at Night', 'Smoke on the Moor', 'The Usurper’s Step', 'The Gathered Few', 'The Lit Glass',
    'The Last Word', 'A Knock Returned', 'The Pale Signal', 'The Borrowed Boat', 'The Hidden Ledger',
    'The Second Watch', 'The Broken Seal', 'The Witness Tree', 'The Vow Spoken', 'The Calm Before'
  ]
  const SCENE_TITLES = [
    'The Bell', 'The Threshold', 'A Name Spoken', 'The Ledger', 'The Cold Room', 'The Tide Turn',
    'The Broken Seal', 'A Second Knock', 'The Long Table', 'The Vow', 'The Letter', 'The Lantern',
    'The Witness', 'The Quiet', 'The Return'
  ]
  const chapterSubtitle = (v: number, ch: number) =>
    CHAPTER_SUBTITLES[(v * 10 + (ch - 1)) % CHAPTER_SUBTITLES.length]
  const sceneTitle = (v: number, ch: number, s: number) =>
    SCENE_TITLES[(v * 100 + (ch - 1) * 3 + s) % SCENE_TITLES.length]

  // A deterministic, seam-continuous cast window: it rotates through the volume's
  // cast across chapters (so consecutive chapters are not identical) while always
  // sharing at least one character with the previous chapter.
  function chooseChapterCast(cast: string[], prevCast: string[], ch: number): string[] {
    const want = Math.min(3, cast.length)
    if (want === 0) return []
    const start = (ch - 1) % cast.length
    const chosen: string[] = []
    for (let k = 0; k < want; k++) chosen.push(cast[(start + k) % cast.length])
    if (prevCast.length && !chosen.some((c) => prevCast.includes(c))) chosen[0] = prevCast[0]
    return chosen
  }

  const sectionRows: any[] = []
  const sectionIdByKey: Record<string, string> = {}
  for (let v = 0; v < VOLUMES.length; v++) {
    for (let ch = 1; ch <= 10; ch++) {
      const globalChapter = v * 10 + ch
      sectionRows.push({
        projectId,
        title: `Chapter ${globalChapter}: ${chapterSubtitle(v, ch)}`,
        summary: `${VOLUMES[v].summary} — chapter ${ch} of 10.`,
        order: globalChapter - 1,
        status: 'draft',
        volumeId: volumeIdByIndex[v]
      })
    }
  }
  const sectionKeys = await (db as any).sections.bulkAdd(sectionRows, { allKeys: true })
  let sk = 0
  for (let v = 0; v < VOLUMES.length; v++) {
    for (let ch = 1; ch <= 10; ch++) {
      sectionIdByKey[`${v}:${ch}`] = sectionKeys[sk++] as string
    }
  }

  // ---- Subsections (scenes) — inserted directly, no embedding ----
  const subsectionRows: any[] = []
  const manuscriptParts: string[] = []
  let prevCast: string[] = []
  for (let v = 0; v < VOLUMES.length; v++) {
    const vol = VOLUMES[v]
    const locName = vol.loc
    for (let ch = 1; ch <= 10; ch++) {
      const globalChapter = v * 10 + ch
      const chapterCast = chooseChapterCast(vol.cast, prevCast, ch)
      prevCast = chapterCast
      const want = chapterCast.length

      const sectionId = sectionIdByKey[`${v}:${ch}`]
      const chapterScenes: string[] = []
      for (let s = 0; s < 3; s++) {
        // Rotate the focus across the chapter's cast so each scene leads differently.
        const a = chapterCast[s % want]
        const b = chapterCast[(s + 1) % want]
        const c = want > 2 ? chapterCast[(s + 2) % want] : null
        const sceneCast = c ? [a, b, c] : [a, b]
        const content = sceneProse(a, b, c, locName, vol.thread, v, ch, s)
        const keyFacts = [
          `${a} is present at ${locName}`,
          `${vol.thread} advances in chapter ${globalChapter}`,
          `${a} and ${b} confer at ${locName}`
        ]
        subsectionRows.push({
          projectId,
          sectionId,
          title: sceneTitle(v, ch, s),
          summary: `${a} and ${b}${c ? ` and ${c}` : ''} at ${locName}.`,
          order: s,
          contentStatus: 'draft',
          content,
          charactersPresent: sceneCast,
          location: locName,
          keyFacts,
          createdAt: now,
          updatedAt: now
        })
        chapterScenes.push(content)
      }
      // The manuscript carries the real prose, not a one-line summary, so the
      // dashboard word count reflects an actual ~300-word scene per subsection.
      manuscriptParts.push(`# Chapter ${globalChapter}: ${chapterSubtitle(v, ch)}\n\n${chapterScenes.join('\n\n')}`)
    }
  }
  await (db as any).subsections.bulkAdd(subsectionRows)

  await (db as any).volumes.bulkPut(
    VOLUMES.map((v, i) => ({
      id: volumeIdByIndex[i],
      projectId,
      title: v.title,
      description: v.summary,
      color: v.color,
      volumeOrder: i,
      sectionIds: sectionRows.filter((_, idx) => Math.floor(idx / 10) === i).map((_, idx2) => sectionIdByKey[`${i}:${idx2 + 1}`])
    }))
  )

  // ---- Story Network: organised into 10 volume groups ----
  const nodeKey = (prefix: string, id: string) => `${prefix}-${id}`
  const charKeys = CHARACTERS.map((c, i) => nodeKey('char', characterIds[i] as string))
  const locKeys = LOCATIONS.map((l, i) => nodeKey('loc', locationIds[i] as string))
  const threadKeys = VOLUMES.map((_, i) => nodeKey('thread', threadIds[i] as string))
  const allKeys = [...charKeys, ...locKeys, ...threadKeys]

  const instances: Record<string, string[]> = {}
  allKeys.forEach((k) => (instances[k] = [k]))

  // Positions: a ring, ordered by home volume so same-volume nodes sit together.
  const positions: Record<string, { x: number; y: number }> = {}
  allKeys.forEach((k, i) => {
    const angle = (i / allKeys.length) * Math.PI * 2
    positions[k] = { x: 640 + Math.cos(angle) * 520, y: 460 + Math.sin(angle) * 520 }
  })

  const groups = VOLUMES.map((vol, i) => ({
    id: `group-vol-${i}`,
    projectId,
    name: vol.title,
    color: vol.color,
    x: 80 + (i % 5) * 340,
    y: 80 + Math.floor(i / 5) * 320,
    width: 320,
    height: 300,
    volumeId: volumeIdByIndex[i],
    parentVolumeId: null,
    parentGroupId: null,
    groupOrder: i
  }))
  await saveNodeInstances(projectId, instances)
  await saveNodePositions(projectId, positions)
  await saveGraphGroups(projectId, groups)

  // Node parents: each entity belongs to its home-volume group.
  const parents: Record<string, string> = {}
  CHARACTERS.forEach((c, i) => (parents[charKeys[i]] = `group-vol-${c.home}`))
  LOCATIONS.forEach((l, i) => (parents[locKeys[i]] = `group-vol-${l.home}`))
  VOLUMES.forEach((_, i) => (parents[threadKeys[i]] = `group-vol-${i}`))
  await saveNodeParents(projectId, parents)

  // Edges: a properly linked, organised network.
  //  - characters ↔ their volume's thread and location (location via its NODE KEY)
  //  - characters ↔ each other, with relationship types inferred from role so the
  //    usurper reads as an enemy, not an ally
  //  - a thread-to-thread spine (each arc leads into the next) plus a bookend, so
  //    the ten threads form one continuous story instead of ten isolated clusters
  //  - location geography and location↔thread "setting" links
  //  - overarching hero/antagonist ties (Halden drives, Morgath opposes)
  // Edges store RAW entity ids (e.g. `1`), not node keys (`char-1`). The graph
  // component re-applies the `char-`/`loc-`/`thread-` prefix itself via
  // `getEntityBaseId`, so writing a prefixed key here would double-prefix
  // (`char-char-1`) and match no node instance — every edge would be filtered
  // out and the canvas would render unlinked. This mirrors what the real
  // generator (relationships.ts → addGraphEdge) writes.
  const haldenId = charIdByName.get('Captain Halden')!
  const morgathId = charIdByName.get('Morgath')!
  const charByName = new Map(CHARACTERS.map((c) => [c.name, c]))

  function relationType(aName: string, bName: string): string {
    if (aName === 'Morgath' || bName === 'Morgath') {
      const other = aName === 'Morgath' ? bName : aName
      if (other === 'Captain Halden' || other === 'Lady Elowen') return 'enemy'
      return 'rival'
    }
    const isKin = (x?: Entity, y?: Entity) =>
      (x?.role === 'Apprentice' || x?.notes?.includes('daughter')) && y?.role === 'Keeper'
    if (isKin(charByName.get(aName), charByName.get(bName)) || isKin(charByName.get(bName), charByName.get(aName)))
      return 'family'
    const a = charByName.get(aName)
    const b = charByName.get(bName)
    if ((a?.role === 'Noble' && b?.role === 'Smuggler') || (b?.role === 'Noble' && a?.role === 'Smuggler')) return 'rival'
    if ((a?.role === 'Scout' && b?.role === 'Child') || (b?.role === 'Scout' && a?.role === 'Child')) return 'protector'
    return 'ally'
  }

  const edges: any[] = []
  for (let v = 0; v < VOLUMES.length; v++) {
    const vol = VOLUMES[v]
    const tId = threadIdByIndex[v]
    const locId = locIdByName.get(vol.loc)!
    const cIds = vol.cast.map((n) => charIdByName.get(n)!)
    for (const cId of cIds) {
      edges.push({ sourceId: cId, sourceType: 'character', targetId: tId, targetType: 'plotThread', relationshipType: 'involves', description: `${vol.thread} involves this character.` })
      edges.push({ sourceId: cId, sourceType: 'character', targetId: locId, targetType: 'location', relationshipType: 'present_at', description: `Associated with ${vol.loc}.` })
    }
    for (let i = 0; i < cIds.length; i++) {
      for (let j = i + 1; j < cIds.length; j++) {
        const rel = relationType(vol.cast[i], vol.cast[j])
        edges.push({
          sourceId: cIds[i],
          sourceType: 'character',
          targetId: cIds[j],
          targetType: 'character',
          relationshipType: rel,
          description: `${vol.cast[i]} and ${vol.cast[j]} are ${rel}s through ${vol.title}.`
        })
      }
    }
    // The volume's primary location hosts its central thread.
    edges.push({ sourceId: locId, sourceType: 'location', targetId: tId, targetType: 'plotThread', relationshipType: 'setting_for', description: `${vol.loc} is the stage for ${vol.thread}.` })
    // Overarching hero/antagonist ties.
    edges.push({ sourceId: haldenId, sourceType: 'character', targetId: tId, targetType: 'plotThread', relationshipType: 'drives', description: 'Halden’s thread runs through every volume.' })
    edges.push({ sourceId: morgathId, sourceType: 'character', targetId: tId, targetType: 'plotThread', relationshipType: 'opposes', description: 'Morgath opposes the thread of this volume.' })
  }

  // Thread-to-thread spine: each arc leads into the next, tying the saga together.
  for (let v = 0; v < VOLUMES.length - 1; v++) {
    edges.push({
      sourceId: threadIdByIndex[v],
      sourceType: 'plotThread',
      targetId: threadIdByIndex[v + 1],
      targetType: 'plotThread',
      relationshipType: 'leads_to',
      description: `${VOLUMES[v].title} sets up ${VOLUMES[v + 1].title}.`
    })
  }
  // Bookend: the opening failure rhymes with the restored light.
  edges.push({
    sourceId: threadIdByIndex[0],
    sourceType: 'plotThread',
    targetId: threadIdByIndex[VOLUMES.length - 1],
    targetType: 'plotThread',
    relationshipType: 'parallels',
    description: 'The first failing light rhymes with the restored one.'
  })

  // Location geography: how the places connect on the map.
  const LOCATION_LINKS: [string, string, string][] = [
    ['The Lighthouse', 'The Cove', 'near'],
    ['The Cove', 'The Village', 'near'],
    ['The Lighthouse', 'The Sunken Library', 'reached_by_sea'],
    ['Ironhold Keep', 'The Highlands', 'overlooks'],
    ['The Whispering Woods', 'The Saltmarsh', 'borders'],
    ['The Saltmarsh', 'The Cove', 'feeds_into']
  ]
  for (const [a, b, rel] of LOCATION_LINKS) {
    const ak = locIdByName.get(a)
    const bk = locIdByName.get(b)
    if (ak && bk) {
      edges.push({
        sourceId: ak,
        sourceType: 'location',
        targetId: bk,
        targetType: 'location',
        relationshipType: rel,
        description: `${a} is ${rel.replace(/_/g, ' ')} ${b}.`
      })
    }
  }

  await addGraphEdgesBatch(projectId, edges)

  // ---- Manuscript aggregate (drives the dashboard word count) ----
  const manuscriptContent = manuscriptParts.join('\n\n')
  await (db as any).manuscripts.add({
    projectId,
    content: manuscriptContent,
    wordCount: countWords(manuscriptContent),
    updatedAt: now
  })

  const note = `Seeded 10 volumes / 100 chapters / 300 scenes under the "test" account, with a 28-node story network organised into 10 volume groups.`
  console.info(`[seedDemoStory] Done. Project "${PROJECT_TITLE}" (id=${projectId}).\n${note}`)
  return { projectId, title: PROJECT_TITLE, note }
}
