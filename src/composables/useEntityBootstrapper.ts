import { ref } from 'vue'
import { aiStream, aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStoryNetworkStore } from '../stores/volumeStoryNetworkStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { sanitizeJson } from '../services/ai/aiHelpers'

// Structured-output schema for the entity enrichment call. Used as a
// non-streaming fallback when the streamed JSON can't be parsed.
const ENTITIES_SCHEMA = {
  type: 'object',
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          goal: { type: 'string' },
          voice: { type: 'string' },
          notes: { type: 'string' },
          sampleDialogue: { type: 'string' },
          description: { type: 'string' },
          traits: { type: 'array', items: { type: 'string' } }
        },
        required: ['name']
      }
    },
    locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          notes: { type: 'string' },
          traits: { type: 'array', items: { type: 'string' } }
        },
        required: ['name']
      }
    },
    plotThreads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          notes: { type: 'string' },
          traits: { type: 'array', items: { type: 'string' } }
        },
        required: ['title']
      }
    }
  },
  required: ['characters', 'locations', 'plotThreads']
}

// Cast size scales with the story's requested scope.
//
// These used to be flat minimums (3 characters / 2 locations / 1 thread), and
// because the bootstrapper only ever generates `target - existing`, the floor
// doubled as a ceiling: a ten-chapter novel and a one-shot both opened with
// exactly three characters, and no later stage adds any — the planner has no
// entity-creation path, so the only other source is the scene writer's
// `newEntities`, which never runs if the cast is already sufficient for the
// outline it was handed. That is also why the Story Network stage kept
// reporting "0 relationships": three characters is barely a graph.
const CAST_FLOOR = { characters: 3, locations: 2, plotThreads: 1 }
const CAST_CEIL = { characters: 12, locations: 9, plotThreads: 5 }
const CAST_PER_CHAPTER = { characters: 0.5, locations: 0.35, plotThreads: 0.25 }

// The opening cast is deliberately a fraction of the full target. The remainder
// is filled by `expandCast` once the chapter skeleton exists, so the rest of the
// cast arrives with a place in the arc instead of being invented up front from
// the synopsis alone — and so neither call has to emit a dozen fully-specified
// entities in one JSON response, which is the shape that truncates.
const BOOTSTRAP_SHARE = 0.6

// Per-type cap on what any single call may ask for. A long story reaches its
// target across bootstrap + expansion rather than in one oversized response.
const MAX_NEW_PER_CALL = 6

/**
 * How large a cast this story's scope warrants.
 *
 * `scope` is the generator's structure spec (`{ chapters, scenesPerChapter,
 * wordsPerChapter }`) or anything carrying a `chapters` count. With no scope the
 * result is exactly the old floors, so callers that don't know the shape of the
 * story keep the previous behaviour.
 */
function castTargetsFor(scope: any) {
  const chapters = Number(scope?.chapters) > 0 ? Number(scope.chapters) : 0
  const target = (type: 'characters' | 'locations' | 'plotThreads') =>
    Math.min(CAST_CEIL[type], CAST_FLOOR[type] + Math.ceil(chapters * CAST_PER_CHAPTER[type]))
  return {
    characters: target('characters'),
    locations: target('locations'),
    plotThreads: target('plotThreads')
  }
}

const ENRICH_ENTITIES_PROMPT = `You are a fiction worldbuilder enriching existing story entities and filling gaps.

For each existing entity, enhance its description, traits, and notes to better fit the story. Add concrete details, sensory cues, and world-consistent flavor. Keep the name and core identity intact — never rename or replace.

For new entities needed to reach minimum counts, generate them from scratch.

CHARACTER format: { "name": "...", "role": "...", "goal": "...", "voice": "...", "notes": "...", "sampleDialogue": "...", "description": "...", "traits": ["niche detail 1", "niche detail 2"] }
LOCATION format: { "name": "...", "description": "...", "notes": "...", "traits": ["niche detail 1", "niche detail 2"] }
PLOT THREAD format: { "title": "...", "notes": "...", "traits": ["niche detail 1", "niche detail 2"] }

Return valid JSON with no markdown, no explanation. The JSON must have exactly three keys: "characters" (array), "locations" (array), "plotThreads" (array). Include ALL entities — both enhanced existing ones and any new ones — in the response arrays.`

