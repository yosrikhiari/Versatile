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
import { useStoryDocuments } from './useStoryDocuments'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'

const EMBEDDING_CONTEXT_MAX_CHARS = 1400
const MAX_REJECTED_PATTERNS = 5
const SYNC_BATCH_SIZE = 3

const DEBUG_ENDPOINT = '/__debug/snapshot'

function debugSnapshot(stage, data) {
  try {
    fetch(DEBUG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, data })
    }).catch(() => {})
  } catch {}
}

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
  const hasPendingBatches = ref(false)
  const pendingBatchStart = ref(0)
  const lastSyncedResultIndex = ref(0)
  const writeParams = ref(null)
  const sceneReviewMode = ref(false)
  const currentSceneResult = ref(null)
  const currentWriteIndex = ref(0)

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

  async function computeSummary(fullProse) {
    try {
      const summaryPrompt = `You are a copyeditor. Summarize the following narrative scene in exactly one concise sentence:\n\n"${fullProse.slice(0, 3000)}"`
      const summaryResponse = await aiGenerate(summaryPrompt, "Summarize the scene in one sentence.", {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.3
      })
      return summaryResponse.replace(/^Summary:\s*/i, '').replace(/(^")|("$)/g, '').trim()
    } catch (err) {
      console.warn('[useVolumeStoryGenerator] Fallback slice summary used:', err)
      return fullProse.slice(0, 150).replace(/\s+\S*$/, '') + '...'
    }
  }

  async function commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId) {
    progress.statusText = 'Compiling prose and generating plot-accurate continuity summaries...'
    const summary = await computeSummary(fullProse)

    if (scene.subsectionId) {
      await manuscriptStore.updateSubsectionData(scene.subsectionId, {
        content: fullProse,
        wordCount: fullProse.split(/\s+/).length
      }, projectId)
    }

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
      progress.total = 4
      phase.value = 'bootstrapping'
      onPhaseChange?.('bootstrapping')

      // Phase 0: Create volume first (so bootstrapping has a real volume ID)
      progress.current = 1
      progress.statusText = 'Creating volume...'
      const vId = await volumeStore.createVolume(projectId, {
        title: `${enhancedSynopsis.slice(0, 60)}...`,
        description: `Generated story — ${genre}, ${tone}`,
        color: '#6366f1',
        chapterIds: []
      })
      volumeId.value = vId

      // Load story bible context and existing manuscript as evidence for the Director
      progress.statusText = 'Loading story context for planning...'
      const storyDocs = useStoryDocuments()
      const bibleContext = await storyDocs.getStoryDocumentContext(projectId)

      const sceneSummaries = []
      for (const section of manuscriptStore.sortedSections) {
        const sectionSubs = manuscriptStore.subsections
          .filter(s => s.sectionId === section.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
        for (const sub of sectionSubs) {
          if (sub.content || sub.description) {
            const excerpt = sub.content
              ? sub.content.slice(0, 300).replace(/\s+\S*$/, '') + '...'
              : ''
            sceneSummaries.push(`"${sub.title}": ${sub.description || excerpt || '(written)'}`)
          }
        }
      }

      const evidenceParts = []
      if (bibleContext) evidenceParts.push(bibleContext)
      if (sceneSummaries.length > 0) {
        evidenceParts.push('# Existing Manuscript Scenes\n' + sceneSummaries.slice(-20).join('\n'))
      }
      const evidence = evidenceParts.join('\n\n')

      // Phase 1 & 2: Concurrently bootstrap entities and generate story plan
      progress.current = 2
      progress.statusText = 'Bootstrapping characters, locations, and planning scenes...'
      const [, directorResult] = await Promise.all([
        bootstrapper.bootstrapEntities({ synopsis: enhancedSynopsis, projectId, volumeId: vId }),
        director.generateStoryPlan({ goal: { premise: enhancedSynopsis, genre, tone, wordTarget }, evidence })
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
        sensoryAnchor: s.sensoryAnchor || '',
        arcPosition: s.arcPosition || ''
      }))

      const totalScenes = scenePlan.value.length
      progress.current = 3
      progress.statusText = 'Building story graph connections...'
      await buildPreliminaryEdges(projectId, vId, scenePlan.value)

      progress.current = 4
      progress.statusText = 'Finalizing story contract...'

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

      debugSnapshot('step-1-plan', {
        synopsis: enhancedSynopsis,
        genre,
        tone,
        wordTarget,
        scenePlan: scenePlan.value,
        storyArc,
        totalScenes: scenePlan.value.length,
        entityCounts: {
          characters: storyBibleStore.characters.length,
          locations: storyBibleStore.locations.length,
          plotThreads: storyBibleStore.plotThreads.length
        }
      })

      // Store arc for later use
      return { scenes: scenePlan.value, storyArc, volumeId: vId, storyContract }
    } catch (err) {
      phase.value = 'error'
      error.value = err.message || 'Generation failed during initial phases'
      throw err
    }
  }

  async function writeNextBatch(startIndex) {
    if (!writeParams.value) return

    const { projectId, storyArc, storyContract, synopsis, onChunk, sections } = writeParams.value
    const storyDocuments = useStoryDocuments()
    const storyBibleDocs = await storyDocuments.getStoryDocumentContext(projectId)
    const endIndex = Math.min(startIndex + SYNC_BATCH_SIZE, scenePlan.value.length)

    debugSnapshot('step-2-writing-start', {
      startIndex,
      endIndex,
      totalScenes: scenePlan.value.length,
      storyContract
    })

    for (let i = startIndex; i < endIndex; i++) {
      const scene = scenePlan.value[i]
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
        characters: storyBibleStore.characters.map(c => ({ name: c.name, role: c.role, description: c.description, traits: c.traits || [] })),
        locations: storyBibleStore.locations.map(l => ({ name: l.name, description: l.description, notes: l.notes, traits: l.traits || [] })),
        plotThreads: storyBibleStore.plotThreads.map(t => ({ title: t.title, status: t.status, notes: t.notes, traits: t.traits || [] }))
      }, null, 2)

      // Attach total scene count for context
      scene.totalScenes = scenePlan.value.length

      // Write the scene with structured output
      let fullProse = ''
      const effectiveStoryContract = scene.reRequestInstruction
        ? storyContract + `\n\nUser revision request for scene ${scene.sceneNumber}: ${scene.reRequestInstruction}`
        : storyContract
      if (scene.reRequestInstruction) delete scene.reRequestInstruction
      const result = await writer.writeSceneStructured({
        sceneBrief: scene,
        storyArc,
        chapterLog,
        storyBible: storyBibleDocs,
        onChunk: (_chunk, proseChunk) => {
          fullProse += proseChunk || ''
          onChunk?.({ sceneIndex: i + 1, total: scenePlan.value.length, chunk: proseChunk, fullProse, scene })
        },
        embeddingContext,
        storyContract: effectiveStoryContract,
        rejectedPatterns: extraRejected,
        existingEntitiesJson
      })

      fullProse = result.prose
      structuredResults.push({ sceneIndex: i, structured: result.structured })

      if (sceneReviewMode.value && i < scenePlan.value.length - 1) {
        currentSceneResult.value = { scene, fullProse, structured: result.structured, sectionIdx: Math.floor(i / 3) }
        currentWriteIndex.value = i + 1
        phase.value = 'scene-review'
        return
      }

      await commitAndStoreScene(scene, fullProse, Math.floor(i / 3), sections, projectId)

      debugSnapshot(`step-3-scene-${i}`, {
        scene: {
          index: i,
          title: scene.title || `Scene ${scene.sceneNumber}`,
          wordCount: fullProse.split(/\s+/).length,
          characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || ''
        },
        structured: result.structured
      })
    }

    // Discover entities from this batch only
    const freshStructured = structuredResults.slice(lastSyncedResultIndex.value)
    lastSyncedResultIndex.value = structuredResults.length

    const batchChanges = []
    for (const sr of freshStructured) {
      if (sr.structured) {
        const sceneChanges = sync.discoverSync(sr.structured)
        batchChanges.push(...sceneChanges)
      }
    }

    if (endIndex < scenePlan.value.length) {
      if (batchChanges.length > 0) {
        hasPendingBatches.value = true
        pendingBatchStart.value = endIndex
        syncPreview.value = batchChanges
        debugSnapshot('step-4-sync', {
          pendingBatchStart: endIndex,
          batchChanges
        })
        phase.value = 'sync-preview'
        return
      }
      // Note: recursive — max depth = ceil(totalScenes / SYNC_BATCH_SIZE). Not a stack risk for typical volumes (<100 scenes) but consider a while-loop refactor if volumes scale significantly.
      await writeNextBatch(endIndex)
      return
    }

    if (batchChanges.length > 0) {
      syncPreview.value = batchChanges
      phase.value = 'sync-preview'
      return
    }

    await completeGeneration(projectId)
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

    writeParams.value = { projectId, storyArc, storyContract, synopsis: enhancedSynopsis, onChunk, sections }

    await writeNextBatch(0)
  }

  async function completeGeneration(projectId) {
    phase.value = 'consistency-check'
    progress.statusText = 'Auditing written prose against character bio sheets to find narrative contradictions...'
    const characters = storyBibleStore.characters
    const locations = storyBibleStore.locations

    if (characters.length > 1 || locations.length > 1) {
      const report = await critic.checkContradictions({
        characters,
        locations,
        sceneProse: writtenScenes.value,
        synopsis: ''
      })
      consistencyReport.value = report
    }

    phase.value = 'complete'
    progress.statusText = 'Volume generation complete!'

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

    debugSnapshot('step-5-consistency', {
      totalScenes: writtenScenes.value.length,
      totalWords: writtenScenes.value.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0),
      consistencyReport: consistencyReport.value
    })
  }

  async function confirmSync({ acceptedEntities, projectId, volumeId, chapterId }) {
    if (phase.value !== 'sync-preview') return
    progress.statusText = 'Integrating accepted entities and syncing story graph network...'

    const validStructured = structuredResults.filter(sr => sr.structured).map(sr => sr.structured)
    await sync.commitSync({
      structuredOutputs: validStructured,
      acceptedEntities,
      projectId,
      volumeId: volumeId || volumeId.value,
      chapterId: chapterId || null
    })

    if (hasPendingBatches.value) {
      hasPendingBatches.value = false
      const resumeFrom = pendingBatchStart.value
      pendingBatchStart.value = 0
      phase.value = 'writing'
      await writeNextBatch(resumeFrom)
      return
    }

    await completeGeneration(projectId)
  }

  async function regenerateScene(projectId, sceneIndex) {
    if (phase.value !== 'complete') return
    if (!writeParams.value) return

    progress.statusText = `Re-generating scene ${sceneIndex + 1}...`
    phase.value = 'writing'

    const storyDocuments = useStoryDocuments()
    const storyBibleDocs = await storyDocuments.getStoryDocumentContext(projectId)

    // Build context from all scenes except the one being regenerated
    const priorScenes = writtenScenes.value.filter((_, i) => i !== sceneIndex)
    const scene = scenePlan.value[sceneIndex]
    const embeddingContext = buildEmbeddingContext(scene, priorScenes)

    const rawLog = priorScenes.map((ws, idx) =>
      `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`
    )
    const chapterLog = rawLog.slice(-20).join('\n')
    const extraRejected = rejectedPatterns.value.length > 0 ? rejectedPatterns.value : undefined

    const existingEntitiesJson = JSON.stringify({
      characters: storyBibleStore.characters.map(c => ({ name: c.name, role: c.role, description: c.description, traits: c.traits || [] })),
      locations: storyBibleStore.locations.map(l => ({ name: l.name, description: l.description, notes: l.notes, traits: l.traits || [] })),
      plotThreads: storyBibleStore.plotThreads.map(t => ({ title: t.title, status: t.status, notes: t.notes, traits: t.traits || [] }))
    }, null, 2)

    scene.totalScenes = scenePlan.value.length

    const { storyArc, storyContract, onChunk } = writeParams.value

    let fullProse = ''
    const result = await writer.writeSceneStructured({
      sceneBrief: scene,
      storyArc,
      chapterLog,
      storyBible: storyBibleDocs,
      onChunk: (_chunk, proseChunk) => {
        fullProse += proseChunk || ''
        onChunk?.({ sceneIndex: sceneIndex + 1, total: scenePlan.value.length, chunk: proseChunk, fullProse, scene })
      },
      embeddingContext,
      storyContract,
      rejectedPatterns: extraRejected,
      existingEntitiesJson
    })
    fullProse = result.prose

    writtenScenes.value[sceneIndex] = {
      title: scene.title || `Scene ${scene.sceneNumber}`,
      prose: fullProse,
      summary: await computeSummary(fullProse),
      characters: scene.characters || scene.charactersPresent || [],
      location: scene.location || '',
      sceneNumber: scene.sceneNumber,
      subsectionId: scene.subsectionId
    }

    if (scene.subsectionId) {
      await manuscriptStore.updateSubsectionData(scene.subsectionId, {
        content: fullProse,
        wordCount: fullProse.split(/\s+/).length
      }, projectId)
    }

    await completeGeneration(projectId)
  }

  async function approveScene() {
    if (!currentSceneResult.value || !writeParams.value) return
    const { scene, fullProse, sectionIdx } = currentSceneResult.value
    const { projectId, sections } = writeParams.value
    currentSceneResult.value = null
    progress.statusText = 'Approving scene and continuing...'
    await commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId)
    phase.value = 'writing'
    await writeNextBatch(currentWriteIndex.value)
  }

  async function rejectScene() {
    if (!currentSceneResult.value) return
    const { scene, fullProse } = currentSceneResult.value
    logRejectedPattern(scene.goal || scene.title, fullProse.slice(0, 500))
    currentSceneResult.value = null
    progress.statusText = 'Rejecting scene, rewriting...'
    phase.value = 'writing'
    await writeNextBatch(currentWriteIndex.value - 1)
  }

  async function rerequestScene(edits) {
    if (!currentSceneResult.value || !edits?.trim()) return
    const i = currentWriteIndex.value - 1
    scenePlan.value[i].reRequestInstruction = edits
    currentSceneResult.value = null
    progress.statusText = 'Rewriting scene with user revisions...'
    phase.value = 'writing'
    await writeNextBatch(i)
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
    hasPendingBatches.value = false
    pendingBatchStart.value = 0
    lastSyncedResultIndex.value = 0
    writeParams.value = null
    sceneReviewMode.value = false
    currentSceneResult.value = null
    currentWriteIndex.value = 0
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
    hasPendingBatches,
    pendingBatchStart,
    logRejectedPattern,
    sceneReviewMode,
    currentSceneResult,
    currentWriteIndex,
    approveScene,
    rejectScene,
    rerequestScene,
    regenerateScene,
    reset
  }
}

export { buildEmbeddingContext }
