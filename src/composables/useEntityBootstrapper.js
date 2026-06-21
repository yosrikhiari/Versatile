import { ref } from 'vue'
import { aiStream } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStoryNetworkStore } from '../stores/volumeStoryNetworkStore'
import { sanitizeJson } from '../services/ai/aiHelpers'

const MIN_CHARACTERS = 3
const MIN_LOCATIONS = 2
const MIN_THREADS = 1

const ENRICH_ENTITIES_PROMPT = `You are a fiction worldbuilder enriching existing story entities and filling gaps.

For each existing entity, enhance its description, traits, and notes to better fit the story. Add concrete details, sensory cues, and world-consistent flavor. Keep the name and core identity intact — never rename or replace.

For new entities needed to reach minimum counts, generate them from scratch.

CHARACTER format: { "name": "...", "role": "...", "goal": "...", "voice": "...", "notes": "...", "sampleDialogue": "...", "description": "...", "traits": ["niche detail 1", "niche detail 2"] }
LOCATION format: { "name": "...", "description": "...", "notes": "...", "traits": ["niche detail 1", "niche detail 2"] }
PLOT THREAD format: { "title": "...", "notes": "...", "traits": ["niche detail 1", "niche detail 2"] }

Return valid JSON with no markdown, no explanation. The JSON must have exactly three keys: "characters" (array), "locations" (array), "plotThreads" (array). Include ALL entities — both enhanced existing ones and any new ones — in the response arrays.`


function normalizeName(name) {
  return name?.trim().toLowerCase() || ''
}

function mergeTraits(existingTraits, newTraits) {
  const set = new Set([...(existingTraits || []), ...(newTraits || [])])
  return [...set]
}

