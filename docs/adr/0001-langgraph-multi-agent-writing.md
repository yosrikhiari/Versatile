# ADR-0001 — The writing stage as a LangGraph multi-agent graph

**Status:** accepted, 2026-09-18. **Scope:** `composables/generation/writing/graphStrategy.ts`,
`useStoryEditor.ts`, `config/roles.ts`, `graph/dexieSaver.ts`, schema v54.

## Context

Versatile's generation pipeline has three LLM roles — Director (plans), Writer (drafts prose),
Critic (judges a draft) — orchestrated by code: the Delegator's `ROUTING_TABLE` and the fixed
phase order in `useVolumeStoryGenerator`. That is a workflow, not an agent system: no model
ever chooses the next step. It also forced all three roles onto one model, because the
sequential per-scene chain (write → critique → maybe rewrite) on an 8 GB GPU cannot afford a
model swap on every call.

Two facts were measured on the reference machine (RTX 4060 Laptop, 8 GB, Ollama 0.34):

- `qwen3:8b` takes 5.6–7 GB at the context sizes the Writer needs. Loading any second model on
  the GPU **evicts** it; each switch costs 12–18 s. Alternating Writer and Critic across two GPU
  models would spend more time loading than generating.
- A 3B model with `num_gpu: 0` runs on the CPU at ~11 tok/s (16 threads) while the GPU model
  stays resident, and both generate concurrently.

We wanted (a) the Critic to be a different model from the Writer — the judge should not be the
author (self-enhancement bias) — and (b) a model-made control decision somewhere in the loop,
so that "multi-agent" is true by the usual test: a model makes a control-flow decision.

## Decision

1. **Role placement table** (`config/roles.ts`): each role names a model and a device. The one
   hard rule: at most one distinct GPU model per run. Roles that share the GPU share its model
   and never swap; roles that must differ go to the CPU device. `aiService` resolves the model,
   the Ollama options (`num_gpu`, `keep_alive`, `num_ctx`) and the **semaphore lane**
   (`ollama:gpu` / `ollama:cpu`) from it; `providerGate` runs one generation per lane.
2. **LangGraph.js** (`@langchain/langgraph/web`, verified to run in the browser) runs the
   writing stage as a graph: `decide → Send(draft | critique | commit) → decide`. Nodes in one
   superstep run concurrently, so the Writer drafts scene N+1 while the Critic judges scene N.
   Model calls stay in our `aiService`; LangGraph owns state, edges, and checkpoints only.
3. **The Editor** (`useStoryEditor.ts`) decides each superstep. `legalMoves()` is the fence —
   the set of actions the state allows. `workflow` mode picks the first (the legacy order);
   `agentic` mode asks a small model to pick among them, validates, and falls back to the
   workflow choice on anything else. Every decision is logged (`agentDecisions`).
   *Update 2026-09-26 (`editor-v3`, analysis §35):* the model now answers one `plan` enum
   of the legal (GPU, CPU) pairs, so it cannot name an illegal move (legal answers 24/24 on
   the probe, from 7/24).
4. **Gate rules are not duplicated.** `sceneGate` now exposes `draftAttempt`,
   `critiqueAttempt`, `markGateOutcome` (and, since 2026-09-25, `repairAttempt`, analysis
   §26, which the graph runs inside the critique node); the legacy `writeSceneWithGate` is
   composed of them and the graph calls them as nodes.
5. **Checkpoints in Dexie** (`DexieSaver`, a `MemorySaver` persisted per thread), so a killed
   tab resumes at the last completed superstep.
6. **Default stays `legacy`** until the graph path has a real-model run behind it
   (`settings.orchestrator`).
   *Status 2026-10-04:* three real runs on 2026-09-18 proved the graph (two lanes, zero
   evictions, 6.6 min for 2 scenes; analysis §9), but the default is still `legacy`: the
   3B CPU Critic failed 2/2 scenes in every run, and runs C and D of the A/B are still owed
   (§10 found they first need a gate calibrated against hand-labelled scenes).

## Observability

Every call the graph makes can be traced end to end through the AgentOps
gateway (`config/agentops.ts`, off by default). The graph sets
`traceContext` to `<run>/<step>` before each superstep; the Ollama provider,
when tracing is on, posts to the gateway instead of Ollama with the role
(`X-Agent-Role`) and the ref `<run>/<step>/<role>` (`X-Client-Ref`) as headers and reports the returned trace id to the orchestration
store. The gateway (v1.1, its ADR-0009) forwards the placement and sampling
values and records them on its spans — never the prompt — so a run can be
read as a set of traces grouped by agent role, and a decision in
`agentDecisions` can be joined to the exact gateway trace of the call that
produced it.

## Consequences

- A different-model Critic is possible on 8 GB with zero swaps, and the critique's wall-clock
  cost mostly disappears behind the next draft.
- The agentic mode is bounded by construction: the model chooses among legal moves and can
  never invent a phase. A stalled or illegal answer costs one fallback, not a broken run.
- Two orchestrators exist for the same stage. The gate primitives keep "what passes" in one
  place; the commit path is intentionally mirrored (`commitNode` ↔ `parallelStrategy`'s
  `generateAnchor`/`commitSceneResult`) and should be folded into one helper once the graph
  path is the default.
- A dependency with a moving 1.x API (`@langchain/langgraph` `^1.4.15`, locked at 1.4.15 by
  `package-lock.json`) and a reducer-based state model to learn.
- The Critic's quality on a 3B model is unproven: the A/B in `docs/GENERATION-PIPELINE-ANALYSIS.md`
  §9 is the gate for making the preset the default.
