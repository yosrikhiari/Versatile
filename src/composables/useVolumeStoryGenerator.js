import { ref, reactive } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStore } from '../stores/volumeStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { sanitizeJson } from '../services/ai/aiHelpers'
import { useStoryDirector } from './useStoryDirector'
import { useEntityBootstrapper } from './useEntityBootstrapper'
import { useStoryWriter } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'
import { useChapterGenerationSync } from './useChapterGenerationSync'
import { useStoryDocuments } from './useStoryDocuments'
import { useActivityLog } from './useActivityLog'
import { aiGenerate, getConfiguredModel } from '../services/aiService'
import { FEATURES, PROVIDERS } from '../config/ai'

function isOllamaProvider() {
  try {
    const config = getConfiguredModel(FEATURES.STORY_GENERATION)
    return config.provider === PROVIDERS.OLLAMA
  } catch {
    return false
  }
}

const PARALLEL_CHAPTER_LIMIT = () => isOllamaProvider() ? 1 : 3

function formatFullSpineEntry(s) {
  return `Chapter ${s.chapterNumber} (${s.chapterTitle}):\n- Emotion at end: ${s.emotionalStateAtEnd}\n- Reader knows: ${s.readerKnowledgeAtEnd}\n- Transition: ${s.transitionToNext}`
}

function compressSpine(spine, tokenCap = 800) {
  if (spine.length <= 3) return spine.map(formatFullSpineEntry).join('\n')
  const full = spine.slice(-3)
  const compressed = spine.slice(0, -3).map(s =>
    `Chapter ${s.chapterNumber} (${s.chapterTitle}): ${s.emotionalStateAtEnd}`
  )
  const combined = [...compressed, ...full.map(formatFullSpineEntry)]
  const text = combined.join('\n')
  return text.length > tokenCap * 4
    ? text.slice(0, tokenCap * 4) + '\n[spine truncated]'
    : text
}

async function parallelWithLimit(tasks, limit = 3) {
  const results = []
  const executing = []
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task())
    results.push(p)
    const e = p.then(() => {
      const idx = executing.indexOf(e)
      if (idx !== -1) executing.splice(idx, 1)
    }, () => {
      const idx = executing.indexOf(e)
      if (idx !== -1) executing.splice(idx, 1)
    })
    executing.push(e)
    if (executing.length >= limit) await Promise.race(executing)
  }
  return Promise.all(results)
}

async function generateSpine(chapters, storyArc) {
  const spine = []
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    const prevEntry = i > 0 ? spine[i - 1] : null
    
    let prompt = `You are designing a narrative spine for a novel.
Generate a 150-word spine entry for Chapter ${chapter.chapterNumber}: "${chapter.title}"

CHAPTER GOAL: ${chapter.goal}
EMOTIONAL TARGET: ${chapter.emotionalTarget}
HOOK ENDING: ${chapter.hookEnding}

`
    if (prevEntry) {
      prompt += `PREVIOUS CHAPTER (${prevEntry.chapterNumber}) ENDED WITH:
- Emotion: ${prevEntry.emotionalStateAtEnd}
- Transition to this chapter: ${prevEntry.transitionToNext}

`
    }
    
    prompt += `Provide a JSON object with EXACTLY these keys:
{
  "emotionalStateAtEnd": "string (emotional state of characters at chapter END)",
  "readerKnowledgeAtEnd": "string (what the reader knows by chapter end)",
  "transitionToNext": "string (what changes between this chapter and the next)",
  "wordCount": number
}`

    const raw = await aiGenerate(prompt, `You are a structural story architect. Genre: ${storyArc?.genre || 'fiction'}. Tone: ${storyArc?.tone || 'standard'}. Return ONLY valid JSON.`, { feature: FEATURES.STORY_GENERATION, temperature: 0.7 })
    
    const parsed = sanitizeJson(raw)
    if (!parsed || !parsed.emotionalStateAtEnd) {
      throw new Error(`Failed to generate spine for chapter ${chapter.chapterNumber}`)
    }
    
    spine.push({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      emotionalStateAtEnd: parsed.emotionalStateAtEnd,
      readerKnowledgeAtEnd: parsed.readerKnowledgeAtEnd,
      transitionToNext: parsed.transitionToNext,
      wordCount: parsed.wordCount || 100
    })
  }
  return spine
}

