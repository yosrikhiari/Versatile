import { ref, shallowRef } from 'vue'
import { useStoryDirector } from './useStoryDirector'
import { useStoryWriter } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'
import { useStoryRevisor } from './useStoryRevisor'
import { useStoryDocuments } from './useStoryDocuments'
import { useStoryResearcher } from './useStoryResearcher'
import { useProjectStore } from '../stores/projectStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { db, deepPlain } from '../services/db-core'
import { gateDimensionCoverage, gateScoreDistribution, gateRevisionEffectiveness } from '../services/evalGates'

function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function classifyGoal(premise) {
  const p = (premise || '').toLowerCase()
  if (p.includes('write') || p.includes('scene') || p.includes('brainstorm') || p.includes('twist') || p.includes('develop') || p.includes('character')) {
    return { type: 'short_term_intent', horizon: 'short_term' }
  }
  return { type: 'generate_story', horizon: 'long_term' }
}

export { countWords, classifyGoal }

function toActions(plan) {
  if (plan.actions) return plan.actions
  if (plan.scenes) return plan.scenes.map(scene => ({
    type: 'write_scene',
    payload: scene
  }))
  return []
}

/**
 * Build a formatted user feedback block from the most recent scene that has feedback.
 * Returns null if no scene has user feedback.
 */
function createUserFeedbackBlock(completedScenes, sceneBrief) {
  if (!completedScenes || !Array.isArray(completedScenes) || completedScenes.length === 0) return null
  if (!sceneBrief) return null

  const sceneWithFeedback = [...completedScenes].reverse().find(
    s => s.brief?.userFeedback?.length > 0
  )
  if (!sceneWithFeedback) return null

  const feedback = sceneWithFeedback.brief.userFeedback
  let block = '=== USER FEEDBACK ON PREVIOUS SCENES ===\n\n'
  block += `Scene ${sceneWithFeedback.number}: ${sceneWithFeedback.brief.title}\n`
  for (const item of feedback) {
    block += `[${item.author || 'User'}] ${item.content || item}\n`
  }
  return block
}

/**
 * Generate a structured scene contract context from the story plan.
 * Shows chapter/scene structure for the writer.
 */
function createSceneContractContext(storyPlan) {
  if (!storyPlan) return ''
  const scenes = storyPlan.scenes || []
  if (scenes.length === 0) return ''

  const arc = storyPlan.storyArc || {}
  let context = '=== STORY STRUCTURE / SCENE CONTRACTS ===\n\n'

  if (arc.premise) context += `Story: ${arc.premise}\n`
  if (arc.genre) context += `Genre: ${arc.genre}\n`
  if (arc.tone) context += `Tone: ${arc.tone}\n`

  context += '\nScene Contracts:\n\n'
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const num = scene.sceneNumber || i + 1
    context += `[${num}] ${scene.title || 'Untitled Scene'}\n`
    context += `  What changes: ${scene.whatChanges || '—'}\n`
    context += `  Emotional goal: ${scene.emotionalGoal || '—'}\n`
    context += `  Characters: ${(scene.charactersPresent || []).join(', ') || '—'}\n`
    context += `  Tension: ${scene.tension || '—'}  Pacing: ${scene.pacing || '—'}\n`
    if (scene.sensoryAnchor) context += `  Sensory anchor: ${scene.sensoryAnchor}\n`
    context += '\n'
  }

  return context
}

export { createUserFeedbackBlock, createSceneContractContext }

