import { ref } from 'vue'
import { useAiService } from './useAiService'
import { useProjectStore } from '../stores/projectStore'
import { getVoiceProfile, buildSceneContext, getDimensionNames, summarizeLog } from '../services/ai/sceneContext'
import { DOCUMENT_PROMPTS } from '../services/ai/promptStore'
import { sanitizeJsonResponse, getExistingEntitiesContext, getProjectContext, FIELD_LENGTH_CONSTRAINTS } from '../services/ai/aiHelpers'
import { finalizeStream } from '../services/jsonExtractor'
import { formatEvalFeedback } from '../services/evalFeedback'
import { useStoryDocuments } from './useStoryDocuments'
import type { WriterParams, WriterStructuredParams, WriterOutput } from '../types/ai'
import type { PromptSet } from '../types/ai'

function buildScenePrompt({
  sceneBrief,
  storyArc,
  chapterLog,
  storyBible,
  voiceProfile,
  embeddingContext,
  sceneContext,
  storyContract,
  dimensionNames,
  existingEntitiesCtx,
  projectCtx,
  pastEvalFeedbacks,
  characters,
  completedScenes
}: {
  sceneBrief: Record<string, unknown>
  storyArc?: Record<string, unknown>
  chapterLog?: string
  storyBible?: string
  voiceProfile?: string
  embeddingContext?: string
  sceneContext?: string
  storyContract?: string
  dimensionNames?: string[]
  existingEntitiesCtx?: string
  projectCtx?: string
  pastEvalFeedbacks?: string
  characters?: Array<{ name: string; role?: string }>
  completedScenes?: Array<{ prose: string; characters?: string[]; location?: string }>
}): string {
  const brief = sceneBrief as any
  const arc = (storyArc || {}) as any

  let entitySection = ''
  if (existingEntitiesCtx) {
    try {
      const existing = JSON.parse(existingEntitiesCtx) as any
      if (existing.characters?.length)
        entitySection += `\nCharacters:\n${existing.characters.map((ch: any) => `- ${ch.name} (${ch.role || ch.description || ''}${ch.goal ? `, goal: ${ch.goal}` : ''}${ch.voice ? `, voice: ${ch.voice}` : ''})`).join('\n')}\n`
      if (existing.locations?.length)
        entitySection += `\nLocations:\n${existing.locations.map((loc: any) => `- ${loc.name}: ${loc.description || ''}`).join('\n')}\n`
      if (existing.plotThreads?.length)
        entitySection += `\nPlot Threads:\n${existing.plotThreads.map((pt: any) => `- ${pt.title}: ${pt.status || pt.summary || ''}`).join('\n')}\n`
    } catch { /* existing JSON is optional */ }
  }

  let completedScenesSection = ''
  if (completedScenes?.length) {
    completedScenesSection = `\n[COMPLETED SCENES]\n${completedScenes.map((s) => s.prose).join('\n\n')}\n`
  }

  return `
[STORY BIBLE]
${storyBible || 'General story context'}

[CHARACTER LIST]
${characters?.length ? characters.map((ch) => `${ch.name}${ch.role ? ` (${ch.role})` : ''}`).join(', ') : 'None yet'}
${entitySection}

${embeddingContext ? `[CONTEXT]\n${embeddingContext}\n` : ''}

[STORY CONTRACT]
${storyContract || 'No specific constraints'}

[PREVIOUS CHAPTERS]
${chapterLog || 'This is the first chapter'}

${pastEvalFeedbacks ?? ''}

${completedScenesSection}

${sceneContext ? `[SCENE CONTEXT]\n${sceneContext}\n` : ''}

[SCENE BRIEF]
- Title: ${brief.title ?? ''}
- Emotional goal: ${brief.emotionalGoal ?? ''}
- Characters: ${(brief.charactersPresent || []).join(', ')}
- Tension: ${brief.tension ?? ''}

[STORY ARC]
- Genre: ${arc.genre || ''}
- Tone: ${arc.tone || ''}
- Central Conflict: ${arc.centralConflict || ''}
- Emotional Journey: ${arc.emotionalJourney || ''}
- Resolution: ${arc.resolution || ''}

${projectCtx ?? ''}

${dimensionNames?.length ? `\n[QUALITY DIMENSIONS]\nThe following quality dimensions are important for this story:\n${dimensionNames.map((d: string) => `- ${d}`).join('\n')}\n` : ''}

Write the scene prose directly. Do not include meta-commentary.
`
}

