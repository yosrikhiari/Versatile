import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useStoryDocuments } from './useStoryDocuments'
import { getEmbedding, cosineSimilarity, getAllChunksForProject } from '../services/vectorService'
import { useAiService } from './useAiService'
import { sanitizeJson } from '../services/ai/aiHelpers'
import type { DirectorGoal, DirectorGoalStructure, DirectorChapter, DirectorOutput, StoryArc } from '../types/ai'

export function lexicalScore(query: string, text: string, allChunkTexts: string[]): number {
  const qWords = new Set(query.toLowerCase().split(/\s+/).filter(Boolean))
  const tWords = text.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = tWords.filter((w) => qWords.has(w)).length
  const raw = matches / Math.max(tWords.length, 1)

  const avgChunkLen = allChunkTexts.reduce((a, c) => a + c.split(/\s+/).length, 0) / Math.max(allChunkTexts.length, 1)
  const bonus = Math.min(1, tWords.length / Math.max(avgChunkLen, 1))
  return raw * 0.7 + bonus * 0.3
}

export function enforceStructure(chapters: any[], spec: DirectorGoalStructure): DirectorChapter[] {
  const targetChapters = spec.chapters || 3
  const targetScenesPerChapter = spec.scenesPerChapter || 3
  const wordPerChapter = spec.wordsPerChapter || 1500

  if (chapters.length >= targetChapters) return chapters.slice(0, targetChapters) as DirectorChapter[]

  const existingCount = chapters.length
  const existing = chapters as DirectorChapter[]

  for (let i = existingCount; i < targetChapters; i++) {
    const ch: DirectorChapter = {
      chapterNumber: i + 1,
      title: `Chapter ${i + 1}`,
      goal: 'Continue the story',
      arcPosition: i < targetChapters / 2 ? 'rising' : 'climax',
      emotionalTarget: 'Keep readers engaged',
      hookEnding: `A revelation changes everything`,
      estimatedWords: wordPerChapter,
      scenes: Array.from({ length: targetScenesPerChapter }, (_, si) => ({
        sceneNumber: si + 1,
        title: `Scene ${si + 1}`,
        emotionalGoal: 'Advance the plot',
        whatChanges: `An event unfolds`,
        obstacle: 'Unexpected resistance',
        sceneFunction: 'Develop the story',
        charactersPresent: [],
        characterWants: {},
        location: 'Unknown',
        setup: 'The scene begins',
        payoff: 'A new development emerges',
        sensoryAnchor: 'Describe the environment',
        arcPosition: 'rising',
        tension: 'moderate',
        pacing: 'moderate',
        estimatedWords: Math.floor(wordPerChapter / targetScenesPerChapter)
      }))
    }
    existing.push(ch)
  }

  return existing
}

export async function planChunked({
  goal,
  systemPrompt,
  onPartialData
}: {
  goal: DirectorGoal
  systemPrompt: string
  onPartialData?: (type: string, label: string) => void
}): Promise<{ chapters: any[]; storyArc: any }> {
  const spec = goal.structure!
  const chunkSize = 3
  const totalChapters = spec.chapters || 3
  const numChunks = Math.ceil(totalChapters / chunkSize)
  let allChapters: any[] = []

  for (let i = 0; i < numChunks; i++) {
    onPartialData?.('progress', `Planning chapters ${i * chunkSize + 1}-${Math.min((i + 1) * chunkSize, totalChapters)}`)

    const chunkPrompt = [
      `This is chunk ${i + 1} of ${numChunks} for planning a multi-chapter story.`,
      `Chapters to plan: ${i * chunkSize + 1} through ${Math.min((i + 1) * chunkSize, totalChapters)}`,
      `Previous chapters planned: ${allChapters.length ? JSON.stringify(allChapters.map((c: any) => ({ num: c.chapterNumber, title: c.title }))) : 'none'}`,
      '',
      `Return ONLY valid JSON in this shape:`,
      JSON.stringify({
        chapters: [
          {
            chapterNumber: 1,
            title: 'Chapter Title',
            goal: 'What this chapter achieves',
            arcPosition: 'rising/climax/falling/resolution',
            emotionalTarget: 'How readers should feel here',
            hookEnding: 'The cliffhanger or twist',
            estimatedWords: 1500,
            scenes: [
              {
                sceneNumber: 1,
                title: 'Scene Title',
                emotionalGoal: 'Emotional impact of scene',
                whatChanges: 'What changes in this scene',
                obstacle: 'What stands in the way',
                sceneFunction: 'Narrative function',
                charactersPresent: ['CharacterName'],
                characterWants: {},
                location: 'LocationName',
                setup: 'Where we start',
                payoff: 'Where we end up',
                sensoryAnchor: 'Key sensory detail',
                arcPosition: 'rising/climax/falling/resolution',
                tension: 'high/medium/low',
                pacing: 'fast/moderate/slow',
                estimatedWords: 500
              }
            ]
          }
        ]
      }, null, 2),
      '',
      `IMPORTANT: Output ONLY the JSON object. No markdown, no explanation.`
    ].join('\n')

    const { generate } = useAiService()
    const raw = await generate(chunkPrompt, systemPrompt, undefined, { temperature: 0.7 })
    const parsed = sanitizeJson(raw) as any
    if (parsed?.chapters) {
      allChapters = allChapters.concat(parsed.chapters)
    }
  }

  allChapters = enforceStructure(allChapters, goal.structure!)
  onPartialData?.('progress', 'Structuring final story arc')

  const storyArc = {
    premise: goal.premise,
    genre: goal.genre || 'General',
    tone: goal.tone || 'Neutral',
    emotionalJourney: 'A complete narrative arc',
    centralConflict: goal.premise.slice(0, 100),
    resolution: 'The conflict is resolved',
    totalChapters: allChapters.length,
    totalScenes: allChapters.reduce((sum: number, ch: any) => sum + (ch.scenes?.length || 0), 0),
    totalEstimatedWords: allChapters.reduce((sum: number, ch: any) => sum + (ch.estimatedWords || 0), 0)
  }

  return { chapters: allChapters, storyArc }
}

