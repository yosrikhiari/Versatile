import { aiGenerateJson } from '../useAiService'

const FACT_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'object',
      properties: {
        characters: { type: 'array', items: { type: 'string' } },
        locations: { type: 'array', items: { type: 'string' } },
        events: { type: 'array', items: { type: 'string' } },
        objects: { type: 'array', items: { type: 'string' } },
        timeline: { type: 'string' }
      }
    }
  },
  required: ['facts']
}

const FACT_EXTRACTION_PROMPT = `You are a meticulous fact extractor for a manuscript critique system.
Given a scene, extract every verifiable fact: characters present, locations, key events, notable objects, and timeline markers.
Be exhaustive — include even minor details that could later contradict another scene.
Respond ONLY with valid JSON matching the schema.`

export async function extractAllFacts(scenes, aiOptions) {
  const results = []
  for (const scene of scenes) {
    const prompt = `Scene ${scene.sceneNumber}: "${scene.title}"
Content:
${scene.content}`
    const parsed = await aiGenerateJson(prompt, FACT_EXTRACTION_PROMPT, {
      ...aiOptions,
      schema: FACT_SCHEMA,
      schemaName: 'fact_ledger_extraction'
    }).catch(() => null)
    results.push({
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneNumber: scene.sceneNumber,
      facts: parsed?.facts || {
        characters: [],
        locations: [],
        events: [],
        objects: [],
        timeline: ''
      }
    })
  }
  return results
}