export function useStoryOrchestrator() {
  const director = useStoryDirector()
  const writer = useStoryWriter()
  const critic = useStoryCritic()
  const revisor = useStoryRevisor()
  const researcher = useStoryResearcher()
  const storyBibleStore = useStoryBibleStore()

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
  const pauseAfterSceneEnabled = ref(false)
  const paused = ref(false)
  let _resumeResolver = null

  function resumeWriting() {
    if (_resumeResolver) {
      _resumeResolver()
      _resumeResolver = null
    }
    paused.value = false
  }

  function cancelGeneration() {
    cancelled = true
    if (_resumeResolver) {
      _resumeResolver()
      _resumeResolver = null
    }
    paused.value = false
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
      const classified = classifyGoal(premise)
      const goal = {
        type: classified.type,
        horizon: classified.horizon,
        premise,
        genre,
        tone,
        wordTarget
      }

      const evidence = await researcher.gatherEvidence(projectId, goal)

      const plan = await director.generateStoryPlan({ goal, evidence })

      if (cancelled) {
        await savePartial(projectId, premise)
        phase.value = 'idle'
        return
      }

      storyPlan.value = { ...plan, goal }
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
    const actions = toActions(plan)
    totalScenes.value = actions.length
    let chapterLog = []

    try {
      const { getStoryDocumentContext } = useStoryDocuments()
      const storyBibleDocs = await getStoryDocumentContext(projectId)
      for (let i = 0; i < actions.length; i++) {
        if (cancelled) break

        const action = actions[i]
        
        if (action.type === 'develop_character') {
          const payload = action.payload || {}
          await storyBibleStore.addCharacterData(projectId, {
            name: payload.name || 'Unknown Character',
            role: payload.role || '',
            goal: payload.goal || '',
            voice: payload.voice || '',
            notes: payload.notes || ''
          })
          chapterLog.push(`[Character Developed] — ${payload.name || 'Unknown'}`)
          progress.value = ((i + 1) / actions.length) * 100
          continue
        }

        if (action.type === 'brainstorm_twist') {
          const payload = action.payload || {}
          await storyBibleStore.addPlotThreadData(projectId, {
            title: payload.title || 'Untitled Twist',
            description: payload.description || '',
            notes: payload.notes || ''
          })
          chapterLog.push(`[Twist Brainstormed] — ${payload.title || 'Untitled Twist'}`)
          progress.value = ((i + 1) / actions.length) * 100
          continue
        }

        if (action.type !== 'write_scene') {
          console.warn('[Action Dispatcher] Unknown action type:', action.type, action.payload)
          progress.value = ((i + 1) / actions.length) * 100
          continue
        }

        currentSceneIndex.value = i
        streamingText.value = ''

        const sceneBrief = action.payload

        const existingEntitiesJson = JSON.stringify({
          characters: storyBibleStore.characters.map(c => ({ name: c.name, role: c.role, description: c.description, traits: c.traits || [] })),
          locations: storyBibleStore.locations.map(l => ({ name: l.name, description: l.description, notes: l.notes, traits: l.traits || [] })),
          plotThreads: storyBibleStore.plotThreads.map(t => ({ title: t.title, status: t.status, notes: t.notes, traits: t.traits || [] }))
        }, null, 2)

        try {
          const prose = await writer.writeScene({
            sceneBrief,
            storyArc: plan.storyArc,
            chapterLog,
            storyBible: storyBibleDocs,
            existingEntitiesJson,
            onChunk: (chunk, fullText) => {
              streamingText.value = fullText
            }
          })

          if (cancelled) break

          progress.value = ((i + 0.7) / actions.length) * 100

          let critiqueResult
          try {
            critiqueResult = await critic.evaluateScene({
              draft: prose,
              sceneBrief,
              storyBible: storyBibleDocs,
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
          let revisionCritiqueResult = null
          if (!critiqueResult.pass) {
            try {
              const revised = await revisor.reviseScene({
                draft: prose,
                critiqueResult,
                sceneBrief,
                storyBible: storyBibleDocs
              })
              if (revised && revised !== prose) {
                finalProse = revised
              }
            } catch {
              finalProse = prose
            }
          }

          if (finalProse !== prose) {
            try {
              revisionCritiqueResult = await critic.evaluateScene({
                draft: finalProse,
                sceneBrief,
                storyBible: storyBibleDocs,
                chapterLog: chapterLog.join('\n')
              })
            } catch {
              revisionCritiqueResult = null
            }
          }

          const projectStore = useProjectStore()
          const workspaceType = projectStore.activeWorkspaceType || 'creative'
          const dimCov = gateDimensionCoverage(critiqueResult, workspaceType)
          const scoreDist = gateScoreDistribution(critiqueResult)
          const revEff = revisionCritiqueResult
            ? await gateRevisionEffectiveness(critiqueResult, finalProse, prose, revisionCritiqueResult)
            : null

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
            critiqueResult,
            revisionCritiqueResult,
            gateResults: {
              dimensionCoverage: dimCov,
              scoreDistribution: scoreDist,
              revisionEffectiveness: revEff
            }
          }]

          progress.value = ((i + 1) / actions.length) * 100

          if (pauseAfterSceneEnabled.value) {
            paused.value = true
            await new Promise(resolve => { _resumeResolver = resolve })
            paused.value = false
          }

        } catch (sceneErr) {
          completedScenes.value = [...completedScenes.value, {
            number: sceneBrief.sceneNumber,
            brief: sceneBrief,
            prose: `[Scene could not be generated: ${sceneErr.message}]`,
            wordCount: 0,
            critiqueResult: { pass: false, score: 0, issues: [{ type: 'generation', description: sceneErr.message, severity: 'major' }], strengths: [] }
          }]
          chapterLog.push(`[Scene ${sceneBrief.sceneNumber}: ${sceneBrief.title}] — Generation failed`)
          progress.value = ((i + 1) / actions.length) * 100
        }
      }

      if (cancelled) {
        await savePartial(projectId, plan.storyArc.premise)
        phase.value = 'idle'
        return
      }

      if (storyPlan.value.goal?.horizon === 'short_term') {
        finalStory.value = {
          title: `Action Log: ${storyPlan.value.goal.premise.slice(0, 50)}...`,
          scenes: [],
          fullText: chapterLog.join('\n\n'),
          totalWords: countWords(chapterLog.join('\n\n')),
          generatedAt: new Date().toISOString(),
          projectId,
          qualityScore: 10,
          evalGates: null
        }
        phase.value = 'complete'
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

  async function regenerateScene(sceneIndex, projectId) {
    if (!storyPlan.value || !finalStory.value) return
    if (sceneIndex < 0 || sceneIndex >= finalStory.value.scenes.length) return

    const planActions = toActions(storyPlan.value)
    const action = planActions[sceneIndex]
    if (!action || action.type !== 'write_scene') return
    const sceneBrief = action.payload

    const { getStoryDocumentContext } = useStoryDocuments()
    const storyBibleDocs = await getStoryDocumentContext(projectId)

    let chapterLog = []
    for (let j = 0; j < sceneIndex; j++) {
      const existing = finalStory.value.scenes[j]
      if (existing) {
        chapterLog.push(`[Scene ${existing.number}: ${existing.brief.title}] — ${existing.brief.whatChanges}`)
      }
    }

    const existingEntitiesJson = JSON.stringify({
      characters: storyBibleStore.characters.map(c => ({ name: c.name, role: c.role, description: c.description, traits: c.traits || [] })),
      locations: storyBibleStore.locations.map(l => ({ name: l.name, description: l.description, notes: l.notes, traits: l.traits || [] })),
      plotThreads: storyBibleStore.plotThreads.map(t => ({ title: t.title, status: t.status, notes: t.notes, traits: t.traits || [] }))
    }, null, 2)

    try {
      const prose = await writer.writeScene({
        sceneBrief,
        storyArc: storyPlan.value.storyArc,
        chapterLog,
        storyBible: storyBibleDocs,
        existingEntitiesJson,
        onChunk: null
      })

      const critiqueResult = await critic.evaluateScene({
        draft: prose,
        sceneBrief,
        storyBible: storyBibleDocs,
        chapterLog: chapterLog.join('\n')
      })

      let finalProse = prose
      let revisionCritiqueResult = null
      if (!critiqueResult.pass) {
        try {
          const revised = await revisor.reviseScene({
            draft: prose,
            critiqueResult,
            sceneBrief,
            storyBible: storyBibleDocs
          })
          if (revised && revised !== prose) {
            finalProse = revised
          }
        } catch {}
      }

      if (finalProse !== prose) {
        try {
          revisionCritiqueResult = await critic.evaluateScene({
            draft: finalProse,
            sceneBrief,
            storyBible: storyBibleDocs,
            chapterLog: chapterLog.join('\n')
          })
        } catch {
          revisionCritiqueResult = null
        }
      }

      const projectStore = useProjectStore()
      const workspaceType = projectStore.activeWorkspaceType || 'creative'
      const dimCov = gateDimensionCoverage(critiqueResult, workspaceType)
      const scoreDist = gateScoreDistribution(critiqueResult)
      const revEff = revisionCritiqueResult
        ? await gateRevisionEffectiveness(critiqueResult, finalProse, prose, revisionCritiqueResult)
        : null

      const newScenes = [...finalStory.value.scenes]
      newScenes[sceneIndex] = {
        number: sceneBrief.sceneNumber,
        brief: sceneBrief,
        prose: finalProse,
        wordCount: countWords(finalProse),
        critiqueResult,
        revisionCritiqueResult,
        gateResults: {
          dimensionCoverage: dimCov,
          scoreDistribution: scoreDist,
          revisionEffectiveness: revEff
        }
      }

      const fullText = newScenes.map(s => s.prose).join('\n\n')
      const totalWords = newScenes.reduce((sum, s) => sum + s.wordCount, 0)
      const qualityScores = newScenes.filter(s => s.critiqueResult)
      const qualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((sum, s) => sum + s.critiqueResult.score, 0) / qualityScores.length)
        : 0

      let passCount = 0
      let failCount = 0
      const allGateResults = newScenes.map(s => s.gateResults).filter(Boolean)
      for (const g of allGateResults) {
        if (g.dimensionCoverage != null) { g.dimensionCoverage.pass ? passCount++ : failCount++ }
        if (g.scoreDistribution != null) { g.scoreDistribution.pass ? passCount++ : failCount++ }
        if (g.revisionEffectiveness != null) { g.revisionEffectiveness.pass ? passCount++ : failCount++ }
      }
      const evalGates = allGateResults.length > 0 ? {
        summary: { total: passCount + failCount, passed: passCount, failed: failCount },
        sceneResults: allGateResults
      } : null

      finalStory.value = {
        ...finalStory.value,
        scenes: newScenes,
        fullText,
        totalWords,
        qualityScore,
        evalGates
      }

      completedScenes.value = newScenes

    } catch (err) {
      orchestratorError.value = err.message || 'Regeneration failed'
    }
  }

  function assembleStory(plan, projectId) {
    const scenes = completedScenes.value.map((s, _i) => ({
      number: s.number,
      brief: s.brief,
      prose: s.prose,
      wordCount: s.wordCount,
      critiqueResult: s.critiqueResult,
      revisionCritiqueResult: s.revisionCritiqueResult,
      gateResults: s.gateResults
    }))

    const fullText = scenes.map(s => s.prose).join('\n\n')
    const totalWords = scenes.reduce((sum, s) => sum + s.wordCount, 0)
    const qualityScores = scenes.filter(s => s.critiqueResult)
    const qualityScore = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((sum, s) => sum + s.critiqueResult.score, 0) / qualityScores.length)
      : 0

    let passCount = 0
    let failCount = 0
    const allGateResults = scenes.map(s => s.gateResults).filter(Boolean)
    for (const g of allGateResults) {
      if (g.dimensionCoverage != null) {
        g.dimensionCoverage.pass ? passCount++ : failCount++
      }
      if (g.scoreDistribution != null) {
        g.scoreDistribution.pass ? passCount++ : failCount++
      }
      if (g.revisionEffectiveness != null) {
        g.revisionEffectiveness.pass ? passCount++ : failCount++
      }
    }

    const evalGates = allGateResults.length > 0 ? {
      summary: {
        total: passCount + failCount,
        passed: passCount,
        failed: failCount
      },
      sceneResults: allGateResults
    } : null

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
      qualityScore,
      evalGates
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
    resumeWriting,
    cancelGeneration,
    regenerateScene,
    pauseAfterSceneEnabled,
    paused,
    createUserFeedbackBlock,
    createSceneContractContext,
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
    writerError: writer.writeError,
    researcherError: researcher.researchError
  }
}
