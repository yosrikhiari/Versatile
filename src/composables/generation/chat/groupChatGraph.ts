import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web'
import {
  pickSpeakers,
  type ChatEnergy,
  type DirectorPick,
  type DirectorProfile
} from '../../useGroupChatDirector'
import type { SessionBudget } from '../../../services/aiProviderBudget'

/**
 * One group-chat turn as a tiny LangGraph graph: director → speaker →
 * speaker … → END. It mirrors the house pattern
 * (`generation/writing/graphStrategy.ts`): `Annotation.Root` channels,
 * named nodes, a conditional edge, compiled without a checkpointer because
 * turn state is transient — the Pinia store stays the source of truth (D3).
 *
 * The module is lazy-loaded (`await import(...)`) from `useCharacterChat`
 * so solo chat never pays for the `vendor-langgraph` chunk (F5). All
 * store/streaming work happens in the injected `respond`, which the graph
 * calls once per speaker in order; a throw leaves earlier replies in place.
 */

type SpeakerId = string | number

const TurnState = Annotation.Root({
  /** Speaker ids still to voice, in order. */
  queue: Annotation<SpeakerId[], SpeakerId[]>({
    reducer: (_prev, next) => next,
    default: () => []
  }),
  /** Speaker ids already voiced, in order. */
  spoken: Annotation<SpeakerId[], SpeakerId[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => []
  }),
  surprise: Annotation<boolean, boolean>({
    reducer: (_prev, next) => next,
    default: () => false
  })
})

type TurnStateType = typeof TurnState.State

export interface RunGroupTurnArgs {
  profiles: DirectorProfile[]
  transcript: string
  energy: ChatEnergy | string
  lastSpeakerId: SpeakerId | null
  sessionBudget: SessionBudget | null
  /** Voice one speaker (store write + stream + cleanup). Resolves to the reply id. */
  respond: (speakerId: SpeakerId) => Promise<string | null>
  /** Injectable for tests; defaults to the real director. */
  pick?: (args: {
    transcript: string
    profiles: DirectorProfile[]
    energy: ChatEnergy | string
    lastSpeakerId: SpeakerId | null
    sessionBudget: SessionBudget | null
  }) => Promise<DirectorPick>
}

export interface GroupTurnResult {
  speakers: SpeakerId[]
  surprise: boolean
}

export async function runGroupTurn(args: RunGroupTurnArgs): Promise<GroupTurnResult> {
  const pick = args.pick ?? pickSpeakers
  const compiled = new StateGraph(TurnState)
    .addNode('direct', async () => {
      const decision = await pick({
        transcript: args.transcript,
        profiles: args.profiles,
        energy: args.energy,
        lastSpeakerId: args.lastSpeakerId,
        sessionBudget: args.sessionBudget
      })
      return { queue: decision.speakers, surprise: decision.surprise }
    })
    .addNode('speak', async (state: TurnStateType) => {
      const [current, ...rest] = state.queue
      if (current === undefined) return { queue: [] as SpeakerId[] }
      await args.respond(current)
      return { queue: rest, spoken: [current] }
    })
    .addEdge(START, 'direct')
    .addEdge('direct', 'speak')
    .addConditionalEdges('speak', (state: TurnStateType) => (state.queue.length ? 'speak' : END), [
      'speak',
      END
    ])
    .compile()
  const final = await compiled.invoke({ queue: [], surprise: false }, { recursionLimit: 10 })
  return { speakers: final.spoken, surprise: final.surprise }
}