const EXPAND_CAST_PROMPT = `You are a story architect deciding which NEW characters, locations, plot threads and factions a planned story arc still needs.

You are given the existing cast and the chapter-by-chapter skeleton of the story. Read the arc and name what the later chapters require but the story does not have yet: the antagonist the midpoint turns on, a mentor or foil, a rival, the place a reversal happens in, a subplot that pays off at the end, the order or court that moves against the protagonist.

RULES:
- Return ONLY entities that do not already exist. Never repeat, rename, restate or "improve" an existing one.
- Every entity must earn its place in the arc. In "notes", say which chapter it enters and what it changes.
- Do not invent entities to fill a quota. Returning fewer than asked for is correct if the arc does not need them.

CRITICAL — a body of PEOPLE is a group, never a plot thread:
- An order, court, council, guild, house, cult, faction, brotherhood or company goes in "groups", with its members listed by name.
- A plot thread is an EVENT, a QUESTION or a TENSION that unfolds — "The Price of Power", "Who signed the order". If you can put people *in* it, it is a group, not a plot thread.
- A group's members may be characters you are creating now OR characters that already exist. Use exact names.
- Never list the same thing twice. If it is in "groups", it must NOT also appear in "plotThreads".

CHARACTER format: { "name": "...", "role": "...", "goal": "...", "voice": "...", "notes": "...", "sampleDialogue": "...", "description": "...", "traits": ["niche detail 1", "niche detail 2"] }
LOCATION format: { "name": "...", "description": "...", "notes": "...", "traits": ["niche detail 1", "niche detail 2"] }
PLOT THREAD format: { "title": "...", "notes": "...", "traits": ["niche detail 1", "niche detail 2"] }
GROUP format: { "name": "...", "description": "...", "members": ["Exact Character Name", "Another Exact Name"] }

Return valid JSON with no markdown, no explanation. The JSON must have exactly four keys: "characters" (array), "locations" (array), "plotThreads" (array), "groups" (array).`

// Factions per expansion. A story gains a couple of standing bodies across an
// arc, not one per chapter — and each costs member names the model has to keep
// consistent with the cast it is inventing in the same breath.
const MAX_NEW_GROUPS = 3
const TOKENS_PER_NEW_GROUP = 90

// Desaturated slate — reads as structure, not as another entity colour. Matches
// the on-brand group palette in StoryNetwork (no purple, no neon).
const FACTION_GROUP_COLOR = '#6e8bb5'

/**
 * Titles that name a body of PEOPLE rather than an event or a tension.
 *
 * Deliberately excludes "pact" and "accord": those are agreements, and live runs
 * produced "The Forgotten Pact" and "The Silent Accord" as genuine plot threads.
 * A word only earns a place here if a story could put members *in* it.
 */
const ORGANISATION_TITLE =
  /\b(court|order|council|guild|circle|brotherhood|sisterhood|league|clan|house|cabal|legion|sect|coven|syndicate|alliance|assembly|conclave|tribunal|watch|wardens?|keepers?|cult|dominion|covenant)\b/i

const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    members: { type: 'array', items: { type: 'string' } }
  },
  required: ['name']
}

// Token budget for the expansion call, sized against the formats above. Left
// implicit it would fall back to a flat default that a six-character response
// overruns, and a truncated response is a dropped cast.
const TOKENS_PER_NEW_CHARACTER = 220
const TOKENS_PER_NEW_LOCATION = 110
const TOKENS_PER_NEW_THREAD = 90

// A hundred-chapter skeleton is not a useful prompt — it is a wall. Sample it
// evenly so the model still sees the shape of the whole arc, beginning to end.
const MAX_ARC_CHAPTERS_IN_PROMPT = 40

// The expansion call is one bounded request, but it sits inside the planner's
// idle watchdog, so give it the same silence tolerances planning uses.
const EXPAND_IDLE_TIMEOUT_MS = 90_000
const EXPAND_FIRST_TOKEN_TIMEOUT_MS = 300_000

function summarizeArc(chapters: any[]) {
  const list = Array.isArray(chapters) ? chapters : []
  const step = Math.max(1, Math.ceil(list.length / MAX_ARC_CHAPTERS_IN_PROMPT))
  return list
    .filter((_: any, i: number) => i % step === 0)
    .map((c: any, i: number) => {
      const n = c.chapterNumber || i * step + 1
      const beat = c.goal || c.arcPosition || ''
      const hook = c.hookEnding ? ` → ${c.hookEnding}` : ''
      return `${n}. ${c.title || 'Untitled'}${beat ? ` — ${beat}` : ''}${hook}`
    })
    .join('\n')
}

