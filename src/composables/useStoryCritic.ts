import { ref } from 'vue'
import { useAiService } from './useAiService'
import { sanitizeJson } from '../services/ai/aiHelpers'
import { useStoryDocuments } from './useStoryDocuments'
import type { CriticParams, CriticOutput, CriticIssue, CheckContradictionsParams, ContradictionReport } from '../types/ai'

export const isEvaluating = ref(false)
export const isCheckingConsistency = ref(false)
export const consistencyReport = ref<ContradictionReport | null>(null)

export async function checkContradictions(params: CheckContradictionsParams): Promise<ContradictionReport> {
  isCheckingConsistency.value = true
  consistencyReport.value = null

  try {
    const { characters, locations, sceneProse, synopsis } = params
    const { generate } = useAiService()

    const sceneTimeline =
      sceneProse.map((s, i) => {
        const chars = (s.characters || []).join(', ')
        return `Scene ${i + 1} [${s.location || 'Unknown'}]: ${s.prose.slice(0, 200)}...${chars ? ` (chars: ${chars})` : ''}`
      }).join('\n\n') +
      (synopsis ? `\n\nOverall synopsis: ${synopsis}` : '')

    const characterList = characters
      .map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ''}${c.goal ? ` - goal: ${c.goal}` : ''}${c.voice ? ` [voice: ${c.voice}]` : ''}${c.notes ? ` notes: ${c.notes}` : ''}`)
      .join('\n')

    const locationList = locations
      .map((l) => `- ${l.name}: ${l.description || ''}${l.notes ? ` (${l.notes})` : ''}`)
      .join('\n')

    const prompt = `You are a consistency checker for a story. Review the story timeline and character/location details below for contradictions.

Characters:
${characterList}

Locations:
${locationList}

Story Timeline:
${sceneTimeline}

Return ONLY valid JSON in this shape:
{
  "characterIssues": [
    {
      "character": "CharacterName",
      "contradictions": [
        { "type": "motivation|location|knowledge|timeline|personality|ability|relationship",
          "description": "Description of the contradiction",
          "between": ["Scene X: fact A", "Scene Y: fact B"]
        }
      ]
    }
  ],
  "locationIssues": [
    {
      "location": "LocationName",
      "contradictions": [
        { "type": "geography|atmosphere|damage|logistics",
          "description": "Description of the contradiction",
          "between": ["Scene X: fact A", "Scene Y: fact B"]
        }
      ]
    }
  ]
}

If no contradictions found, return {"characterIssues":[],"locationIssues":[]}.
Output ONLY the JSON.`

    const raw = await generate(prompt, 'You are a story consistency checker. Respond only with valid JSON.', 'spark', { temperature: 0.3 })
    const result = sanitizeJson(raw) as any

    const report: ContradictionReport = {
      characterIssues: result?.characterIssues ?? [],
      locationIssues: result?.locationIssues ?? [],
      error: undefined
    }

    consistencyReport.value = report
    return report
  } catch (error) {
    const report: ContradictionReport = {
      characterIssues: [],
      locationIssues: [],
      error: (error as Error).message
    }
    consistencyReport.value = report
    return report
  } finally {
    isCheckingConsistency.value = false
  }
}

export async function evaluateScene(params: CriticParams): Promise<CriticOutput> {
  isEvaluating.value = true

  try {
    const { generate } = useAiService()
    const { getDocumentContext } = useStoryDocuments()

    const { draft, sceneBrief, storyBible, chapterLog, existingEntitiesJson } = params

    const projectContext = storyBible || (await getDocumentContext('story_bible')) || ''

    const prompt = `You are a scene critic. Evaluate the following story scene against these criteria:

Story Bible Context:
${projectContext}

${chapterLog ? `Previous chapters:\n${chapterLog}\n\n` : ''}
${existingEntitiesJson ? `Existing entities context:\n${existingEntitiesJson}\n\n` : ''}

Scene Brief:
- Title: ${sceneBrief.title}
- Emotional goal: ${sceneBrief.emotionalGoal || 'N/A'}
- Characters present: ${sceneBrief.charactersPresent.join(', ')}
- Payoff: ${sceneBrief.payoff}
- Tension: ${sceneBrief.tension}

Scene Draft:
${draft}

Return ONLY valid JSON in this shape:
{
  "pass": true/false,
  "score": 0-10,
  "evalUnavailable": false,
  "dimensionScores": {
    "coherence": 0-10,
    "characterization": 0-10,
    "conflict_raising": 0-10,
    "prose_quality": 0-10,
    "pacing": 0-10
  },
  "issues": [
    {
      "severity": "major" or "minor",
      "type": "string identifying the issue category",
      "description": "Specific description of the issue"
    }
  ],
  "strengths": ["List of specific strengths"]
}

Output ONLY the JSON.`

    const raw = await generate(prompt, 'You are a story critic. Respond only with valid JSON.', 'spark', { temperature: 0.3 })
    const result = sanitizeJson(raw) as any

    if (!result) {
      return {
        pass: false,
        score: null,
        issues: [{ severity: 'major', type: 'parse_error', description: 'Failed to parse critique JSON from model' }],
        strengths: []
      }
    }

    return {
      pass: result.pass ?? true,
      score: result.score ?? null,
      evalUnavailable: result.evalUnavailable ?? undefined,
      dimensionScores: result.dimensionScores ?? undefined,
      issues: (result.issues || []) as CriticIssue[],
      strengths: (result.strengths || []) as string[]
    }
  } catch (error) {
    return {
      pass: false,
      score: null,
      issues: [{ severity: 'major', type: 'evaluation_error', description: (error as Error).message }],
      strengths: []
    }
  } finally {
    isEvaluating.value = false
  }
}