function buildExistingEntitiesBlob(characterList, locationList, plotThreadList) {
  return JSON.stringify({
    characters: characterList.map(c => ({ name: c.name, role: c.role, description: c.description, traits: c.traits || [] })),
    locations: locationList.map(l => ({ name: l.name, description: l.description, notes: l.notes, traits: l.traits || [] })),
    plotThreads: plotThreadList.map(t => ({ title: t.title, status: t.status, notes: t.notes, traits: t.traits || [] }))
  }, null, 2)
}

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
    }).catch(() => console.warn('[VolumeStoryGenerator] Debug fetch failed'))
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
  const chapterPlan = ref([])
  const spineArray = ref([])
  const spineContext = ref('')
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
  const actLog = useActivityLog()
  let currentTaskId = null

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
        temperature: 0.3,
        maxTokens: 200
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
    const wordCount = fullProse.split(/\s+/).length

    if (scene.subsectionId) {
      await manuscriptStore.updateSubsectionData(scene.subsectionId, {
        content: fullProse,
        wordCount
      }, projectId)
    }

    if (sections[sectionIdx]) {
      const sectionId = sections[sectionIdx].id
      const writtenInSection = writtenScenes.value
        .slice(sectionIdx * 3, (sectionIdx + 1) * 3)
      const totalWords = writtenInSection.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0)
        + wordCount
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

  async function startGeneration({ projectId, synopsis, genre, tone, wordTarget, singleChapter, sparkContext, onPhaseChange, onPartialData }) {
    if (phase.value !== 'idle') return

    error.value = null
    consistencyReport.value = null
    writtenScenes.value = []
    scenePlan.value = []
    rejectedPatterns.value = []

    currentTaskId = actLog.addTask({ name: 'Story Generator', type: 'generation' })
    let bpPhase = actLog.addPhase(currentTaskId, 'Bootstrapping')

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
      // Phase 1: Bootstrap entities
      progress.current = 2
      progress.statusText = 'Conjuring Characters & World...'
      await bootstrapper.bootstrapEntities({ synopsis: enhancedSynopsis, projectId, volumeId: vId, onPartialData })
      actLog.updatePhase(currentTaskId, bpPhase, { status: 'done' })
      bpPhase = -1

      // Reload story context so the newly generated entities are included in evidence
      const updatedBibleContext = await storyDocs.getStoryDocumentContext(projectId)
      const updatedEvidenceParts = []
      if (updatedBibleContext) updatedEvidenceParts.push(updatedBibleContext)
      if (sceneSummaries.length > 0) {
        updatedEvidenceParts.push('# Existing Manuscript Scenes\n' + sceneSummaries.slice(-20).join('\n'))
      }
      const updatedEvidence = updatedEvidenceParts.join('\n\n')

      // Phase 2: Generate story plan using the updated context
      progress.current = 3
      progress.statusText = 'Forging the Story Graph (Planning scenes)...'
      phase.value = 'planning'
      onPhaseChange?.('planning')
      const planPhase = actLog.addPhase(currentTaskId, 'Planning')

      const directorResult = await director.generateStoryPlan({ 
        goal: { premise: enhancedSynopsis, genre, tone, wordTarget, horizon: 'long_term' }, 
        evidence: updatedEvidence, 
        onPartialData 
      })

      const scenes = directorResult.scenes
      const storyArc = directorResult.storyArc

      if (!Array.isArray(scenes) || scenes.length < 3) {
        throw new Error('Director returned insufficient scenes (need at least 3)')
      }

      // Cap to 1 scene for single-chapter mode
      const planScenes = singleChapter ? [scenes[0]] : scenes
      
      chapterPlan.value = directorResult.chapters

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
        estimatedWords: singleChapter ? wordTarget : (s.estimatedWords || Math.round(wordTarget / scenes.length)),
        emotionalGoal: s.emotionalGoal || '',
        whatChanges: s.whatChanges || '',
        charactersPresent: s.charactersPresent || [],
        characterWants: s.characterWants || {},
        setup: s.setup || '',
        payoff: s.payoff || 'none',
        sensoryAnchor: s.sensoryAnchor || '',
        arcPosition: s.arcPosition || ''
      }))

      progress.current = 4
      progress.statusText = 'Sealing the Arc Contract...'
      await buildPreliminaryEdges(projectId, vId, scenePlan.value)

      // Build story contract from the plan
      const storyContract = [
        `Genre: ${genre}`,
        `Tone: ${tone}`,
        `Central conflict: ${storyArc?.centralConflict || 'unknown'}`,
        `Characters in story: ${[...new Set([
          ...scenes.flatMap(s => s.characters || s.charactersPresent || []),
          ...storyBibleStore.characters.map(c => c.name)
        ])].join(', ')}`,
        `Locations in story: ${[...new Set([
          ...scenes.flatMap(s => s.location ? [s.location] : []),
          ...storyBibleStore.locations.map(l => l.name)
        ])].join(', ')}`
      ].join('\n')

      actLog.updatePhase(currentTaskId, planPhase, { status: 'done' })

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
        chapters: directorResult.chapters,
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

  async function runParallelGeneration(writeParamsVal) {
    if (!writeParamsVal) return
    const { storyArc, storyBibleDocs, storyContract, projectId, onChunk } = writeParamsVal
    
    const existingEntitiesJson = buildExistingEntitiesBlob(storyBibleStore.characters, storyBibleStore.locations, storyBibleStore.plotThreads)

    writtenScenes.value = new Array(scenePlan.value.length).fill(null)
    const chaptersWithScenes = []
    let offset = 0
    for (const c of chapterPlan.value) {
      const group = scenePlan.value.slice(offset, offset + c.scenes.length)
      chaptersWithScenes.push({ chapterMeta: c, scenes: group, startIndex: offset })
      offset += c.scenes.length
    }

    progress.statusText = 'Phase 1: Generating chapter anchors in parallel...'
    phase.value = 'writing'
    
    async function generateAnchor(scene, role, constraints, sceneIndex, chapterIndex) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      try {
        let fullProse = ''
        const result = await writer.writeSceneStructured({
          sceneBrief: scene, storyArc, chapterLog: '', storyBible: storyBibleDocs,
          spineContext: spineContext.value, anchorRole: role, anchorConstraints: constraints,
          storyContract, existingEntitiesJson,
          onChunk: (_chunk, proseChunk) => {
            fullProse += proseChunk || ''
            onChunk?.({ sceneIndex: sceneIndex + 1, total: scenePlan.value.length, chunk: proseChunk, fullProse, scene })
          },
          onRawChunk: (chunk) => actLog.appendThought(currentTaskId, scenePhase, chunk)
        })
        fullProse = result.prose
        
        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse)
        const wordCount = fullProse.split(/\\s+/).length
        
        if (scene.subsectionId) {
          await manuscriptStore.updateSubsectionData(scene.subsectionId, { content: fullProse, wordCount }, projectId)
        }

        const chapterNumber = chaptersWithScenes[chapterIndex].chapterMeta.chapterNumber
        writtenScenes.value[sceneIndex] = {
          title: scene.title || `Scene ${scene.sceneNumber}`,
          prose: fullProse, summary, characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || '', sceneNumber: scene.sceneNumber, subsectionId: scene.subsectionId,
          chapterId: chapterNumber
        }
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: result.structured }
      } catch (err) {
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const anchorTasks = chaptersWithScenes.map((chGroup, chapterIndex) => {
      return async () => {
        const { chapterMeta, scenes, startIndex } = chGroup
        const prevSpine = chapterIndex > 0 ? spineArray.value[chapterIndex - 1] : null
        const prevEmotion = prevSpine?.emotionalStateAtEnd || 'story beginning'
        
        const openingConstraints = `Previous chapter ended with: ${prevEmotion}\\nThis scene must begin where the previous chapter left off emotionally.`
        const closingConstraints = `This scene MUST end on this exact hook:\\n"${chapterMeta.hookEnding}"\\nDo not soften it. Do not add resolution. End there.`
        
        const openingScene = scenes[0]
        const closingScene = scenes.length > 1 ? scenes[scenes.length - 1] : null
        
        const promises = [generateAnchor(openingScene, "Opening scene — this is the chapter's entry point.", openingConstraints, startIndex, chapterIndex)]
        if (closingScene) {
          promises.push(generateAnchor(closingScene, "Closing scene — this scene MUST end on this exact hook.", closingConstraints, startIndex + scenes.length - 1, chapterIndex))
        }
        
        const results = await Promise.all(promises)
        const failed = results.filter(r => !r.success)
        return { chapterNumber: chapterMeta.chapterNumber, results, failed: failed.length > 0 }
      }
    })

    const limit = PARALLEL_CHAPTER_LIMIT()
    const anchorOutcomes = await parallelWithLimit(anchorTasks, limit)
    
    debugSnapshot('step-1-anchors', { outcomes: anchorOutcomes })

    // Phase 2: Generate middle scenes per chapter
    progress.statusText = 'Phase 2: Generating chapter middle scenes...'

    async function generateMiddleScene(scene, sceneIndex, chapterMeta) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      try {
        // Chapter-scoped log: only scenes from this chapter (Fix #2 — never cross-chapter)
        const logEntries = writtenScenes.value
          .filter(s => s && s.chapterId === chapterMeta.chapterNumber && s.summary)
          .map(s => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}`)
        const chapterLog = logEntries.join('\n')

        let fullProse = ''
        const result = await writer.writeSceneStructured({
          sceneBrief: scene, storyArc, chapterLog,
          storyBible: storyBibleDocs,
          spineContext: spineContext.value,
          storyContract, existingEntitiesJson,
          onChunk: (_chunk, proseChunk) => {
            fullProse += proseChunk || ''
            onChunk?.({ sceneIndex: sceneIndex + 1, total: scenePlan.value.length, chunk: proseChunk, fullProse, scene })
          },
          onRawChunk: (chunk) => actLog.appendThought(currentTaskId, scenePhase, chunk)
        })
        fullProse = result.prose

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse)
        const wordCount = fullProse.split(/\s+/).length

        if (scene.subsectionId) {
          await manuscriptStore.updateSubsectionData(scene.subsectionId, { content: fullProse, wordCount }, projectId)
        }

        writtenScenes.value[sceneIndex] = {
          title: scene.title || `Scene ${scene.sceneNumber}`,
          prose: fullProse, summary,
          characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || '',
          sceneNumber: scene.sceneNumber,
          subsectionId: scene.subsectionId,
          chapterId: chapterMeta.chapterNumber
        }

        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: result.structured }
      } catch (err) {
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const middleTasks = []
    for (let chapterIndex = 0; chapterIndex < chaptersWithScenes.length; chapterIndex++) {
      const { chapterMeta, scenes, startIndex } = chaptersWithScenes[chapterIndex]
      for (let j = 0; j < scenes.length; j++) {
        const sceneIndex = startIndex + j
        // Skip already-written scenes (anchors completed successfully)
        if (writtenScenes.value[sceneIndex] !== null) continue
        const scene = scenes[j]
        middleTasks.push(() => generateMiddleScene(scene, sceneIndex, chapterMeta))
      }
    }

    let middleOutcomes = []
    if (middleTasks.length > 0) {
      middleOutcomes = await parallelWithLimit(middleTasks, limit)
    }

    debugSnapshot('step-2-middle-scenes', {
      totalScenes: scenePlan.value.length,
      writtenCount: writtenScenes.value.filter(s => s !== null).length,
      middleTasks: middleTasks.length,
      successful: middleOutcomes.filter(o => o.success).length,
      failed: middleOutcomes.filter(o => !o.success).length,
      outcomes: middleOutcomes
    })

    await completeGeneration(projectId)
  }

  async function writeNextBatch(startIndex) {
    if (!writeParams.value) return

    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs } = writeParams.value
    const endIndex = Math.min(startIndex + SYNC_BATCH_SIZE, scenePlan.value.length)

    debugSnapshot('step-2-writing-start', {
      startIndex,
      endIndex,
      totalScenes: scenePlan.value.length,
      storyContract
    })

    // Build running chapter log once from existing scenes (Fix #2 — avoids O(n²) rebuild per scene)
    const runningChapterLog = writtenScenes.value.map((ws, idx) =>
      `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`
    )

    // Build entities JSON once per batch (Fix #3 — entities don't change within a batch)
    const existingEntitiesJson = buildExistingEntitiesBlob(storyBibleStore.characters, storyBibleStore.locations, storyBibleStore.plotThreads)

    for (let i = startIndex; i < endIndex; i++) {
      const scene = scenePlan.value[i]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      progress.current = i + 1
      progress.sceneLabel = scene.title || `Scene ${scene.sceneNumber}`
      progress.statusText = `Drafting scene details, building continuity context, and streaming prose...`

      // Retrieve context from prior scenes (prose excerpts, not embeddings)
      const embeddingContext = buildEmbeddingContext(scene, writtenScenes.value)

      // Build chapter log from running array (O(1) slice instead of O(n) rebuild)
      const chapterLog = runningChapterLog.slice(-20).join('\n')

      // Retrieve rejected patterns for Writer
      const extraRejected = rejectedPatterns.value.length > 0 ? rejectedPatterns.value : undefined

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
        onRawChunk: (chunk) => actLog.appendThought(currentTaskId, scenePhase, chunk),
        embeddingContext,
        storyContract: effectiveStoryContract,
        rejectedPatterns: extraRejected,
        existingEntitiesJson
      })
      actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })

      fullProse = result.prose
      structuredResults.push({ sceneIndex: i, structured: result.structured })

      if (sceneReviewMode.value && i < scenePlan.value.length - 1) {
        currentSceneResult.value = { scene, fullProse, structured: result.structured, sectionIdx: Math.floor(i / 3) }
        currentWriteIndex.value = i + 1
        phase.value = 'scene-review'
        return
      }

      await commitAndStoreScene(scene, fullProse, Math.floor(i / 3), sections, projectId)

      // Append to running log after scene completes (avoids full rebuild next iteration)
      const latestScene = writtenScenes.value.at(-1)
      runningChapterLog.push(
        `Scene ${scene.sceneNumber} ("${scene.title || `Scene ${scene.sceneNumber}`}"): ${latestScene?.summary || '(written)'}`
      )

      debugSnapshot(`step-3-scene-${i}`, {
        scene: {
          index: i,
          title: scene.title || `Scene ${scene.sceneNumber}`,
          wordCount: fullProse.split(/\s+/).length,
          characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || ''
        },
        structured: result.structured,
        styleGuideInjected: true
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

    // Create sections using Director-provided chapter boundaries
    const sections = []
    if (chapterPlan.value && chapterPlan.value.length > 0) {
      let offset = 0
      for (const chapter of chapterPlan.value) {
        const group = editedPlan.slice(offset, offset + chapter.scenes.length)
        if (group.length === 0) { offset += chapter.scenes.length; continue }
        const sectionData = {
          title: chapter.title || `Chapter ${chapter.chapterNumber || sections.length + 1}`,
          summary: group.map(s => s.title || `Scene ${s.sceneNumber}`).join(', '),
          wordCount: 0
        }
        const sectionId = await manuscriptStore.addSectionData(projectId, sectionData)
        sections.push({ id: sectionId, scenes: group, subsectionIds: [], chapterMeta: chapter })

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

        if (volumeId.value) {
          await volumeStore.assignChapter(sectionId, volumeId.value, projectId)
        }
        offset += chapter.scenes.length
      }
    } else {
      // Fallback: mechanical 3-scene split if no chapter plan
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

        if (volumeId.value) {
          await volumeStore.assignChapter(sectionId, volumeId.value, projectId)
        }
      }
    }

    // Phase 0: Spine Generation
    progress.statusText = 'Generating hierarchical narrative spine...'
    phase.value = 'spine-generation'
    onPhaseChange?.('spine-generation')
    const spinePhase = actLog.addPhase(currentTaskId, 'Spine Generation')
    
    try {
      spineArray.value = await generateSpine(chapterPlan.value, storyArc)
      debugSnapshot('step-0-spine', {
        spine: spineArray.value,
        estimatedTokens: Math.round(JSON.stringify(spineArray.value).length / 4)
      })
      spineContext.value = compressSpine(spineArray.value)
      actLog.updatePhase(currentTaskId, spinePhase, { status: 'done' })
    } catch (err) {
      error.value = err.message || 'Fatal: Spine generation failed'
      phase.value = 'error'
      throw err
    }

    // Phase 3: Incremental writing
    phase.value = 'writing'
    onPhaseChange?.('writing')
    error.value = null
    progress.statusText = 'Entering incremental drafting pipeline...'

    const enhancedSynopsis = sparkContext
      ? `${synopsis}\n\nAdditional context from brainstorming:\n${sparkContext}`
      : synopsis

    // Cache story bible docs for the entire run (Fix #4 — avoids Dexie re-query per batch)
    const storyDocuments = useStoryDocuments()
    const storyBibleDocs = await storyDocuments.getStoryDocumentContext(projectId)

    writeParams.value = { projectId, storyArc, storyContract, synopsis: enhancedSynopsis, onChunk, sections, storyBibleDocs }

    await runParallelGeneration(writeParams.value)
  }

  async function completeGeneration(projectId) {
    const consistencyPhase = actLog.addPhase(currentTaskId, 'Consistency Check')
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

    actLog.updatePhase(currentTaskId, consistencyPhase, { status: 'done' })
    actLog.completeTask(currentTaskId)

    phase.value = 'complete'
    progress.statusText = 'Volume generation complete!'

    // Compute total words once (Fix #10 — was computed twice in quick succession)
    const totalWords = writtenScenes.value.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0)

    try {
      const { db } = await import('../services/db-core')
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
      totalWords,
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

    const existingEntitiesJson = buildExistingEntitiesBlob(storyBibleStore.characters, storyBibleStore.locations, storyBibleStore.plotThreads)

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

      // Fix #11: Use Map with string keys instead of Set with objects
      // (Set compares by reference, so { charId, locId } objects were never deduplicated)
      const pairMap = new Map()
      for (const scene of plan) {
        const chars = scene.characters || scene.charactersPresent || []
        const location = scene.location || ''
        if (!location || chars.length === 0) continue
        const locId = locByName[location.toLowerCase().trim()]
        if (!locId) continue
        for (const charName of chars) {
          const charId = charByName[charName.toLowerCase().trim()]
          if (!charId) continue
          const key = `${charId}|${locId}`
          if (!pairMap.has(key)) {
            pairMap.set(key, { charId, locId, charName, location })
          }
        }
      }

      if (pairMap.size === 0) return

      const graphStore = useStoryGraphStore()
      await graphStore.loadEdges(projectId)

      const existingEdgeKeys = new Set()
      for (const edge of graphStore.edges.value) {
        existingEdgeKeys.add(`${edge.sourceId}|${edge.targetId}`)
        existingEdgeKeys.add(`${edge.targetId}|${edge.sourceId}`)
      }

      for (const [key, pair] of pairMap) {
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

export {
  buildEmbeddingContext,
  formatFullSpineEntry,
  compressSpine,
  buildExistingEntitiesBlob,
  parallelWithLimit
}
