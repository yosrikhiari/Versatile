import { createAgentMemory } from './AgentMemory'
import { Delegator } from './Delegator'
import { useStoryBibleStore } from '../../../stores/storyBibleStore'
import { useManuscriptStore } from '../../../stores/manuscriptStore'
import { useStoryDirector } from '../../useStoryDirector'
import { useStoryWriter } from '../../useStoryWriter'
import { useStoryCritic } from '../../useStoryCritic'
import { useChapterGenerationSync } from '../../useChapterGenerationSync'
import { useActivityLog } from '../../useActivityLog'
import { CommitService } from '../commit'
import { ConsistencyService } from '../consistency'
import { SceneInteractionService } from '../interaction'
import { buildPreliminaryEdges } from '../graph'
import { getResumableRun as getResumableRunFn } from '../checkpoint'
import {
  getGenRun,
  saveGenRun,
  updateGenRunStage,
  makeInitialGenState
} from '../../../services/db-generation'
import {
  createDirectorTool,
  createWriterTool,
  createCriticTool,
  createSyncTool,
  createCommitTool,
  createConsistencyTool,
  createSceneTool,
  createGraphTool,
} from './tools'

export function useDelegatorGeneration() {
  const memory = createAgentMemory()

  // --- Wire Pinia stores ---
  memory.instances.storyBibleStore = useStoryBibleStore()
  memory.instances.manuscriptStore = useManuscriptStore()

  // --- Wire Vue composable service instances ---
  memory.instances.director = useStoryDirector()
  memory.instances.writer = useStoryWriter()
  memory.instances.critic = useStoryCritic()
  memory.instances.sync = useChapterGenerationSync()

  // --- Wire graph builder ---
  memory.instances.graphBuilder = { buildPreliminaryEdges }

  // --- Wire activity log with addEntry bridge ---
  const _actLog = useActivityLog()
  memory.instances.actLog = {
    ..._actLog,
    addEntry(type, data) {
      const tid = memory.currentTaskId?.value
      if (tid) {
        _actLog.appendThought(tid, type, JSON.stringify(data ?? {}))
      }
    },
  }

  // --- Wire service classes with shared AgentMemory refs ---
  memory.instances.commitService = new CommitService({
    writeParams: memory.writeParams,
    volumeId: memory.volumeId,
    scenePlan: memory.scenePlan,
    chapterPlan: memory.chapterPlan,
    spineArray: memory.spineArray,
    spineContext: memory.spineContext,
    autoMode: memory.autoMode,
    writtenScenes: memory.writtenScenes,
    lastSyncedResultIndex: memory.lastSyncedResultIndex,
    progress: memory.progress,
    manuscriptStore: memory.instances.manuscriptStore,
    getGenRun,
    saveGenRun,
    makeInitialGenState
  })

  memory.instances.consistencyService = new ConsistencyService({
    writeParams: memory.writeParams,
    scenePlan: memory.scenePlan,
    chapterPlan: memory.chapterPlan,
    spineArray: memory.spineArray,
    autoMode: memory.autoMode,
    writtenScenes: memory.writtenScenes,
    consistencyReport: memory.consistencyReport,
    phase: memory.phase,
    progress: memory.progress,
    storyBibleStore: memory.instances.storyBibleStore,
    critic: memory.instances.critic,
    writer: memory.instances.writer,
    manuscriptStore: memory.instances.manuscriptStore,
    updateGenRunStage,
    actLog: memory.instances.actLog
  })

  memory.instances.sceneInteractionService = new SceneInteractionService({
    writeParams: memory.writeParams,
    scenePlan: memory.scenePlan,
    phase: memory.phase,
    progress: memory.progress,
    writer: memory.instances.writer,
    sync: memory.instances.sync,
    actLog: memory.instances.actLog,
    writtenScenes: memory.writtenScenes,
    structuredResults: memory.structuredResults,
    hasPendingBatches: memory.hasPendingBatches,
    pendingBatchStart: memory.pendingBatchStart,
    manuscriptStore: memory.instances.manuscriptStore,
    storyBibleStore: memory.instances.storyBibleStore,
    commitService: memory.instances.commitService,
    rejectedPatterns: memory.rejectedPatterns,
    autoMode: memory.autoMode,
    sceneReviewMode: memory.sceneReviewMode,
    currentSceneResult: memory.currentSceneResult,
    currentWriteIndex: memory.currentWriteIndex,
    sceneEvalResults: memory.sceneEvalResults,
    lastSyncedResultIndex: memory.lastSyncedResultIndex,
    syncPreview: memory.syncPreview,
    currentTaskId: memory.currentTaskId,
    volumeId: memory.volumeId,
    consistencyService: memory.instances.consistencyService,
  })

  // --- Create narrow agent tool wrappers ---
  const tools = {
    director: createDirectorTool(memory),
    writer: createWriterTool(memory),
    critic: createCriticTool(memory),
    sync: createSyncTool(memory),
    commit: createCommitTool(memory),
    consistency: createConsistencyTool(memory),
    scene: createSceneTool(memory),
    graph: createGraphTool(memory),
  }

  // --- Create the Delegator ---
  const delegator = new Delegator(memory)

  // --- Public bridge API ---
  const dispatch = (event, payload) => delegator.dispatch(event, payload)

  return {
    memory,
    tools,
    delegator,
    dispatch,
    getResumableRun: getResumableRunFn
  }
}