// Bound each array to what was actually asked for. An unbounded array tells a
// grammar-constrained model it may keep emitting entities indefinitely, which is
// the same failure the chapter planner batches around.
function makeExpansionSchema(need: {
  characters: number
  locations: number
  plotThreads: number
  groups: number
}) {
  const p: any = ENTITIES_SCHEMA.properties
  return {
    ...ENTITIES_SCHEMA,
    properties: {
      characters: { ...p.characters, maxItems: need.characters },
      locations: { ...p.locations, maxItems: need.locations },
      plotThreads: { ...p.plotThreads, maxItems: need.plotThreads },
      groups: { type: 'array', items: GROUP_SCHEMA, maxItems: need.groups }
    }
  }
}

/** Deterministic id so re-running an expansion updates a faction instead of cloning it. */
function factionGroupId(name: string): string {
  return `group-faction-${normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function castGap(target: number, existing: number) {
  return Math.min(MAX_NEW_PER_CALL, Math.max(0, target - existing))
}

// Canvas node ids are `${prefix}-${entityId}` — the same shape `commitSync` and
// StoryNetwork build, so the three paths that create entities all address the
// same nodes.
const ENTITY_PREFIX: Record<string, string> = {
  character: 'char',
  location: 'loc',
  plotThread: 'thread'
}

/**
 * Put newly committed entities on the Story Network canvas.
 *
 * Writing to the story bible is not enough: the canvas renders only entities
 * that have a node instance, so without this an entity is in the bible, in the
 * volume, in every prompt — and invisible in the one view built to show it.
 * `commitSync` already does this for entities the scene writer discovers; these
 * two paths did not.
 *
 * Best-effort — a canvas write must never fail a generation run.
 */
async function putOnCanvas(
  projectId: any,
  ids: { characters: string[]; locations: string[]; plotThreads: string[] }
) {
  const baseIds = [
    ...ids.characters.map((id) => `${ENTITY_PREFIX.character}-${id}`),
    ...ids.locations.map((id) => `${ENTITY_PREFIX.location}-${id}`),
    ...ids.plotThreads.map((id) => `${ENTITY_PREFIX.plotThread}-${id}`)
  ]
  if (!baseIds.length) return 0
  try {
    return await useStoryGraphStore().ensureNodeInstances(projectId, baseIds)
  } catch (err) {
    console.warn('[useEntityBootstrapper] could not place new entities on the canvas:', err)
    return 0
  }
}

/**
 * Turn proposed factions into real graph groups holding their members.
 *
 * "The Shadow Court" is a body of people, but the entity model has only
 * character / location / plotThread — so organisations used to land as
 * plot-thread titles (verified: 2 of 9) or dissolve into a prose mention with no
 * entity at all. The graph already supports groups with membership and nesting;
 * this is what finally puts them there.
 *
 * The group is tagged with `parentVolumeId` rather than a parent group id: the
 * volume's box is built later, when the run finishes, and `computeVolumeGroups`
 * resolves the nesting then.
 *
 * Best-effort — never throws into the planning stage.
 */
async function commitFactionGroups({
  projectId,
  volumeId,
  proposed,
  limit,
  characters,
  onPartialData
}: {
  projectId: any
  volumeId: any
  proposed: any
  limit: number
  characters: any[]
  onPartialData?: any
}): Promise<number> {
  const items = Array.isArray(proposed) ? proposed.slice(0, Math.max(0, limit)) : []
  if (!items.length || !projectId) return 0

  const byName = new Map<string, any>()
  for (const c of characters) byName.set(normalizeName(c.name), c)

  try {
    const graphStore = useStoryGraphStore()
    const existingGroups: any[] = (await graphStore.loadGroups(projectId)) || []
    const existingParents: Record<string, string> =
      (await graphStore.loadNodeParents(projectId)) || {}
    const byId = new Map(existingGroups.map((g: any) => [String(g.id), g]))

    const nextParents = { ...existingParents }
    let created = 0

    for (const item of items) {
      const name = String(item?.name || '').trim()
      if (!name) continue

      const memberIds = (Array.isArray(item.members) ? item.members : [])
        .map((m: any) => byName.get(normalizeName(m)))
        .filter(Boolean)
        .map((c: any) => `${ENTITY_PREFIX.character}-${c.id}`)

      // A faction nobody is in is a name, not a group. Dropping it here is why
      // an unresolvable member list degrades to nothing rather than an empty box.
      if (memberIds.length === 0) continue

      const id = factionGroupId(name)
      await graphStore.ensureNodeInstances(projectId, memberIds)

      const existing = byId.get(id)
      if (existing) {
        existing.name = name
        existing.parentVolumeId = volumeId ?? existing.parentVolumeId ?? null
      } else {
        const group = {
          id,
          name,
          color: FACTION_GROUP_COLOR,
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          parentVolumeId: volumeId ?? null,
          parentGroupId: null
        }
        existingGroups.push(group)
        byId.set(id, group)
        created++
      }

      for (const baseId of memberIds) nextParents[baseId] = id
      try {
        onPartialData?.('group', name)
      } catch {
        // Best-effort progress callback; a throwing consumer must not break the run.
      }
    }

    if (created > 0 || items.length > 0) {
      await graphStore.saveGroups(projectId, existingGroups)
      await graphStore.saveNodeParents(projectId, nextParents)
    }
    return created
  } catch (err) {
    console.warn('[useEntityBootstrapper] could not commit faction groups:', err)
    return 0
  }
}

function normalizeName(name: any) {
  return name?.trim().toLowerCase() || ''
}

function mergeTraits(existingTraits: any, newTraits: any) {
  const set = new Set([...(existingTraits || []), ...(newTraits || [])])
  return Array.from(set)
}

function mergeNotes(existingNotes: any, newNotes: any) {
  if (!newNotes) return existingNotes || ''
  if (!existingNotes) return newNotes
  const cleanExisting = existingNotes.trim()
  const cleanNew = newNotes.trim()
  if (!cleanNew) return cleanExisting
  if (cleanExisting.includes(cleanNew.slice(0, 60))) return cleanExisting
  return cleanExisting + (cleanExisting.endsWith('.') ? ' ' : '. ') + cleanNew
}

export function useEntityBootstrapper() {
  const isBootstrapping = ref(false)
  const bootstrapError = ref(null)

  async function bootstrapEntities({ synopsis, projectId, volumeId, onPartialData, scope }: { synopsis: any; projectId: any; volumeId: any; onPartialData: any; scope?: any }) {
    isBootstrapping.value = true
    bootstrapError.value = null

    const storyBibleStore = useStoryBibleStore()
    const networkStore = useVolumeStoryNetworkStore()

    try {
      const existingChars = storyBibleStore.characters
      const existingLocs = storyBibleStore.locations
      const existingThreads = storyBibleStore.plotThreads

      // Open with a share of the scope-derived target; `expandCast` fills the
      // rest once the arc is known.
      const targets = castTargetsFor(scope)
      const opening = {
        characters: Math.max(CAST_FLOOR.characters, Math.ceil(targets.characters * BOOTSTRAP_SHARE)),
        locations: Math.max(CAST_FLOOR.locations, Math.ceil(targets.locations * BOOTSTRAP_SHARE)),
        plotThreads: Math.max(CAST_FLOOR.plotThreads, Math.ceil(targets.plotThreads * BOOTSTRAP_SHARE))
      }

      const needChars = castGap(opening.characters, existingChars.length)
      const needLocs = castGap(opening.locations, existingLocs.length)
      const needThreads = castGap(opening.plotThreads, existingThreads.length)

      const charsSparse = existingChars.some((c) => !c.traits?.length || !c.goal)
      const locsSparse = existingLocs.some((l) => !l.description)
      const threadsSparse = existingThreads.some((t) => !t.notes)

      if (
        needChars === 0 &&
        needLocs === 0 &&
        needThreads === 0 &&
        !charsSparse &&
        !locsSparse &&
        !threadsSparse
      ) {
        return { generatedIds: { characters: [], locations: [], plotThreads: [] } }
      }

      const existingJson = JSON.stringify(
        {
          characters: existingChars.map((c) => ({
            name: c.name,
            role: c.role,
            description: c.description,
            goal: c.goal,
            voice: c.voice,
            notes: c.notes,
            sampleDialogue: c.sampleDialogue,
            traits: c.traits || []
          })),
          locations: existingLocs.map((l) => ({
            name: l.name,
            description: l.description,
            notes: l.notes,
            traits: l.traits || []
          })),
          plotThreads: existingThreads.map((t) => ({
            title: t.title,
            notes: t.notes,
            traits: t.traits || []
          }))
        },
        null,
        2
      )

      const userPrompt = `Story synopsis: "${synopsis}"

EXISTING ENTITIES (enhance or leave as-is):
${existingJson}

TASK:
1. For each existing entity, enhance its description, traits, and notes to better fit the story world. Keep the name and core identity unchanged.
2. Generate ${needChars} new character(s), ${needLocs} new location(s), and ${needThreads} new plot thread(s) as needed.
3. Return ALL entities in the output — enhanced existing ones plus any new ones — under the same three keys.`

      let accumulated = ''
      const emittedNames = new Set()
      let scanOffset = 0

      await aiStream(
        userPrompt,
        ENRICH_ENTITIES_PROMPT,
        (chunk) => {
          accumulated += chunk

          const regex = /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g
          regex.lastIndex = Math.max(0, scanOffset - 200)
          let match

          while ((match = regex.exec(accumulated)) !== null) {
            const name = match[1]
            if (!emittedNames.has(name)) {
              emittedNames.add(name)

              const charIdx = accumulated.lastIndexOf('"characters"', match.index)
              const locIdx = accumulated.lastIndexOf('"locations"', match.index)
              const type = locIdx > charIdx ? 'location' : 'character'

              try {
                if (onPartialData) onPartialData(type, name)
              } catch {
                // Best-effort progress callback; a throwing consumer must not break streaming.
              }
            }
          }
          scanOffset = Math.max(0, accumulated.length - 200)
        },
        {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.7
        }
      )

      let parsed: any = sanitizeJson(accumulated)
      if (!parsed) {
        // Streamed output wasn't parseable — retry once with structured output
        // (native schema-constrained on capable providers, sanitizeJson fallback
        // otherwise) so a single malformed stream doesn't abort the whole run.
        parsed = await aiGenerateJson(userPrompt, ENRICH_ENTITIES_PROMPT, {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.7,
          schema: ENTITIES_SCHEMA,
          schemaName: 'story_entities'
        }).catch(() => null)
      }
      if (!parsed) {
        throw new Error('Failed to parse generated entities')
      }

      const charByKey = new Map()
      for (const c of existingChars) charByKey.set(normalizeName(c.name), c)

      const locByKey = new Map()
      for (const l of existingLocs) locByKey.set(normalizeName(l.name), l)

      const threadByKey = new Map()
      for (const t of existingThreads) threadByKey.set(normalizeName(t.title), t)

      const generatedIds: { characters: string[]; locations: string[]; plotThreads: string[] } = { characters: [], locations: [], plotThreads: [] }

      const newCharacters = []
      for (const char of parsed.characters || []) {
        if (!char.name) continue
        const key = normalizeName(char.name)
        const existing = charByKey.get(key)

        if (existing) {
          // Canon lock: hand-authored (approved) or explicitly locked entities
          // may only be gap-filled, never overwritten — the enricher can add
          // missing fields and merge traits/notes, but can't rewrite established
          // core identity. Generated entities remain fully enrichable.
          const locked = existing.canonLocked || existing.generationStatus === 'approved'
          const update: Record<string, any> = {}
          const canSet = (field: any, val: any) => {
            if (!val || val === existing[field]) return
            if (locked && existing[field]) return
            update[field] = val
          }
          canSet('role', char.role)
          canSet('goal', char.goal)
          canSet('voice', char.voice)
          canSet('description', char.description)
          canSet('sampleDialogue', char.sampleDialogue)

          const mergedTraits = mergeTraits(existing.traits, char.traits)
          if (mergedTraits.length !== (existing.traits || []).length) update.traits = mergedTraits

          const mergedNotes = mergeNotes(existing.notes, char.notes)
          if (mergedNotes !== (existing.notes || '')) update.notes = mergedNotes

          if (Object.keys(update).length > 0) {
            await storyBibleStore.updateCharacterData(existing.id, update, projectId)
          }
          charByKey.delete(key)
        } else {
          newCharacters.push({
            name: char.name,
            role: char.role || '',
            goal: char.goal || '',
            voice: char.voice || '',
            description: char.description || '',
            notes: char.notes || '',
            sampleDialogue: char.sampleDialogue || '',
            traits: char.traits || [],
            generationStatus: 'generated'
          })
        }
      }
      // Atomic bulk insert of the new characters (all-or-nothing), then assign
      // each to the active volume.
      if (newCharacters.length) {
        const ids = await storyBibleStore.addCharactersBatchData(projectId, newCharacters)
        generatedIds.characters.push(...ids)
        if (volumeId) {
          for (const id of ids) {
            await networkStore.assignEntityToVolume('character', id, volumeId, false)
          }
        }
      }

      const newLocations = []
      for (const loc of parsed.locations || []) {
        if (!loc.name) continue
        const key = normalizeName(loc.name)
        const existing = locByKey.get(key)

        if (existing) {
          const locked = existing.canonLocked || existing.generationStatus === 'approved'
          const update: Record<string, any> = {}
          if (
            loc.description &&
            loc.description !== existing.description &&
            !(locked && existing.description)
          )
            update.description = loc.description
          const mergedTraits = mergeTraits(existing.traits, loc.traits)
          if (mergedTraits.length !== (existing.traits || []).length) update.traits = mergedTraits
          const mergedNotes = mergeNotes(existing.notes, loc.notes)
          if (mergedNotes !== (existing.notes || '')) update.notes = mergedNotes
          if (Object.keys(update).length > 0) {
            await storyBibleStore.updateLocationData(existing.id, update, projectId)
          }
          locByKey.delete(key)
        } else {
          newLocations.push({
            name: loc.name,
            description: loc.description || '',
            notes: loc.notes || '',
            traits: loc.traits || [],
            generationStatus: 'generated'
          })
        }
      }
      if (newLocations.length) {
        const ids = await storyBibleStore.addLocationsBatchData(projectId, newLocations)
        generatedIds.locations.push(...ids)
        if (volumeId) {
          for (const id of ids) {
            await networkStore.assignEntityToVolume('location', id, volumeId, false)
          }
        }
      }

      const newPlotThreads = []
      for (const thread of parsed.plotThreads || []) {
        if (!thread.title) continue
        const key = normalizeName(thread.title)
        const existing = threadByKey.get(key)

        if (existing) {
          const update: Record<string, any> = {}
          const mergedTraits = mergeTraits(existing.traits, thread.traits)
          if (mergedTraits.length !== (existing.traits || []).length) update.traits = mergedTraits
          const mergedNotes = mergeNotes(existing.notes, thread.notes)
          if (mergedNotes !== (existing.notes || '')) update.notes = mergedNotes
          if (Object.keys(update).length > 0) {
            await storyBibleStore.updatePlotThreadData(existing.id, update, projectId)
          }
          threadByKey.delete(key)
        } else {
          newPlotThreads.push({
            title: thread.title,
            notes: thread.notes || '',
            traits: thread.traits || [],
            generationStatus: 'generated'
          })
        }
      }
      if (newPlotThreads.length) {
        const ids = await storyBibleStore.addPlotThreadsBatchData(projectId, newPlotThreads)
        generatedIds.plotThreads.push(...ids)
        if (volumeId) {
          for (const id of ids) {
            await networkStore.assignEntityToVolume('plotThread', id, volumeId, false)
          }
        }
      }

      await putOnCanvas(projectId, generatedIds)

      return { generatedIds }
    } catch (err: any) {
      bootstrapError.value = err.message || 'Entity bootstrapping failed'
      throw err
    } finally {
      isBootstrapping.value = false
    }
  }

  /**
   * Second cast pass — run once the chapter skeleton exists, before scenes are
   * planned.
   *
   * Without it a story's cast is frozen at whatever the synopsis alone
   * suggested: the planner has no entity-creation path, and the scene writer's
   * `newEntities` only reports people it already chose to use, which it rarely
   * does when the outline it was handed never called for anyone new. So the
   * antagonist the midpoint turns on and the subplot the ending pays off never
   * get created, however long the book is.
   *
   * Here the arc is known, so the gap can be filled deliberately — and the new
   * entities land in the bible and the volume network before the scenes that
   * will cast them are planned.
   *
   * Best-effort by contract: every failure path returns an empty result instead
   * of throwing. A plan with an unexpanded cast is still a usable plan, and this
   * runs inside the planner's idle watchdog.
   */
  async function expandCast({
    synopsis,
    projectId,
    volumeId,
    chapters,
    storyArc,
    scope,
    onPartialData
  }: {
    synopsis: any
    projectId: any
    volumeId: any
    chapters: any[]
    storyArc?: any
    scope?: any
    onPartialData?: any
  }) {
    const empty = {
      generatedIds: { characters: [], locations: [], plotThreads: [] },
      added: 0
    }

    const storyBibleStore = useStoryBibleStore()
    const networkStore = useVolumeStoryNetworkStore()

    const existingChars = storyBibleStore.characters
    const existingLocs = storyBibleStore.locations
    const existingThreads = storyBibleStore.plotThreads

    const targets = castTargetsFor(scope)
    const need = {
      characters: castGap(targets.characters, existingChars.length),
      locations: castGap(targets.locations, existingLocs.length),
      plotThreads: castGap(targets.plotThreads, existingThreads.length),
      // Only worth asking for factions once there are enough people to put in
      // one — a "group" of one is just a character with extra steps.
      groups: existingChars.length + castGap(targets.characters, existingChars.length) >= 4 ? MAX_NEW_GROUPS : 0
    }
    if (!need.characters && !need.locations && !need.plotThreads) return empty

    const arcDigest = summarizeArc(chapters)
    if (!arcDigest) return empty

    const arcBlock = [
      storyArc?.centralConflict ? `CENTRAL CONFLICT: ${storyArc.centralConflict}` : '',
      storyArc?.emotionalJourney ? `EMOTIONAL JOURNEY: ${storyArc.emotionalJourney}` : '',
      storyArc?.resolution ? `RESOLUTION: ${storyArc.resolution}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const nameList = (names: string[]) => (names.length ? names.join(', ') : '(none)')
    const userPrompt = `Story synopsis: "${synopsis}"
${arcBlock ? `\n${arcBlock}\n` : ''}
### THE PLANNED ARC
${arcDigest}

### EXISTING CAST — these already exist, do not return any of them
Characters: ${nameList(existingChars.map((c: any) => c.name))}
Locations: ${nameList(existingLocs.map((l: any) => l.name))}
Plot threads: ${nameList(existingThreads.map((t: any) => t.title))}

TASK: Return AT MOST ${need.characters} new character(s), ${need.locations} new location(s) and ${need.plotThreads} new plot thread(s) that this arc requires and the existing cast does not cover.${
      need.groups
        ? ` Also return AT MOST ${need.groups} group(s) — orders, courts, factions — each listing its members by exact name.`
        : ''
    }`

    const parsed: any = await aiGenerateJson(userPrompt, EXPAND_CAST_PROMPT, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      idleTimeout: EXPAND_IDLE_TIMEOUT_MS,
      firstTokenTimeout: EXPAND_FIRST_TOKEN_TIMEOUT_MS,
      maxTokens:
        need.characters * TOKENS_PER_NEW_CHARACTER +
        need.locations * TOKENS_PER_NEW_LOCATION +
        need.plotThreads * TOKENS_PER_NEW_THREAD +
        need.groups * TOKENS_PER_NEW_GROUP +
        200,
      schema: makeExpansionSchema(need),
      schemaName: 'cast_expansion',
      role: 'utility'
    }).catch((err: any) => {
      console.warn('[useEntityBootstrapper] cast expansion call failed:', err)
      return null
    })
    if (!parsed) return empty

    // Two ways an organisation ends up in the wrong bucket, both measured live
    // on qwen3:8b with the prompt already forbidding it. Rules the code enforces
    // beat rules the model is asked to remember.
    const allThreads = Array.isArray(parsed.plotThreads) ? parsed.plotThreads : []

    // 1. Listed under BOTH keys — correctly as a group, then again as a thread.
    const factionNames = new Set(
      (Array.isArray(parsed.groups) ? parsed.groups.slice(0, need.groups) : [])
        .map((g: any) => normalizeName(g?.name))
        .filter(Boolean)
    )
    const deduped = factionNames.size
      ? allThreads.filter((t: any) => !factionNames.has(normalizeName(t?.title)))
      : allThreads

    // 2. Filed ONLY as a thread, with no group counterpart to match against —
    //    "The Shadow Court", "The Council's Shadow". Measured at roughly two runs
    //    in three. Nothing downstream can turn one of these back into a group,
    //    since the model never said who is in it, so a body of people would
    //    otherwise sit in the timeline as if it were an event.
    const isOrganisation = (t: any) => ORGANISATION_TITLE.test(String(t?.title || ''))
    const keptThreads = deduped.filter((t: any) => !isOrganisation(t))
    const dropped = deduped.filter(isOrganisation)

    // Never leave the arc with no threads at all — a mis-typed thread beats none.
    if (dropped.length && keptThreads.length) {
      console.info(
        `[useEntityBootstrapper] dropped ${dropped.length} organisation(s) mis-filed as plot threads: ` +
          dropped.map((t: any) => t.title).join(', ')
      )
      parsed.plotThreads = keptThreads
    } else {
      parsed.plotThreads = deduped
    }

    // Create-only. Anything matching an existing name is dropped rather than
    // merged: enrichment is `bootstrapEntities`' job, and silently rewriting an
    // established character from a cast-expansion response is how canon drifts.
    const takeNew = (items: any, keyField: string, known: any[], knownField: string) => {
      const seen = new Set(known.map((e: any) => normalizeName(e[knownField])))
      const out = []
      for (const item of Array.isArray(items) ? items : []) {
        const key = normalizeName(item?.[keyField])
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(item)
      }
      return out
    }

    const newCharacters = takeNew(parsed.characters, 'name', existingChars, 'name')
      .slice(0, need.characters)
      .map((c: any) => ({
        name: c.name,
        role: c.role || '',
        goal: c.goal || '',
        voice: c.voice || '',
        description: c.description || '',
        notes: c.notes || '',
        sampleDialogue: c.sampleDialogue || '',
        traits: c.traits || [],
        generationStatus: 'generated'
      }))
    const newLocations = takeNew(parsed.locations, 'name', existingLocs, 'name')
      .slice(0, need.locations)
      .map((l: any) => ({
        name: l.name,
        description: l.description || '',
        notes: l.notes || '',
        traits: l.traits || [],
        generationStatus: 'generated'
      }))
    const newPlotThreads = takeNew(parsed.plotThreads, 'title', existingThreads, 'title')
      .slice(0, need.plotThreads)
      .map((t: any) => ({
        title: t.title,
        notes: t.notes || '',
        traits: t.traits || [],
        generationStatus: 'generated'
      }))

    const generatedIds: { characters: string[]; locations: string[]; plotThreads: string[] } = {
      characters: [],
      locations: [],
      plotThreads: []
    }

    const commit = async (
      records: any[],
      type: 'character' | 'location' | 'plotThread',
      insert: (rows: any[]) => Promise<string[]>,
      bucket: string[],
      label: (r: any) => string
    ) => {
      if (!records.length) return
      try {
        const ids = await insert(records)
        bucket.push(...ids)
        if (volumeId) {
          for (const id of ids) {
            await networkStore.assignEntityToVolume(type, id, volumeId, false)
          }
        }
        for (const r of records) {
          try {
            onPartialData?.(type, label(r))
          } catch {
            // Best-effort progress callback; a throwing consumer must not break the run.
          }
        }
      } catch (err) {
        console.warn(`[useEntityBootstrapper] failed to commit expanded ${type}s:`, err)
      }
    }

    await commit(
      newCharacters,
      'character',
      (rows) => storyBibleStore.addCharactersBatchData(projectId, rows),
      generatedIds.characters,
      (r) => r.name
    )
    await commit(
      newLocations,
      'location',
      (rows) => storyBibleStore.addLocationsBatchData(projectId, rows),
      generatedIds.locations,
      (r) => r.name
    )
    await commit(
      newPlotThreads,
      'plotThread',
      (rows) => storyBibleStore.addPlotThreadsBatchData(projectId, rows),
      generatedIds.plotThreads,
      (r) => r.title
    )

    await putOnCanvas(projectId, generatedIds)

    const groupsCreated = await commitFactionGroups({
      projectId,
      volumeId,
      proposed: parsed.groups,
      limit: need.groups,
      // Resolve members against the cast as it stands AFTER the new characters
      // landed, so a faction can hold both an existing character and one the
      // same response just invented.
      characters: useStoryBibleStore().characters,
      onPartialData
    })

    return {
      generatedIds,
      groupsCreated,
      added:
        generatedIds.characters.length +
        generatedIds.locations.length +
        generatedIds.plotThreads.length
    }
  }

  return { bootstrapEntities, expandCast, isBootstrapping, bootstrapError }
}

export {
  sanitizeJson,
  normalizeName,
  mergeTraits,
  mergeNotes,
  castTargetsFor,
  castGap,
  summarizeArc,
  // Exported for `npm run verify:cast` so the live check exercises the real
  // prompt, schema and classifier rather than copies that can drift away.
  EXPAND_CAST_PROMPT,
  makeExpansionSchema,
  ORGANISATION_TITLE
}
