import { ref, reactive } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStore } from '../stores/volumeStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useVolumeStoryNetworkStore } from '../stores/volumeStoryNetworkStore'
import { useStoryDirector } from './useStoryDirector'
import { useEntityBootstrapper } from './useEntityBootstrapper'
import { useStoryWriter } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'

const EMBEDDING_CONTEXT_MAX_CHARS = 1400
const MAX_REJECTED_PATTERNS = 5

// Context strategy for buildEmbeddingContext.
// 'prose' — last 2 scenes' prose excerpts (correct for 6–15 scenes).
// 'embedding' — future: embedding-similarity retrieval (for 25+ scenes).
const CONTEXT_STRATEGY = 'prose'
const PROSE_EXCERPT_MAX_SCENES = 25

export function useVolumeStoryGenerator() {
  const phase = ref('idle')
  const progress = reactive({ current: 0, total: 0, sceneLabel: '' })
  const error = ref(null)
  const volumeId = ref(null)
  const scenePlan = ref([])
  const writtenScenes = ref([])
  const consistencyReport = ref(null)
  const rejectedPatterns = ref([])

  const director = useStoryDirector()
  const bootstrapper = useEntityBootstrapper()
  const writer = useStoryWriter()
  const critic = useStoryCritic()
  const storyBibleStore = useStoryBibleStore()
  const volumeStore = useVolumeStore()
  const manuscriptStore = useManuscriptStore()
  const networkStore = useVolumeStoryNetworkStore()

  function logRejectedPattern(context, prose) {
    rejectedPatterns.value.push({ context, prose, timestamp: Date.now() })
    if (rejectedPatterns.value.length > MAX_REJECTED_PATTERNS) {
      rejectedPatterns.value = rejectedPatterns.value.slice(-MAX_REJECTED_PATTERNS)
    }
  }

  async function startGeneration({ projectId, synopsis, genre, tone, wordTarget, singleChapter, sparkContext, onPhaseChange, onChunk }) {
    if (phase.value !== 'idle') return

    error.value = null
    consistencyReport.value = null
    writtenScenes.value = []
    scenePlan.value = []
    rejectedPatterns.value = []

    const enhancedSynopsis = sparkContext
      ? `${synopsis}\n\nAdditional context from brainstorming:\n${sparkContext}`
      : synopsis

    try {
      // Phase 0: Create volume first (so bootstrapping has a real volume ID)
      const vId = await volumeStore.createVolume(projectId, {
        title: `${enhancedSynopsis.slice(0, 60)}...`,
        description: `Generated story — ${genre}, ${tone}`,
        color: '#6366f1',
        chapterIds: []
      })
      volumeId.value = vId

      // Phase 1: Bootstrap entities (now has a real volumeId)
      phase.value = 'bootstrapping'
      onPhaseChange?.('bootstrapping')
      await bootstrapper.bootstrapEntities({ synopsis: enhancedSynopsis, projectId, volumeId: vId })

      // Phase 2: Scene planning via Director
      phase.value = 'planning'
      onPhaseChange?.('planning')
      const directorResult = await director.generateStoryPlan({ premise: enhancedSynopsis, genre, tone, wordTarget })
      const scenes = directorResult.scenes
      const storyArc = directorResult.storyArc

      if (!Array.isArray(scenes) || scenes.length < 3) {
        throw new Error('Director returned insufficient scenes (need at least 3)')
      }

      // Cap to 1 scene for single-chapter mode
      const planScenes = singleChapter ? [scenes[0]] : scenes

      scenePlan.value = planScenes.map((s, i) => ({
        sceneNumber: i + 1,
        sceneIndex: i + 1,
        title: s.title || `Scene ${i + 1}`,
        goal: s.emotionalGoal || '',
        obstacle: s.whatChanges || '',
        characters: s.charactersPresent || [],
        location: s.location || '',
        change: s.whatChanges || '',
        toneNote: s.tension || 'medium',
        tension: s.tension || 'medium',
        pacing: s.pacing || 'medium',
        estimatedWords: s.estimatedWords || 800,
        emotionalGoal: s.emotionalGoal || '',
        whatChanges: s.whatChanges || '',
        charactersPresent: s.charactersPresent || [],
        characterWants: s.characterWants || {},
        setup: s.setup || '',
        payoff: s.payoff || 'none',
        sensoryAnchor: s.sensoryAnchor || ''
      }))

      const totalScenes = scenePlan.value.length
      progress.total = totalScenes

      // Build story contract from the plan
      const storyContract = [
        `Genre: ${genre}`,
        `Tone: ${tone}`,
        `Central conflict: ${storyArc?.centralConflict || 'unknown'}`,
        `Characters in story: ${[...new Set(scenes.flatMap(s => s.characters || s.charactersPresent || []))].join(', ')}`,
        `Locations in story: ${[...new Set(scenes.flatMap(s => s.location ? [s.location] : []))].join(', ')}`
      ].join('\n')

      // Phase 2.5: Pause at plan-preview for user editing
      phase.value = 'plan-preview'
      onPhaseChange?.('plan-preview')
      // Return control; user edits plan and calls confirmPlan() to proceed

      // Store arc for later use
      return { scenes: scenePlan.value, storyArc, volumeId: vId, storyContract }
    } catch (err) {
      phase.value = 'error'
      error.value = err.message || 'Generation failed during initial phases'
      throw err
    }
  }

  async function writeAllScenes({
    projectId, editedPlan, sections, storyArc, storyContract, synopsis, onChunk
  }) {
    for (let i = 0; i < editedPlan.length; i++) {
      const scene = editedPlan[i]
      progress.current = i + 1
      progress.sceneLabel = scene.title || `Scene ${scene.sceneNumber}`

      // Retrieve context from prior scenes (prose excerpts, not embeddings)
      const embeddingContext = buildEmbeddingContext(scene, writtenScenes.value)

      // Build chapter log from prior scenes
      const rawLog = writtenScenes.value.map((ws, idx) =>
        `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`
      )
      const chapterLog = rawLog.slice(-20).join('\n')

      // Retrieve rejected patterns for Writer
      const extraRejected = rejectedPatterns.value.length > 0 ? rejectedPatterns.value : undefined

      // Write the scene with streaming
      let fullProse = ''
      await writer.writeScene({
        sceneBrief: scene,
        storyArc,
        chapterLog,
        storyBible: synopsis,
        onChunk: (chunk) => {
          fullProse += chunk
          onChunk?.({ sceneIndex: i + 1, total: editedPlan.length, chunk, fullProse, scene })
        },
        embeddingContext,
        storyContract,
        rejectedPatterns: extraRejected
      })

      // Summarize for chapter log
      const summary = fullProse.slice(0, 150).replace(/\s+\S*$/, '') + '...'

      // Save prose to manuscript subsection
      if (scene.subsectionId) {
        await manuscriptStore.updateSubsectionData(scene.subsectionId, {
          content: fullProse,
          wordCount: fullProse.split(/\s+/).length
        }, projectId)
      }

      // Update section word count (in-memory accumulation)
      const sectionIdx = Math.floor(i / 3)
      if (sections[sectionIdx]) {
        const sectionId = sections[sectionIdx].id
        const writtenInSection = writtenScenes.value
          .slice(sectionIdx * 3, (sectionIdx + 1) * 3)
        const totalWords = writtenInSection.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0)
          + fullProse.split(/\s+/).length
        await manuscriptStore.updateSectionData(sectionId, {
          wordCount: totalWords
        }, projectId)
      }

      // Store for chapter log and embedding
      writtenScenes.value.push({
        title: scene.title || `Scene ${scene.sceneNumber}`,
        prose: fullProse,
        summary,
        characters: scene.characters || scene.charactersPresent || [],
        location: scene.location || '',
        sceneNumber: scene.sceneNumber,
        subsectionId: scene.subsectionId
      })
    }
  }

  async function confirmPlan({ projectId, editedPlan, storyArc, storyContract, synopsis, sparkContext, onPhaseChange, onChunk }) {
    if (phase.value !== 'plan-preview') return

    scenePlan.value = editedPlan
    progress.total = editedPlan.length

    // Create sections for scene groups (3 scenes per section)
    const sections = []
    for (let i = 0; i < editedPlan.length; i += 3) {
      const group = editedPlan.slice(i, i + 3)
      const sectionData = {
        title: group[0].title ? `Part ${sections.length + 1}: ${group[0].title}` : `Part ${sections.length + 1}`,
        summary: group.map(s => s.title || `Scene ${s.sceneNumber}`).join(', '),
        wordCount: 0
      }
      const sectionId = await manuscriptStore.addSectionData(projectId, sectionData)
      sections.push({ id: sectionId, scenes: group, subsectionIds: [] })

      for (const scene of group) {
        const subData = {
          title: scene.title || `Scene ${scene.sceneNumber}`,
          description: `Scene ${scene.sceneNumber}`,
          content: '',
          wordCount: 0,
          type: 'scene',
          sceneNumber: scene.sceneNumber
        }
        const subId = await manuscriptStore.addSubsectionData(projectId, sectionId, subData)
        sections[sections.length - 1].subsectionIds.push(subId)
        scene.subsectionId = subId
      }

      // Assign section to volume
      if (volumeId.value) {
        await volumeStore.assignChapter(sectionId, volumeId.value, projectId)
      }
    }

    // Phase 3: Incremental writing
    phase.value = 'writing'
    onPhaseChange?.('writing')
    error.value = null

    const enhancedSynopsis = sparkContext
      ? `${synopsis}\n\nAdditional context from brainstorming:\n${sparkContext}`
      : synopsis

    await writeAllScenes({ projectId, editedPlan, sections, storyArc, storyContract, synopsis: enhancedSynopsis, onChunk })

    // Phase 4: Consistency critic
    phase.value = 'consistency-check'
    onPhaseChange?.('consistency-check')

    const characters = storyBibleStore.characters
    const locations = storyBibleStore.locations

    if (characters.length > 1 || locations.length > 1) {
      const report = await critic.checkContradictions({
        characters,
        locations,
        sceneProse: writtenScenes.value,
        synopsis: enhancedSynopsis
      })
      consistencyReport.value = report
    }

    // Phase 5: Complete
    phase.value = 'complete'
    onPhaseChange?.('complete')

    // Save story to generatedStories Dexie table
    try {
      const { db } = await import('../services/db-core')
      const totalWords = writtenScenes.value.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0)
      await db.generatedStories.add({
        projectId,
        title: `${synopsis.slice(0, 60)}...`,
        generatedAt: new Date().toISOString(),
        totalWords,
        qualityScore: consistencyReport.value
          ? (consistencyReport.value.characterIssues.length + consistencyReport.value.locationIssues.length) * -1
          : 0
      })
    } catch {
      // Non-critical: generatedStories save
    }
  }

  function buildEmbeddingContext(currentScene, priorScenes) {
    if (priorScenes.length === 0) return ''

    if (priorScenes.length > PROSE_EXCERPT_MAX_SCENES) {
      console.warn(
        `[VolumeStoryGenerator] Story has ${priorScenes.length} scenes — ` +
        `prose excerpt context strategy may be insufficient. ` +
        `Consider switching CONTEXT_STRATEGY to 'embedding'.`
      )
    }

    if (CONTEXT_STRATEGY === 'embedding') {
      // Future: implement embedding-similarity retrieval here
      // For now, fall through to prose strategy
    }

    // Take the last 2 scenes — most relevant for immediate continuity
    const relevant = priorScenes.slice(-2)

    let context = ''
    for (const scene of relevant) {
      const excerpt = scene.prose.slice(0, 400).replace(/\s+\S*$/, '') + '...'
      context += `[Scene ${scene.sceneNumber}: "${scene.title}"]\n${excerpt}\n\n`
      if (context.length >= EMBEDDING_CONTEXT_MAX_CHARS) break
    }

    return context.trim()
  }

  function reset() {
    phase.value = 'idle'
    progress.current = 0
    progress.total = 0
    progress.sceneLabel = ''
    error.value = null
    volumeId.value = null
    scenePlan.value = []
    writtenScenes.value = []
    consistencyReport.value = null
    rejectedPatterns.value = []
  }

  return {
    phase,
    progress,
    error,
    volumeId,
    scenePlan,
    writtenScenes,
    consistencyReport,
    rejectedPatterns,
    isBootstrapping: bootstrapper.isBootstrapping,
    isWriting: writer.isWriting,
    isCheckingConsistency: critic.isCheckingConsistency,
    startGeneration,
    confirmPlan,
    logRejectedPattern,
    reset
  }
}
