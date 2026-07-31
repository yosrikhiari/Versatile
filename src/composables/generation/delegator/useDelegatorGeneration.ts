import { createAgentMemory } from './AgentMemory'
import { Delegator } from './Delegator'
import { SessionBudget } from '../../../services/aiProviderBudget'
import { useStoryBibleStore } from '../../../stores/storyBibleStore'
import { useManuscriptStore } from '../../../stores/manuscriptStore'
import { useVolumeStore } from '../../../stores/volumeStore'
import { useStoryGraphStore } from '../../../stores/storyGraphStore'
import { useStoryDirector } from '../../useStoryDirector'
import { useStoryWriter } from '../../useStoryWriter'
import { useStoryCritic } from '../../useStoryCritic'
import { useChapterGenerationSync } from '../../useChapterGenerationSync'
import { useEntityBootstrapper } from '../../useEntityBootstrapper'
import { useStoryDocuments } from '../../useStoryDocuments'
import { useActivityLog } from '../../useActivityLog'
import { buildPreliminaryEdges } from '../graph'
import { getResumableRun as getResumableRunFn } from '../checkpoint'
import {
  createDirectorTool,
  createWriterTool,
  createCriticTool,
  createSyncTool,
  createCommitTool,
  createConsistencyTool,
  createSceneTool,
  createGraphTool
} from './tools'

export function useDelegatorGeneration() {
  const memory = createAgentMemory()

  // --- Wire Pinia stores ---
  memory.instances.storyBibleStore = useStoryBibleStore()
  memory.instances.manuscriptStore = useManuscriptStore()
  memory.instances.volumeStore = useVolumeStore()
  memory.instances.storyGraphStore = useStoryGraphStore()

  // --- Wire Vue composable service instances ---
  memory.instances.bootstrapper = useEntityBootstrapper()
  memory.instances.storyDocuments = useStoryDocuments()

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
    addEntry(type: any, data: any) {
      const tid = memory.currentTaskId?.value
      if (tid) {
        _actLog.appendThought(tid, type, JSON.stringify(data ?? {}))
      }
    }
  }

  // --- Service class instances are injected externally (from useVolumeStoryGenerator)
  //     and wired into memory.instances.*Service before dispatch() is called.

  // --- Create narrow agent tool wrappers ---
  const tools = {
    director: createDirectorTool(memory),
    writer: createWriterTool(memory),
    critic: createCriticTool(memory),
    sync: createSyncTool(memory),
    commit: createCommitTool(memory),
    consistency: createConsistencyTool(memory),
    scene: createSceneTool(memory),
    graph: createGraphTool(memory)
  }

  // --- Wire SessionBudget into composable instances ---
  const _budget = new SessionBudget()
  memory.instances.sessionBudget = _budget
  memory.instances.director.sessionBudget = _budget
  memory.instances.writer.sessionBudget = _budget
  memory.instances.critic.sessionBudget = _budget

  // --- Create the Delegator ---
  const delegator = new Delegator(memory)

  // --- Public bridge API ---
  const dispatch = (event: any, payload: any) => delegator.dispatch(event, payload)
  const canDispatch = (event: any) => delegator.canDispatch(event)
  const restorePhase = (phase: any, reason?: any) => delegator.restore(phase, reason)

  const initializeToolInstances = (toolInstances: any) => {
    Object.assign(memory.instances, toolInstances)
  }

  return {
    memory,
    tools,
    delegator,
    dispatch,
    canDispatch,
    restorePhase,
    getResumableRun: getResumableRunFn,
    initializeToolInstances
  }
}