async function buildStructuredPrompt(params: WriterStructuredParams) {
  const { getDocumentContext } = useStoryDocuments()
  const projectStore = useProjectStore()
  const brief = params.sceneBrief as any
  const storyBible = params.storyBible || (await getDocumentContext('story_bible'))
  const existingEntitiesCtx = params.existingEntitiesJson || (await getExistingEntitiesContext())
  const projectCtx = getProjectContext()
  const contractSection = params.storyContract || (await getDocumentContext('story_contract'))

  const spineContext = params.spineContext
  const anchorRole = params.anchorRole
  const anchorConstraints = params.anchorConstraints

  let pastEvalSections = ''
  if (params.pastEvalResults) {
    pastEvalSections = `\n${params.pastEvalResults}`
  }

  let existing = null
  try {
    existing = existingEntitiesCtx ? JSON.parse(existingEntitiesCtx) : null
  } catch { /* existing JSON is optional */ }
  const ext = existing as any

  return {
    fullPrompt: `
[STORY BIBLE]
${storyBible || 'General story context'}

[CHARACTER LIST]
${ext?.characters?.length > 0
      ? ext.characters.map((ch: any) => `- ${ch.name}: ${ch.role || ch.description || ''}${ch.goal ? ` (goal: ${ch.goal})` : ''}${ch.voice ? ` [voice: ${ch.voice}]` : ''}`).join('\n')
      : brief.charactersPresent?.length > 0
        ? brief.charactersPresent.map((n: string) => `- ${n}`).join('\n')
        : 'None yet'}

[LOCATION LIST]
${ext?.locations?.length > 0
      ? ext.locations.map((loc: any) => `- ${loc.name}: ${loc.description || ''}`).join('\n')
      : 'None yet'}

[PLOT THREADS]
${ext?.plotThreads?.length > 0
      ? ext.plotThreads.map((pt: any) => `- ${pt.title}: ${pt.summary || pt.status || ''}`).join('\n')
      : 'None yet'}

[STORY CONTRACT]
${contractSection || 'No specific constraints'}

${spineContext ? `[STORY SPINE]\n${spineContext}\n${anchorRole ? `\nPOV: ${anchorRole}\n${anchorConstraints ? `Constraints: ${anchorConstraints}` : ''}` : ''}` : ''}

[PREVIOUS CHAPTERS]
${params.chapterLog || 'This is the first chapter'}

${pastEvalSections}

[SETTING]
${brief.location || 'Unknown'}

[SCENE BRIEF]
- Scene Number: ${brief.sceneNumber ?? ''}
- Title: ${brief.title ?? ''}
- What changes in this scene: ${brief.whatChanges ?? ''}
- Emotional goal: ${brief.emotionalGoal ?? ''}
- Obstacle to overcome: ${brief.obstacle ?? ''}
- Narrative function: ${brief.sceneFunction ?? ''}
- Setup: ${brief.setup ?? ''}
- Payoff: ${brief.payoff ?? ''}
- Sensory Anchor: ${brief.sensoryAnchor ?? ''}
- Tension: ${brief.tension ?? ''}
- Pacing: ${brief.pacing ?? ''}
- Arc Position: ${brief.arcPosition ?? ''}

${projectCtx}

Write the scene prose as plain text with no meta-commentary. Do not include the above markers.
${anchorConstraints ? `\nPOV constraint: Write from the perspective of ${anchorRole}.\n${anchorConstraints}` : ''}
`
  }
}

export const isWriting = ref(false)
export const writeError = ref<string | null>(null)

