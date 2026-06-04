import { ref, reactive } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStore } from '../stores/volumeStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useStoryDirector } from './useStoryDirector'
import { useEntityBootstrapper } from './useEntityBootstrapper'
import { useStoryWriter } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'
import { useChapterGenerationSync } from './useChapterGenerationSync'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'

const EMBEDDING_CONTEXT_MAX_CHARS = 1400
const MAX_REJECTED_PATTERNS = 5

// Context strategy for buildEmbeddingContext.
// 'prose' — last 2 scenes' prose excerpts (correct for 6–15 scenes).
// 'embedding' — future: embedding-similarity retrieval (for 25+ scenes).
const CONTEXT_STRATEGY = 'prose'
const PROSE_EXCERPT_MAX_SCENES = 25

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
  }

  let context = ''

  const precedingScene = priorScenes.at(-1)
  if (precedingScene) {
    const endingExcerpt = precedingScene.prose.length > 1200
      ? '...' + precedingScene.prose.slice(-1200)
      : precedingScene.prose
    context += `[Ending of Preceding Scene ${precedingScene.sceneNumber}: "${precedingScene.title}"]\n${endingExcerpt}\n\n`
  }

  const olderScene = priorScenes.at(-2)
  if (olderScene && context.length < EMBEDDING_CONTEXT_MAX_CHARS) {
    context += `[Summary of Scene ${olderScene.sceneNumber}: "${olderScene.title}"]\n${olderScene.summary || olderScene.prose.slice(0, 300) + '...'}\n\n`
  }

  return context.trim()
}