export const isPlanning = ref(false)
export const planError = ref<string | null>(null)

export async function generateStoryPlan({
  goal,
  evidence,
  onPartialData
}: {
  goal: DirectorGoal
  evidence: string
  onPartialData?: (type: string, label: string) => void
}): Promise<DirectorOutput> {
  isPlanning.value = true
  planError.value = null

  try {
    onPartialData?.('progress', 'Analyzing source material')

    const projectStore = useProjectStore()
    const chunks = await getAllChunksForProject(projectStore.currentProjectId)
    const qEmb = await getEmbedding(goal.premise)
    const scored = chunks
      .map((c: any) => ({
        chunk: c,
        score: cosineSimilarity(qEmb, c.embedding || [])
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)

    const evidenceSections = scored
      .map((s: any) => {
        const relevant = s.chunk.text ? `Relevant source: ${s.chunk.text.slice(0, 500)}` : ''
        return relevant
      })
      .filter(Boolean)
      .join('\n\n---\n\n')

    onPartialData?.('progress', 'Designing story structure')

    const goalWithContext = {
      ...goal,
      structure: goal.structure || {
        chapters: 3,
        scenesPerChapter: 3,
        wordsPerChapter: 1000
      }
    }

    const systemPrompt = [
      `You are a master storyteller and narrative architect. You plan stories with precision and emotional depth.`,
      `Your task is to create a detailed story plan based on the user's goal.`,
      `Always respond with valid JSON only, wrapped in a code block.`
    ].join(' ')

    const plan = await planChunked({
      goal: goalWithContext,
      systemPrompt,
      onPartialData
    })

    const storyArc: StoryArc = (plan.storyArc as StoryArc) || {
      premise: goal.premise,
      genre: goal.genre || 'General',
      tone: goal.tone || 'Neutral',
      emotionalJourney: 'A complete narrative arc',
      centralConflict: goal.premise.slice(0, 100),
      resolution: 'The conflict is resolved',
      totalChapters: plan.chapters.length,
      totalScenes: plan.chapters.reduce((sum: number, ch: any) => sum + (ch.scenes?.length || 0), 0),
      totalEstimatedWords: plan.chapters.reduce((sum: number, ch: any) => sum + (ch.estimatedWords || 0), 0)
    }

    onPartialData?.('progress', 'Finalizing plan')

    const allChapters: DirectorChapter[] = plan.chapters.filter((ch: any) => ch && ch.chapterNumber)
    const allScenes = allChapters.flatMap((ch) => ch.scenes)

    return {
      chapters: allChapters,
      scenes: allScenes,
      storyArc
    }
  } catch (error) {
    planError.value = (error as Error).message
    isPlanning.value = false
    throw error
  } finally {
    isPlanning.value = false
  }
}