export async function writeScene(params: WriterParams): Promise<string> {
  isWriting.value = true
  writeError.value = null

  try {
    const { stream } = useAiService()
    const { getDocumentContext } = useStoryDocuments()
    const projectStore = useProjectStore()
    const [voiceProfile, sceneContext, dimensionNames] = await Promise.all([
      (getVoiceProfile?.(projectStore.currentProjectId) ?? Promise.resolve(null)) as Promise<string | null>,
      (buildSceneContext?.(params.sceneBrief) ?? Promise.resolve('')) as Promise<string>,
      (getDimensionNames?.() ?? Promise.resolve([])) as Promise<string[]>
    ])

    const storyBible = params.storyBible || (await getDocumentContext('story_bible'))
    const storyContract = params.storyContract || (await getDocumentContext('story_contract'))
    const existingEntitiesCtx = params.existingEntitiesJson || (await getExistingEntitiesContext())
    const projectCtx = getProjectContext()
    const characterMap = params.characters || []

    const p = params as any
    let pastEvalFeedbacks = ''
    if (p.pastEvalResults) {
      pastEvalFeedbacks = `\n${p.pastEvalResults}`
    }

    const prompt = buildScenePrompt({
      sceneBrief: params.sceneBrief,
      storyArc: params.storyArc as any,
      chapterLog: params.chapterLog,
      storyBible,
      voiceProfile: voiceProfile || params.voiceProfile,
      embeddingContext: params.embeddingContext,
      sceneContext,
      storyContract,
      dimensionNames,
      existingEntitiesCtx,
      projectCtx,
      pastEvalFeedbacks,
      characters: characterMap,
      completedScenes: params.completedScenes as any
    })

    const categoryType = (projectStore.currentCategory || 'creative').toLowerCase()
    const allPrompts = DOCUMENT_PROMPTS as unknown as Record<string, PromptSet>
    const prompts = allPrompts[categoryType] || allPrompts.creative
    const systemPrompt = prompts.writer
    const fullText = await stream(prompt, systemPrompt, params.onChunk, {
      feature: 'story_generation',
      temperature: 0.8
    })

    return fullText
  } catch (error) {
    writeError.value = (error as Error).message
    isWriting.value = false
    throw error
  } finally {
    isWriting.value = false
  }
}

export async function writeSceneStructured(params: WriterStructuredParams): Promise<WriterOutput> {
  isWriting.value = true
  writeError.value = null

  try {
    const { stream } = useAiService()

    const promptData = await buildStructuredPrompt(params)
    const projectStore = useProjectStore()
    const categoryType = (projectStore.currentCategory || 'creative').toLowerCase()
    const allPrompts = DOCUMENT_PROMPTS as unknown as Record<string, PromptSet>
    const prompts = allPrompts[categoryType] || allPrompts.creative
    const systemPrompt = prompts.writer

    let accumulated = ''
    const fullText = await stream(promptData.fullPrompt, systemPrompt, params.onRawChunk, {
      feature: 'story_generation',
      temperature: 0.8
    })

    if (!fullText || fullText.trim().length === 0) {
      return {
        prose: '',
        structured: {
          prose: '',
          usedEntities: { characterNames: [], locationNames: [], plotThreadTitles: [] },
          newEntities: { characters: [], locations: [], plotThreads: [] },
          networkEvents: []
        }
      }
    }

    const parsed = finalizeStream(fullText) as any
    if (parsed?.prose) {
      return {
        prose: parsed.prose as string,
        structured: {
          prose: parsed.prose as string,
          usedEntities: parsed.usedEntities || { characterNames: [], locationNames: [], plotThreadTitles: [] },
          newEntities: parsed.newEntities || { characters: [], locations: [], plotThreads: [] },
          networkEvents: parsed.networkEvents || []
        }
      }
    }

    return {
      prose: fullText,
      structured: {
        prose: fullText,
        usedEntities: { characterNames: [], locationNames: [], plotThreadTitles: [] },
        newEntities: { characters: [], locations: [], plotThreads: [] },
        networkEvents: []
      }
    }
  } catch (error) {
    writeError.value = (error as Error).message
    isWriting.value = false
    throw error
  } finally {
    isWriting.value = false
  }
}
