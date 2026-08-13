import { aiGenerateJson } from '../useAiService'
import { runDeterministicContradictionChecks, generateContradictionCandidates, type DeterministicContradiction } from '../../services/generation/deterministicContradictions'
import { getProjectDigests, getEntityStateTimeline } from '../../services/db-digests'
import type { SceneDigest } from '../../services/generation/sceneDigest'
import type { EntityStateRecord } from '../../services/generation/entityStates'

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
Given the fact ledger for specific scene pairs in a manuscript, identify any contradictions between them.

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

export async function detectContradictions(sceneLedgers: any, scenes: any, aiOptions: any) {
  // Phase 2: Hierarchical contradiction detection
  // 1. Get scene digests for deterministic rule checking
  const projectId = scenes[0]?.projectId
  let sceneDigests: SceneDigest[] = []
  let entityStates: EntityStateRecord[] = []
  if (projectId) {
    sceneDigests = await getProjectDigests(projectId)
    // The entity-state timeline is what the deterministic rules actually run on.
    // Absent (a project analysed before the state layer had a writer) it degrades
    // to the digest-only rules rather than failing the pass.
    entityStates = await getEntityStateTimeline(projectId).catch(() => [])
  }

  // 2. Run deterministic contradiction rules (zero LLM calls)
  const deterministicContradictions = await runDeterministicContradictionChecks(
    sceneDigests,
    scenes,
    entityStates
  )

  // 3. Generate candidate pairs for LLM verification
  const candidates = generateContradictionCandidates(
    sceneDigests,
    deterministicContradictions,
    entityStates
  )
  
  // 5. Targeted LLM verification only for surviving candidates
  // Build a focused fact ledger only for candidate scenes
  const candidateSceneIds = new Set<string>()
  for (const c of candidates) {
    candidateSceneIds.add(c.sceneA)
    candidateSceneIds.add(c.sceneB)
  }
  
  // Deterministic findings are normalised ONCE, here, and reused on both exits.
  // Previously only the no-candidates path built `betweenScenes` and `action`,
  // so as soon as a single candidate pair existed every deterministic finding
  // lost its scene references and its "Jump to Scene" — exactly the findings
  // that carry precise scene ids in the first place.
  const deterministicResults = deterministicContradictions.map((c, i) => ({
    id: `contradiction-${i}`,
    severity: c.severity,
    category: c.type,
    pass: 'contradictions',
    title: c.description.split('.')[0],
    description: c.description,
    // The facts the rule fired on. A deterministic finding an author can't
    // trace back to a sentence reads as a false positive whether or not it is.
    evidence: c.evidence ?? [],
    betweenScenes: c.sceneIds.map(
      (sid) => `Scene ${scenes.find((s: any) => s.id === sid)?.sceneNumber ?? '?'}`
    ),
    action:
      c.sceneIds.length > 0
        ? {
            label: 'Jump to Scene',
            type: 'open-section',
            payload: { subsectionId: c.sceneIds[0] },
            sceneId: c.sceneIds[0]
          }
        : null
  }))

  // 4. If no candidates, return deterministic results only
  if (candidates.length === 0) return deterministicResults


  const relevantLedgers = sceneLedgers.filter((l: any) => 
    candidateSceneIds.has(l.sceneId ?? l.id)
  )
  
  const ledgerText = relevantLedgers
    .map(
      (l: any) =>
        `Scene ${l.sceneNumber} ("${l.sceneTitle}"):\n` +
        `  Characters: ${l.facts?.characters?.join(', ') ?? 'none'}\n` +
        `  Locations: ${l.facts?.locations?.join(', ') ?? 'none'}\n` +
        `  Events: ${l.facts?.events?.join('; ') ?? 'none'}\n` +
        `  Objects: ${l.facts?.objects?.join(', ') ?? 'none'}\n` +
        `  Timeline: ${l.facts?.timeline ?? 'unknown'}`
    )
    .join('\n\n')

  const prompt = `Focused fact ledger for specific scene pairs (deterministic rules already checked):\n\n${ledgerText}`
  const parsed = await aiGenerateJson(prompt, CONTRADICTION_PROMPT, {
    ...aiOptions,
    schema: CONTRADICTION_SCHEMA,
    schemaName: 'contradiction_detection'
  }).catch(() => null) as { contradictions?: any[] } | null

  const llmContradictions: any[] = []
  if (parsed?.contradictions) {
    const sceneByNumber: Record<number, any> = {}
    for (const s of scenes as any[]) {
      sceneByNumber[s.sceneNumber] = s
    }
    
    for (const c of parsed.contradictions) {
      const sceneIds = (c.betweenScenes || [])
        .map((num: any) => {
          const match = num.match(/\d+/)
          return match ? sceneByNumber[parseInt(match[0])]?.id : null
        })
        .filter(Boolean)
      
      llmContradictions.push({
        id: `contradiction-${llmContradictions.length + deterministicContradictions.length}`,
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
      })
    }
  }
  
  // Combine deterministic + LLM results. Both are already in display shape.
  return [...deterministicResults, ...llmContradictions]
}
