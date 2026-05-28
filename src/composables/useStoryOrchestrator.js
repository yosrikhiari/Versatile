import { ref, toRaw } from 'vue'
import { useStoryDirector } from './useStoryDirector'
import { useStoryWriter } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'
import { useStoryRevisor } from './useStoryRevisor'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { db, deepPlain } from '../services/db-core'

function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function useStoryOrchestrator() {
  const director = useStoryDirector()
  const writer = useStoryWriter()
  const critic = useStoryCritic()
  const revisor = useStoryRevisor()

  const phase = ref('idle')
  const progress = ref(0)
  const currentSceneIndex = ref(0)
  const totalScenes = ref(0)
  const storyPlan = ref(null)
  const completedScenes = ref([])
  const streamingText = ref('')
  const finalStory = ref(null)
  const orchestratorError = ref(null)
  const synopsis = ref('')

  let cancelled = false

  function cancelGeneration() {
    cancelled = true
    if (phase.value === 'planning' || phase.value === 'writing') {
      phase.value = 'idle'
    }
  }

  async function generateStory({ premise, genre, tone, wordTarget, projectId }) {
    cancelled = false
    phase.value = 'planning'
    progress.value = 0
    currentSceneIndex.value = 0
    totalScenes.value = 0
    streamingText.value = ''
    completedScenes.value = []
    finalStory.value = null
    orchestratorError.value = null
    synopsis.value = premise

    try {
      const plan = await director.generateStoryPlan({
        premise, genre, tone, wordTarget
      })

      if (cancelled) {
        await savePartial(projectId, premise)
        phase.value = 'idle'
        return
      }

      storyPlan.value = plan
      phase.value = 'planning'
      return

    } catch (err) {
      orchestratorError.value = err.message || 'Story planning failed'
      phase.value = 'error'
      return
    }
  }

  async function startWriting({ projectId }) {
    if (!storyPlan.value) {
      orchestratorError.value = 'No story plan available. Generate a plan first.'
      phase.value = 'error'
      return
    }

    cancelled = false
    phase.value = 'writing'
    const plan = storyPlan.value
    const scenes = plan.scenes
    totalScenes.value = scenes.length
    let chapterLog = []

    try {
      for (let i = 0; i < scenes.length; i++) {
        if (cancelled) break

        currentSceneIndex.value = i
        streamingText.value = ''

        const sceneBrief = scenes[i]

        try {
          const prose = await writer.writeScene({
            sceneBrief,
            storyArc: plan.storyArc,
            chapterLog,
            storyBible: synopsis.value,
            onChunk: (chunk, fullText) => {
              streamingText.value = fullText
            }
          })

          if (cancelled) break

          progress.value = ((i + 0.7) / scenes.length) * 100

          let critiqueResult
          try {
            critiqueResult = await critic.evaluateScene({
              draft: prose,
              sceneBrief,
              storyBible: synopsis.value,
              chapterLog: chapterLog.join('\n')
            })
          } catch {
            critiqueResult = {
              pass: true,
              score: 7,
              issues: [],
              strengths: ['Critic unavailable — pass']
            }
          }

          let finalProse = prose
          if (!critiqueResult.pass) {
            try {
              const revised = await revisor.reviseScene({
                draft: prose,
                critiqueResult,
                sceneBrief,
                storyBible: synopsis.value
              })
              if (revised && revised !== prose) {
                finalProse = revised
              }
            } catch {
              finalProse = prose
            }
          }

          const sceneSummary = `[Scene ${sceneBrief.sceneNumber}: ${sceneBrief.title}] — ${sceneBrief.whatChanges}`
          chapterLog.push(sceneSummary)
          if (chapterLog.length > 10) {
            chapterLog = chapterLog.slice(-10)
          }

          completedScenes.value = [...completedScenes.value, {
            number: sceneBrief.sceneNumber,
            brief: sceneBrief,
            prose: finalProse,
            wordCount: countWords(finalProse),
            critiqueResult
          }]

          progress.value = ((i + 1) / scenes.length) * 100

        } catch (sceneErr) {
          completedScenes.value = [...completedScenes.value, {
            number: sceneBrief.sceneNumber,
            brief: sceneBrief,
            prose: `[Scene could not be generated: ${sceneErr.message}]`,
            wordCount: 0,
            critiqueResult: { pass: false, score: 0, issues: [{ type: 'generation', description: sceneErr.message, severity: 'major' }], strengths: [] }
          }]
          chapterLog.push(`[Scene ${sceneBrief.sceneNumber}: ${sceneBrief.title}] — Generation failed`)
          progress.value = ((i + 1) / scenes.length) * 100
        }
      }

      if (cancelled) {
        await savePartial(projectId, plan.storyArc.premise)
        phase.value = 'idle'
        return
      }

      const assembled = assembleStory(plan, projectId)
      await saveToDexie(assembled, projectId)
      await saveToManuscript(assembled, projectId)

      finalStory.value = assembled
      phase.value = 'complete'

    } catch (err) {
      orchestratorError.value = err.message || 'Story generation failed'
      phase.value = 'error'
    }
  }

  async function regenerateScene(sceneIndex) {
    if (!storyPlan.value || !finalStory.value) return
    if (sceneIndex < 0 || sceneIndex >= finalStory.value.scenes.length) return

    const sceneBrief = storyPlan.value.scenes[sceneIndex]

    let chapterLog = []
    for (let j = 0; j < sceneIndex; j++) {
      const existing = finalStory.value.scenes[j]
      if (existing) {
        chapterLog.push(`[Scene ${existing.number}: ${existing.brief.title}] — ${existing.brief.whatChanges}`)
      }
    }

    try {
      const prose = await writer.writeScene({
        sceneBrief,
        storyArc: storyPlan.value.storyArc,
        chapterLog,
        storyBible: synopsis.value,
        onChunk: null
      })

      const critiqueResult = await critic.evaluateScene({
        draft: prose,
        sceneBrief,
        storyBible: synopsis.value,
        chapterLog: chapterLog.join('\n')
      })

      let finalProse = prose
      if (!critiqueResult.pass) {
        try {
          const revised = await revisor.reviseScene({
            draft: prose,
            critiqueResult,
            sceneBrief,
            storyBible: synopsis.value
          })
          if (revised && revised !== prose) {
            finalProse = revised
          }
        } catch {}
      }

      const newScenes = [...finalStory.value.scenes]
      newScenes[sceneIndex] = {
        number: sceneBrief.sceneNumber,
        brief: sceneBrief,
        prose: finalProse,
        wordCount: countWords(finalProse),
        critiqueResult
      }

      const fullText = newScenes.map(s => s.prose).join('\n\n')
      const totalWords = newScenes.reduce((sum, s) => sum + s.wordCount, 0)
      const qualityScores = newScenes.filter(s => s.critiqueResult)
      const qualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((sum, s) => sum + s.critiqueResult.score, 0) / qualityScores.length)
        : 0

      finalStory.value = {
        ...finalStory.value,
        scenes: newScenes,
        fullText,
        totalWords,
        qualityScore
      }

      completedScenes.value = newScenes

    } catch (err) {
      orchestratorError.value = err.message || 'Regeneration failed'
    }
  }

  function assembleStory(plan, projectId) {
    const scenes = completedScenes.value.map((s, i) => ({
      number: s.number,
      brief: s.brief,
      prose: s.prose,
      wordCount: s.wordCount,
      critiqueResult: s.critiqueResult
    }))

    const fullText = scenes.map(s => s.prose).join('\n\n')
    const totalWords = scenes.reduce((sum, s) => sum + s.wordCount, 0)
    const qualityScores = scenes.filter(s => s.critiqueResult)
    const qualityScore = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((sum, s) => sum + s.critiqueResult.score, 0) / qualityScores.length)
      : 0

    const title = plan.storyArc.premise.length > 60
      ? plan.storyArc.premise.slice(0, 60) + '...'
      : plan.storyArc.premise

    return {
      title,
      arc: plan.storyArc,
      scenes,
      fullText,
      totalWords,
      generatedAt: new Date().toISOString(),
      projectId,
      qualityScore
    }
  }

  async function saveToDexie(story, projectId) {
    try {
      const plainData = deepPlain({
        projectId,
        title: story.title,
        generatedAt: story.generatedAt,
        totalWords: story.totalWords,
        qualityScore: story.qualityScore,
        data: {
          arc: story.arc,
          scenes: story.scenes.map(s => ({
            number: s.number,
            brief: s.brief,
            prose: s.prose,
            wordCount: s.wordCount,
            critiqueResult: s.critiqueResult
          })),
          fullText: story.fullText
        }
      })
      await db.generatedStories.add(plainData)
    } catch (err) {
      console.error('[storyOrchestrator] Failed to save to Dexie:', err)
    }
  }

  async function savePartial(projectId, premise) {
    if (completedScenes.value.length === 0) return
    const partialStory = {
      title: premise.length > 60 ? premise.slice(0, 60) + '...' : premise,
      arc: storyPlan.value?.storyArc || { premise, totalScenes: 0, totalEstimatedWords: 0 },
      scenes: completedScenes.value.map(s => ({
        number: s.number,
        brief: s.brief,
        prose: s.prose,
        wordCount: s.wordCount,
        critiqueResult: s.critiqueResult
      })),
      fullText: completedScenes.value.map(s => s.prose).join('\n\n'),
      totalWords: completedScenes.value.reduce((sum, s) => sum + (s.wordCount || 0), 0),
      generatedAt: new Date().toISOString(),
      projectId,
      qualityScore: 0
    }
    try {
      const plainData = deepPlain({
        projectId,
        title: partialStory.title,
        generatedAt: partialStory.generatedAt,
        totalWords: partialStory.totalWords,
        qualityScore: 0,
        data: { ...partialStory, isPartial: true }
      })
      await db.generatedStories.add(plainData)
    } catch (err) {
      console.error('[storyOrchestrator] Failed to save partial story:', err)
    }
  }

  async function saveToManuscript(story, projectId) {
    try {
      const manuscriptStore = useManuscriptStore()

      const scenesPerSection = Math.max(1, Math.ceil(story.scenes.length / 3))
      let sectionIndex = 0

      for (let i = 0; i < story.scenes.length; i += scenesPerSection) {
        const groupScenes = story.scenes.slice(i, i + scenesPerSection)
        const sectionTitle = `Chapter ${sectionIndex + 1}: ${groupScenes[0].brief.title}`
        const sectionId = await manuscriptStore.addSectionData(projectId, {
          title: sectionTitle,
          summary: groupScenes.map(s => s.brief.whatChanges).join('; '),
          status: 'writing'
        })

        for (const scene of groupScenes) {
          await manuscriptStore.addSubsectionData(projectId, sectionId, {
            title: scene.brief.title,
            summary: scene.brief.emotionalGoal,
            content: scene.prose,
            status: 'writing'
          })
        }

        sectionIndex++
      }
    } catch (err) {
      console.error('[storyOrchestrator] Failed to save to manuscript:', err)
    }
  }

  return {
    generateStory,
    startWriting,
    cancelGeneration,
    regenerateScene,
    phase,
    progress,
    currentSceneIndex,
    totalScenes,
    storyPlan,
    completedScenes,
    streamingText,
    finalStory,
    orchestratorError,
    directorError: director.planError,
    writerError: writer.writeError
  }
}
