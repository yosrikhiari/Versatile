import { aiGenerateJson } from '../useAiService'

const REPETITION_SCHEMA = {
  type: 'object',
  properties: {
    repetitions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['warning', 'info'] },
          category: {
            type: 'string',
            enum: ['word', 'phrase', 'description', 'scene_beat', 'dialogue_pattern']
          },
          title: { type: 'string' },
          description: { type: 'string' },
          affectedScenes: { type: 'array', items: { type: 'number' } },
          examples: { type: 'array', items: { type: 'string' } }
        },
        required: ['severity', 'category', 'title', 'description', 'affectedScenes']
      }
    }
  },
  required: ['repetitions']
}

const REPETITION_PROMPT = `You are a prose style analyst for fiction manuscripts.
Analyze the full manuscript for repetitive patterns that weaken the writing.

Check for:
- word: Overused words or crutch words (e.g., "just", "very", "suddenly", "literally")
- phrase: Repeated phrases or sentence structures (e.g., "She could feel", "He knew that")
- description: Repeated descriptions of characters, locations, or objects (e.g., "his steely eyes" every time)
- scene_beat: Recurring scene beats (e.g., every scene starts with weather, every chapter ends with a character looking in a mirror)
- dialogue_pattern: Repeated dialogue tags or speech patterns

Severity: "warning" for patterns that noticeably distract, "info" for minor overuse.
Include specific examples and which scenes are affected.
Respond ONLY with valid JSON matching the schema.`

export async function detectRepetitions(scenes, aiOptions) {
  const scenesText = scenes
    .map((s) => `Scene ${s.sceneNumber} ("${s.title}"):\n${s.content}`)
    .join('\n\n---\n\n')

  const prompt = `Full manuscript (${scenes.length} scenes):\n\n${scenesText}`
  const parsed = await aiGenerateJson(prompt, REPETITION_PROMPT, {
    ...aiOptions,
    schema: REPETITION_SCHEMA,
    schemaName: 'repetition_detection'
  }).catch(() => null)

  if (!parsed?.repetitions) return []

  const sceneById = {}
  for (const s of scenes) {
    sceneById[s.sceneNumber] = s
  }

  return parsed.repetitions.map((r, i) => {
    const sceneIds = (r.affectedScenes || []).map((num) => sceneById[num]?.id).filter(Boolean)
    return {
      id: `repeat-${i}`,
      severity: r.severity,
      category: r.category,
      pass: 'repetition',
      title: r.title,
      description:
        r.description +
        (r.examples?.length ? `\nExamples:\n${r.examples.map((e) => `• "${e}"`).join('\n')}` : ''),
      examples: r.examples || [],
      action:
        sceneIds.length > 0
          ? {
              label: 'View First Occurrence',
              type: 'open-section',
              payload: { subsectionId: sceneIds[0] },
              sceneId: sceneIds[0]
            }
          : null
    }
  })
}