function mergeNotes(existingNotes, newNotes) {
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

  async function bootstrapEntities({ synopsis, projectId, volumeId, onPartialData }) {
    isBootstrapping.value = true
    bootstrapError.value = null

    const storyBibleStore = useStoryBibleStore()
    const networkStore = useVolumeStoryNetworkStore()

    try {
      const existingChars = storyBibleStore.characters
      const existingLocs = storyBibleStore.locations
      const existingThreads = storyBibleStore.plotThreads

      const needChars = Math.max(0, MIN_CHARACTERS - existingChars.length)
      const needLocs = Math.max(0, MIN_LOCATIONS - existingLocs.length)
      const needThreads = Math.max(0, MIN_THREADS - existingThreads.length)

      const charsSparse = existingChars.some(c => !c.traits?.length || !c.goal)
      const locsSparse = existingLocs.some(l => !l.description)
      const threadsSparse = existingThreads.some(t => !t.notes)

      if (needChars === 0 && needLocs === 0 && needThreads === 0 && !charsSparse && !locsSparse && !threadsSparse) {
        return { generatedIds: { characters: [], locations: [], plotThreads: [] } }
      }

      const existingJson = JSON.stringify({
        characters: existingChars.map(c => ({
          name: c.name, role: c.role, description: c.description, goal: c.goal,
          voice: c.voice, notes: c.notes, sampleDialogue: c.sampleDialogue, traits: c.traits || []
        })),
        locations: existingLocs.map(l => ({
          name: l.name, description: l.description, notes: l.notes, traits: l.traits || []
        })),
        plotThreads: existingThreads.map(t => ({
          title: t.title, notes: t.notes, traits: t.traits || []
        }))
      }, null, 2)

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

      await aiStream(userPrompt, ENRICH_ENTITIES_PROMPT, (chunk) => {
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
            } catch {}
          }
        }
        scanOffset = Math.max(0, accumulated.length - 200)
      }, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.7
      })

      let parsed = sanitizeJson(accumulated)
      if (!parsed) {
        throw new Error('Failed to parse generated entities')
      }

      const charByKey = new Map()
      for (const c of existingChars) charByKey.set(normalizeName(c.name), c)

      const locByKey = new Map()
      for (const l of existingLocs) locByKey.set(normalizeName(l.name), l)

      const threadByKey = new Map()
      for (const t of existingThreads) threadByKey.set(normalizeName(t.title), t)

      const generatedIds = { characters: [], locations: [], plotThreads: [] }

      for (const char of (parsed.characters || [])) {
        if (!char.name) continue
        const key = normalizeName(char.name)
        const existing = charByKey.get(key)

        if (existing) {
          const update = {}
          if (char.role && char.role !== existing.role) update.role = char.role
          if (char.goal && char.goal !== existing.goal) update.goal = char.goal
          if (char.voice && char.voice !== existing.voice) update.voice = char.voice
          if (char.description && char.description !== existing.description) update.description = char.description
          if (char.sampleDialogue && char.sampleDialogue !== existing.sampleDialogue) update.sampleDialogue = char.sampleDialogue

          const mergedTraits = mergeTraits(existing.traits, char.traits)
          if (mergedTraits.length !== (existing.traits || []).length) update.traits = mergedTraits

          const mergedNotes = mergeNotes(existing.notes, char.notes)
          if (mergedNotes !== (existing.notes || '')) update.notes = mergedNotes

          if (Object.keys(update).length > 0) {
            await storyBibleStore.updateCharacterData(existing.id, update, projectId)
          }
          charByKey.delete(key)
        } else {
          const id = await storyBibleStore.addCharacterData(projectId, {
            name: char.name,
            role: char.role || '',
            goal: char.goal || '',
            voice: char.voice || '',
            description: char.description || '',
            notes: char.notes || '',
            sampleDialogue: char.sampleDialogue || '',
            traits: char.traits || []
          })
          generatedIds.characters.push(id)
          if (volumeId) {
            await networkStore.assignEntityToVolume('character', id, volumeId, false)
          }
        }
      }

      for (const loc of (parsed.locations || [])) {
        if (!loc.name) continue
        const key = normalizeName(loc.name)
        const existing = locByKey.get(key)

        if (existing) {
          const update = {}
          if (loc.description && loc.description !== existing.description) update.description = loc.description
          const mergedTraits = mergeTraits(existing.traits, loc.traits)
          if (mergedTraits.length !== (existing.traits || []).length) update.traits = mergedTraits
          const mergedNotes = mergeNotes(existing.notes, loc.notes)
          if (mergedNotes !== (existing.notes || '')) update.notes = mergedNotes
          if (Object.keys(update).length > 0) {
            await storyBibleStore.updateLocationData(existing.id, update, projectId)
          }
          locByKey.delete(key)
        } else {
          const id = await storyBibleStore.addLocationData(projectId, {
            name: loc.name,
            description: loc.description || '',
            notes: loc.notes || '',
            traits: loc.traits || []
          })
          generatedIds.locations.push(id)
          if (volumeId) {
            await networkStore.assignEntityToVolume('location', id, volumeId, false)
          }
        }
      }

      for (const thread of (parsed.plotThreads || [])) {
        if (!thread.title) continue
        const key = normalizeName(thread.title)
        const existing = threadByKey.get(key)

        if (existing) {
          const update = {}
          const mergedTraits = mergeTraits(existing.traits, thread.traits)
          if (mergedTraits.length !== (existing.traits || []).length) update.traits = mergedTraits
          const mergedNotes = mergeNotes(existing.notes, thread.notes)
          if (mergedNotes !== (existing.notes || '')) update.notes = mergedNotes
          if (Object.keys(update).length > 0) {
            await storyBibleStore.updatePlotThreadData(existing.id, update, projectId)
          }
          threadByKey.delete(key)
        } else {
          const id = await storyBibleStore.addPlotThreadData(projectId, {
            title: thread.title,
            notes: thread.notes || '',
            traits: thread.traits || []
          })
          generatedIds.plotThreads.push(id)
          if (volumeId) {
            await networkStore.assignEntityToVolume('plotThread', id, volumeId, false)
          }
        }
      }

      return { generatedIds }
    } catch (err) {
      bootstrapError.value = err.message || 'Entity bootstrapping failed'
      throw err
    } finally {
      isBootstrapping.value = false
    }
  }

  return { bootstrapEntities, isBootstrapping, bootstrapError }
}

export { sanitizeJson, normalizeName, mergeTraits, mergeNotes }