export function useVolumeStoryGenerator() {
  const phase = ref('idle')
  const progress = reactive({ current: 0, total: 0, sceneLabel: '', statusText: '' })
  const error = ref(null)
  const volumeId = ref(null)
  const scenePlan = ref([])
  const writtenScenes = ref([])
  const consistencyReport = ref(null)
  const rejectedPatterns = ref([])
  const syncPreview = ref([])
  let structuredResults = []

  const director = useStoryDirector()
  const bootstrapper = useEntityBootstrapper()
  const writer = useStoryWriter()
  const critic = useStoryCritic()
  const sync = useChapterGenerationSync()
  const storyBibleStore = useStoryBibleStore()
  const volumeStore = useVolumeStore()
  const manuscriptStore = useManuscriptStore()

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

      // Phase 1 & 2: Concurrently bootstrap entities and generate story plan
      phase.value = 'bootstrapping'
      onPhaseChange?.('bootstrapping')
      progress.statusText = 'Initializing world elements, seeding character sheets, and drafting narrative structure...'

      const [, directorResult] = await Promise.all([
        bootstrapper.bootstrapEntities({ synopsis: enhancedSynopsis, projectId, volumeId: vId }),
        director.generateStoryPlan({ premise: enhancedSynopsis, genre, tone, wordTarget })
      ])

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

      // Build preliminary network edges from scene plan
      await buildPreliminaryEdges(projectId, vId, scenePlan.value)

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
      progress.statusText = `Drafting scene details, building continuity context, and streaming prose...`

      // Retrieve context from prior scenes (prose excerpts, not embeddings)
      const embeddingContext = buildEmbeddingContext(scene, writtenScenes.value)

      // Build chapter log from prior scenes
      const rawLog = writtenScenes.value.map((ws, idx) =>
        `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`
      )
      const chapterLog = rawLog.slice(-20).join('\n')

      // Retrieve rejected patterns for Writer
      const extraRejected = rejectedPatterns.value.length > 0 ? rejectedPatterns.value : undefined

      // Build existing entities JSON for structured writing
      const existingEntitiesJson = JSON.stringify({
        characters: storyBibleStore.characters.map(c => ({ name: c.name, role: c.role, description: c.description })),
        locations: storyBibleStore.locations.map(l => ({ name: l.name, type: l.type, description: l.description })),
        plotThreads: storyBibleStore.plotThreads.map(t => ({ title: t.title, status: t.status, summary: t.summary }))
      }, null, 2)

      // Write the scene with structured output
      let fullProse = ''
      const result = await writer.writeSceneStructured({
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
        rejectedPatterns: extraRejected,
        existingEntitiesJson
      })

      fullProse = result.prose
      structuredResults.push({ sceneIndex: i, structured: result.structured })

      // Summarize for chapter log
      progress.statusText = `Compiling prose and generating plot-accurate continuity summaries...`
      let summary = ''
      try {
        const summaryPrompt = `You are a copyeditor. Summarize the following narrative scene in exactly one concise sentence:\n\n"${fullProse.slice(0, 3000)}"`
        const summaryResponse = await aiGenerate(summaryPrompt, "Summarize the scene in one sentence.", {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.3
        })
        summary = summaryResponse.replace(/^Summary:\s*/i, '').replace(/(^")|("$)/g, '').trim()
      } catch (err) {
        console.warn('[useVolumeStoryGenerator] Fallback slice summary used:', err)
        summary = fullProse.slice(0, 150).replace(/\s+\S*$/, '') + '...'
      }

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
    progress.statusText = 'Building manuscript structure, initializing sections, and assigning chapters...'

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
        sections.at(-1).subsectionIds.push(subId)
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
    progress.statusText = 'Entering incremental drafting pipeline...'

    const enhancedSynopsis = sparkContext
      ? `${synopsis}\n\nAdditional context from brainstorming:\n${sparkContext}`
      : synopsis

    await writeAllScenes({ projectId, editedPlan, sections, storyArc, storyContract, synopsis: enhancedSynopsis, onChunk })

    // Phase 3.5: Sync preview — discover new entities from all scenes
    phase.value = 'sync-preview'
    onPhaseChange?.('sync-preview')
    progress.statusText = 'Scanning written chapters to discover organically introduced characters & locations...'

    // Merge structured results: discover entities across all scenes
    const allChanges = []
    for (const sr of structuredResults) {
      if (sr.structured) {
        const sceneChanges = sync.discoverSync(sr.structured)
        allChanges.push(...sceneChanges)
      }
    }
    syncPreview.value = allChanges
  }

  async function confirmSync({ acceptedEntities, projectId, volumeId, chapterId }) {
    if (phase.value !== 'sync-preview') return
    progress.statusText = 'Integrating accepted entities and syncing story graph network...'

    // Commit accepted entities to bible + volume network + graph
    const validStructured = structuredResults.filter(sr => sr.structured).map(sr => sr.structured)
    await sync.commitSync({
      structuredOutputs: validStructured,
      acceptedEntities,
      projectId,
      volumeId: volumeId || volumeId.value,
      chapterId: chapterId || null
    })

    // Phase 4: Consistency critic
    phase.value = 'consistency-check'
    progress.statusText = 'Auditing written prose against character bio sheets to find narrative contradictions...'
    // onPhaseChange is internal; store ref if needed
    const characters = storyBibleStore.characters
    const locations = storyBibleStore.locations

    if (characters.length > 1 || locations.length > 1) {
      const report = await critic.checkContradictions({
        characters,
        locations,
        sceneProse: writtenScenes.value,
        synopsis: ''  // enhancedSynopsis not stored; prose is primary input
      })
      consistencyReport.value = report
    }

    // Phase 5: Complete
    phase.value = 'complete'
    progress.statusText = 'Volume generation complete!'

    // Save story to generatedStories Dexie table
    try {
      const { db } = await import('../services/db-core')
      const totalWords = writtenScenes.value.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0)
      await db.generatedStories.add({
        projectId,
        title: `Volume Story — ${new Date().toLocaleDateString()}`,
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

  async function buildPreliminaryEdges(projectId, volumeId, plan) {
    try {
      const bibleStore = useStoryBibleStore()
      const charByName = {}
      for (const c of bibleStore.characters) charByName[c.name.toLowerCase().trim()] = c.id
      const locByName = {}
      for (const l of bibleStore.locations) locByName[l.name.toLowerCase().trim()] = l.id

      const pairs = new Set()
      for (const scene of plan) {
        const chars = scene.characters || scene.charactersPresent || []
        const location = scene.location || ''
        if (!location || chars.length === 0) continue
        const locId = locByName[location.toLowerCase().trim()]
        if (!locId) continue
        for (const charName of chars) {
          const charId = charByName[charName.toLowerCase().trim()]
          if (!charId) continue
          pairs.add({ charId, locId, charName, location })
        }
      }

      if (pairs.size === 0) return

      const graphStore = useStoryGraphStore()
      await graphStore.loadEdges(projectId)

      const existingEdgeKeys = new Set()
      for (const edge of graphStore.edges.value) {
        existingEdgeKeys.add(`${edge.sourceId}|${edge.targetId}`)
        existingEdgeKeys.add(`${edge.targetId}|${edge.sourceId}`)
      }

      for (const pair of pairs) {
        const key = `${pair.charId}|${pair.locId}`
        if (!existingEdgeKeys.has(key)) {
          await graphStore.addEdgeData(projectId, {
            sourceId: String(pair.charId),
            sourceType: 'character',
            targetId: String(pair.locId),
            targetType: 'location',
            relationshipType: 'planned',
            description: `${pair.charName} visits ${pair.location} (planned)`,
            planned: true,
            volumeId: volumeId || null
          })
        }
      }
    } catch (err) {
      console.warn('[VolumeStoryGenerator] buildPreliminaryEdges failed:', err)
    }
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
    syncPreview.value = []
    structuredResults = []
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
    confirmSync,
    syncPreview,
    logRejectedPattern,
    reset
  }
}
