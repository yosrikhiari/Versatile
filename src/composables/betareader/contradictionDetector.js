import { aiGenerateJson } from '../useAiService'

const CONTRADICTION_SCHEMA = {
  type: 'object',
  properties: {
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['error', 'warning'] },
          category: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          betweenScenes: { type: 'array', items: { type: 'string' } }
        },
        required: ['severity', 'category', 'title', 'description', 'betweenScenes']
      }
    }
  },
  required: ['contradictions']
}

const CONTRADICTION_PROMPT = `You are a manuscript continuity expert.
Given the fact ledger for every scene in a manuscript, identify all cross-scene contradictions.

Categories to check:
- character_state: A character alive, dead, injured, or located inconsistently
- appearance: Physical description changes (eye color, hair, clothing)
- timeline: Events out of chronological order or impossible duration
- knowledge: Character knows something they shouldn't yet
- object_state: Object destroyed but later used, lost but later held
- location_geometry: Impossible spatial relationships between locations
- relationship: Character relationships that contradict earlier scenes

For each contradiction, specify severity (error = definite mistake, warning = likely mistake).
Include which scenes are in conflict by scene number.
Respond ONLY with valid JSON matching the schema.`

export async function detectContradictions(sceneLedgers, scenes, aiOptions) {
  const ledgerText = sceneLedgers
    .map(
      (l) =>
        `Scene ${l.sceneNumber} ("${l.sceneTitle}"):\n` +
        `  Characters: ${l.facts.characters.join(', ')}\n` +
        `  Locations: ${l.facts.locations.join(', ')}\n` +
        `  Events: ${l.facts.events.join('; ')}\n` +
        `  Objects: ${l.facts.objects.join(', ')}\n` +
        `  Timeline: ${l.facts.timeline}`
    )
    .join('\n\n')

  const prompt = `Full manuscript fact ledger:\n\n${ledgerText}`
  const parsed = await aiGenerateJson(prompt, CONTRADICTION_PROMPT, {
    ...aiOptions,
    schema: CONTRADICTION_SCHEMA,
    schemaName: 'contradiction_detection'
  }).catch(() => null)

  if (!parsed?.contradictions) return []

  const sceneByNumber = {}
  for (const s of scenes) {
    sceneByNumber[s.sceneNumber] = s
  }

  return parsed.contradictions.map((c, i) => {
    const sceneIds = (c.betweenScenes || [])
      .map((num) => {
        const match = num.match(/\d+/)
        return match ? sceneByNumber[parseInt(match[0])]?.id : null
      })
      .filter(Boolean)
    return {
      id: `contradiction-${i}`,
      severity: c.severity,
      category: c.category || 'contradiction',
      pass: 'contradictions',
      title: c.title,
      description: c.description,
      betweenScenes: c.betweenScenes || [],
      action:
        sceneIds.length > 0
          ? {
              label: 'Jump to Scene',
              type: 'open-section',
              payload: { subsectionId: sceneIds[0] },
              sceneId: sceneIds[0]
            }
          : null
    }
  })
}
