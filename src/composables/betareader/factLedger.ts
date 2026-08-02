import { aiGenerateJson } from '../useAiService'
import { getProjectDigests } from '../../services/db-digests'
import { isDigestStale } from '../../services/generation/sceneDigest'

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

/**
 * Build the ledger, reading committed digests first and only calling the model
 * for scenes that have none.
 *
 * This loop used to be unconditional: one sequential, awaited LLM call per
 * scene. With local inference serialised to a single in-flight request that is
 * roughly `n x 20s` — about 3.3 hours for a 300-chapter manuscript — every time
 * the beta reader ran, re-deriving facts the writer had already produced at
 * commit time. Digests turn it into O(scenes without a digest), which for a
 * normal editing session is a handful.
 */
export async function extractAllFacts(scenes: any, aiOptions: any, projectId?: string) {
  const digestsBySubsection = new Map<string, any>()
  if (projectId) {
    try {
      for (const d of await getProjectDigests(projectId)) {
        digestsBySubsection.set(d.subsectionId, d)
      }
    } catch {
      // No digests available: fall through to the LLM path for every scene,
      // which is exactly the previous behaviour.
    }
  }

  const results = []
  for (const scene of scenes) {
    const digest = digestsBySubsection.get(scene.id)
    // A digest whose hash still matches the prose is authoritative — it was
    // built from the writer's own structured output for this exact text.
    if (digest && !isDigestStale(digest, scene.content)) {
      results.push({
        sceneId: scene.id,
        sceneTitle: scene.title,
        sceneNumber: scene.sceneNumber,
        facts: {
          characters: digest.facts?.characters || [],
          locations: digest.facts?.locations || [],
          events: digest.facts?.events || [],
          objects: digest.facts?.objects || [],
          timeline: digest.summary || ''
        },
        fromDigest: true
      })
      continue
    }

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
      },
      fromDigest: false
    })
  }
  return results
}
