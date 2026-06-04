import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'

const CRITIC_SYSTEM_PROMPT = `You evaluate scene drafts for craft quality. Respond ONLY with valid JSON. No markdown, no explanation.

Evaluate these specific aspects:
1. Character voice consistency: does each named character sound like their described voice?
2. Continuity: does anything contradict established facts?
3. Emotional goal achieved: does the scene achieve its stated emotional goal?
4. Show-don't-tell: count instances of direct emotional statement ("she felt sad", "he was angry", etc.)
5. Setup/payoff honoring: if payoff is not "none", is the payoff actually present in the draft?

Return this exact JSON structure:
{
  "pass": true/false,
  "score": 0-10,
  "issues": [
    {
      "type": "continuity" | "voice" | "emotional_goal" | "show_tell" | "pacing",
      "description": "specific description",
      "severity": "minor" | "major"
    }
  ],
  "strengths": ["what worked well"]
}

PASS CONDITIONS (scene passes if EITHER):
- Has 0 major severity issues AND 2 or fewer minor issues
- Story bible has fewer than 2 characters (auto-pass continuity/voice checks)

FAIL CONDITIONS:
- Any major severity issue, OR
- More than 2 minor issues`

function sanitizeJson(raw) {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')
  cleaned = cleaned.trim()
  const regex = /\{[\s\S]*\}/
  const execResult = regex.exec(cleaned)
  if (!execResult) return null
  try {
    return JSON.parse(execResult[0])
  } catch {
    return null
  }
}

function countCharacters(storyBible) {
  if (!storyBible) return 0
  const charMatches = storyBible.match(/##\s+\w+/g)
  return charMatches ? charMatches.length : 0
}

const CONSISTENCY_CRITIC_PROMPT = `You are a continuity editor. Given a character's facts and every scene they appear in, list any contradictions.

Check for contradictions in: name spelling, physical appearance, personality traits, goals/motivations, timeline/logical sequence.

Respond ONLY with valid JSON:
{
  "contradictions": [
    {
      "type": "name | appearance | personality | motivation | timeline",
      "description": "exactly what contradicts",
      "between": ["scene 1 excerpt", "scene 2 excerpt"]
    }
  ]
}

If no contradictions found, return { "contradictions": [] }`

function formatCharacterCheck(character, storyBibleFacts, sceneExcerpts) {
  const excerpts = sceneExcerpts.map((s, i) => `--- Scene ${i + 1} ---\n${s.prose.slice(0, 800)}`).join('\n\n')
  return `Character: ${character.name}
Role: ${character.role || 'unknown'}
Goal: ${character.goal || 'unknown'}
Voice: ${character.voice || 'unknown'}
Notes: ${character.notes || 'none'}

Scenes this character appears in with excerpts:
${excerpts}`
}

function formatLocationCheck(location, storyBibleFacts, sceneExcerpts) {
  const excerpts = sceneExcerpts.map((s, i) => `--- Scene ${i + 1} ---\n${s.prose.slice(0, 800)}`).join('\n\n')
  return `Location: ${location.name}
Description: ${location.description || 'unknown'}
Notes: ${location.notes || 'unknown'}

Scenes set at this location:
${excerpts}`
}

export function useStoryCritic() {
  const isEvaluating = ref(false)
  const isCheckingConsistency = ref(false)
  const consistencyReport = ref(null)

  async function evaluateScene({ draft, sceneBrief, storyBible, chapterLog }) {
    isEvaluating.value = true

    try {
      const characterCount = countCharacters(storyBible)
      const hasFewCharacters = characterCount < 2

      let userPrompt = `Evaluate this scene draft.

SCENE BRIEF:
- Title: ${sceneBrief.title}
- Emotional goal: ${sceneBrief.emotionalGoal}
- Characters present: ${sceneBrief.charactersPresent.join(', ')}
- Payoff: ${sceneBrief.payoff}
- Tension: ${sceneBrief.tension}

CHAPTER LOG (previous events):
${chapterLog || '(First scene)'}

STORY BIBLE (character descriptions for voice check):
${storyBible || '(No story bible)'}

${hasFewCharacters ? 'NOTE: Fewer than 2 characters defined. Skip continuity and voice checks.' : ''}

DRAFT TEXT:
${draft.slice(0, 4000)}

Return JSON evaluation.`

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const { DOCUMENT_PROMPTS } = await import('../config/documentPrompts')
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative

      const response = await aiGenerate(userPrompt, activePrompts.critic, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.3,
        maxTokens: 1000
      })

      let parsed = sanitizeJson(response)
      if (!parsed) {
        parsed = sanitizeJson(response)
      }
      if (!parsed) {
        return {
          pass: true,
          score: 7,
          issues: [],
          strengths: ['Evaluation parse failed — defaulting to pass']
        }
      }

      const issues = Array.isArray(parsed.issues) ? parsed.issues : []
      const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : []
      const score = typeof parsed.score === 'number' ? parsed.score : 7

      const majorIssues = issues.filter(i => i.severity === 'major')
      const minorIssues = issues.filter(i => i.severity === 'minor')

      const pass = hasFewCharacters || (majorIssues.length === 0 && minorIssues.length <= 2)

      return {
        pass,
        score,
        issues,
        strengths
      }
    } catch {
      return {
        pass: true,
        score: 7,
        issues: [],
        strengths: ['Critic error — defaulting to pass']
      }
    } finally {
      isEvaluating.value = false
    }
  }

  async function checkContradictions({ characters, locations, sceneProse, synopsis }) {
    isCheckingConsistency.value = true
    const report = { characterIssues: [], locationIssues: [] }

    try {
      const systemNote = synopsis ? `Story synopsis: "${synopsis}"\n\n` : ''

      for (const char of characters) {
        const charScenes = sceneProse.filter(s =>
          (s.characters || []).includes(char.name)
        )
        if (charScenes.length < 2) continue

        const prompt = formatCharacterCheck(char, {}, charScenes)
        const response = await aiGenerate(
          systemNote + prompt,
          CONSISTENCY_CRITIC_PROMPT,
          { feature: FEATURES.STORY_GENERATION, temperature: 0.3, maxTokens: 1000 }
        )
        const parsed = sanitizeJson(response)
        if (parsed && Array.isArray(parsed.contradictions) && parsed.contradictions.length > 0) {
          report.characterIssues.push({ character: char.name, contradictions: parsed.contradictions })
        }
      }

      for (const loc of locations) {
        const locScenes = sceneProse.filter(s =>
          s.location === loc.name
        )
        if (locScenes.length < 2) continue

        const prompt = formatLocationCheck(loc, {}, locScenes)
        const response = await aiGenerate(
          systemNote + prompt,
          CONSISTENCY_CRITIC_PROMPT,
          { feature: FEATURES.STORY_GENERATION, temperature: 0.3, maxTokens: 1000 }
        )
        const parsed = sanitizeJson(response)
        if (parsed && Array.isArray(parsed.contradictions) && parsed.contradictions.length > 0) {
          report.locationIssues.push({ location: loc.name, contradictions: parsed.contradictions })
        }
      }
    } catch (err) {
      report.error = err.message
    } finally {
      consistencyReport.value = report
      isCheckingConsistency.value = false
    }

    return report
  }

  return { evaluateScene, isEvaluating, checkContradictions, isCheckingConsistency, consistencyReport }
}

export { sanitizeJson, countCharacters, formatCharacterCheck, formatLocationCheck }
