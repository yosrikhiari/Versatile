# Generation Pipeline — Behavioural Analysis

`PIPELINE_ANALYSIS.md` and `CONSISTENCY_LEDGER.md` describe what the pipeline is *for*. This
document is about how it *behaves*: what one scene costs, where the calls go, what the quality
gates can and cannot see, and where the code is fragile. Everything below was read from the
code as it runs today, with file:line references.

## 1. Shape

```
StoryGeneratorPanel (2,268 lines, now 932) ── Ideate │ Scene │ Chapter │ Arc │ Blurb
        │                                          │          │
        │                        useChapterStoryGenerator ──┐  │
        │                                                   ▼  ▼
        └────────────────────────────────► useVolumeStoryGenerator (4,006 lines, now 2,795)
                                              │
      ┌───────────┬───────────┬───────────────┼─────────────┬──────────────┬──────────────┐
   Delegator   Director     Writer          Critic      CommitService  Consistency   chapterGate
 (phase FSM)  (plan)      (prose+meta)    (score/audit)  (persist)     (audit/fix)   (deterministic)
```

One run = pre-run snapshot → volume → **Bible** (entity bootstrap) → **Network** (relationships)
→ **Plan** (director, chunked) → *plan-preview pause* → **Prose** (per scene: write → gate →
commit → digest) → chapter-boundary consistency → **Terminal audit** (+ fix rounds) → chapter gate
→ complete. Every phase transition goes through the Delegator; checkpoints are written per scene;
a heartbeat watchdog beats on every streamed token.

## 2. What one scene costs

Auto mode, 1,200-word scene (~7,200 chars), local Ollama (one request in flight at a time —
`providerGate.ts:58`):

| Step | Calls | Where |
|---|---|---|
| Prose (streamed) | 1 | `useStoryWriter.ts:1025` |
| Extension passes if short (< 85% of target) | 0–2 | `useStoryWriter.ts:315`, `MAX_EXTENSION_PASSES = 2` |
| Metadata extraction, 6,000-char chunks | ⌈chars/6000⌉ = **2** | `useStoryWriter.ts:525` |
| Critic | 1 | `useVolumeStoryGenerator.ts:1573` |
| **Per attempt** | **4–6** | |
| Retry on failed gate (`SCENE_MAX_ATTEMPTS = 2`) | ×2 | `:145` |
| **Worst case per scene** | **8–12** | budget assumes 8, hard cap ×3 (`aiProviderBudget.ts:309`) |

At the documented ~5 tok/s, a scene is 4–6 serial model calls of 30 s–4 min each. The budget
math is sane; the cost is inherent to running locally.

**Per chapter boundary** (auto mode, `ConsistencyService.ts:140`): one contradiction call per
character and per location that appears in ≥ 2 scenes, batched 3 wide but serialised by the
Ollama gate. A 30-character / 15-location bible ⇒ **up to 45 calls at every chapter end**, and
again at the terminal audit, then up to 3 fix rounds each of (rewrites + a full 45-call recheck).
This is the dominant cost centre at scale and it is *not* the per-scene work.

**Planning** is bounded and concurrent (`useStoryDirector.ts:1080`): ⌈N/12⌉ skeleton calls +
one scene-plan call per chapter — 109 calls before any prose for a 100-chapter book.

## 3. Findings

### Quality gates that cannot see what they judge

| # | Finding | Where | Effect |
|---|---------|-------|--------|
| **G1** ✅ | **The critic never received the chapter log.** Every `critic.evaluateScene` call site passes `chapterLog: ''`, so the critic prompt reads "(First scene)" for every scene. The critic has the field and a "CHAPTER LOG (previous events)" section built for it (`useStoryCritic.ts:64`). | `useVolumeStoryGenerator.ts:1577, 1976, 2166, 2484` | The inline gate cannot catch a continuity break; those are only found later by the 45-call audit and fixed by rewriting — the most expensive path in the run. `writeSceneWithGate` already holds `chapterLog`; it is simply not forwarded. |
| **G2** ✅ | **Speculative prefetch wrote scene *i+1* without scene *i*.** In review mode `prefetchNextScene(i+1)` fires at `SCENE_WRITTEN`, before `approveScene` commits scene *i* into `writtenScenes`; the prefetch builds its chapter log from `writtenScenes` only. | `useVolumeStoryGenerator.ts:2429`, `:2227`, `SceneInteractionService.ts:110` | The one mode where the writer is reviewing each scene is the mode where the next scene is drafted blind to the previous one. `currentSceneResult` (summary + structured) is available and should be appended to the log. |
| **G3** ✅ | Anchor (and middle) scenes were critiqued twice in the parallel path: once inside `writeSceneWithGate` (auto mode) and again in "Evaluating chapter anchors" when inline eval is on, discarding `chosenEval`. | `:1841` vs `:1963` | +2 critic calls per chapter, and the second verdict overwrites the one the gate acted on. Middle scenes correctly skip re-evaluation (`:2159`). |

### Cost and latency

| # | Finding | Where | Note |
|---|---------|-------|------|
| **C1** ✅ | The consistency audit fanned out one LLM call per entity, per chapter boundary, even though the deterministic digest/entity-state layer (v44–v47) was built precisely to make this O(dirty). Digests feed *context* (`rollupProjectDigests`) but not the audit's *scope*. | `ConsistencyService.ts:140-176`, `useStoryCritic.ts:396` | Cheapest big win: audit only entities whose `entityStates` changed since the last audit (the table is keyed `[projectId+entityType+entityId]` already), and skip the boundary audit entirely when the deterministic rules found nothing. |
| **C2** ✅ | Fix rounds re-ran the *entire* audit after each round (`:239`) instead of rechecking only the entities that had findings. | `ConsistencyService.ts:226-245` | Up to 3× the full fan-out. |
| **C3** | Extension passes re-send the full `userPrompt` plus a 2,000-char tail; metadata extraction re-sends the known-entity context per 6,000-char chunk. | `useStoryWriter.ts:337`, `:536` | Fine at 1,200 words; at 3,000-word scenes it is 3 metadata calls + 2 extension calls per attempt. Not a defect, a scaling note. |

### Reliability and maintainability

| # | Finding | Where | Note |
|---|---------|-------|------|
| **M1** ✅ | **The run itself had no end-to-end test.** The 75 tests in `useVolumeStoryGenerator.test.js` cover extracted helpers (`buildFactLedger`, `parallelWithLimit`, conflict resolution…). `useChapterStoryGenerator.test.js` runs a *fake* volume generator. Nothing drives `startGeneration → confirmPlan → writeOneBatch → completeGeneration` with a mocked writer/critic. | `src/tests/unit/` | G1–G3 above are exactly the class of bug such a test would have caught (assert what the critic was called with; assert the prefetch prompt contains the previous scene). |
| **M2** ✅ | `useVolumeStoryGenerator.ts` was 4,006 lines holding two independent write strategies (`writeOneBatch` sequential, `runParallelGeneration` anchor/wave), continuation (`continueDrafting`, `extendStory`, `expandScene`), resume, repair and the phase glue. The services extracted so far (Commit, Consistency, Interaction, Delegator) are the right direction; the two write strategies are the next seam. | — | Each strategy re-implements eval bookkeeping (`evalStore.addResult` + `persistCritiqueEval` + `promptAdjuster.updateAdjustments` appears 4 times). |
| **M3** ✅ | `StoryGeneratorPanel.vue` carried two near-identical run UIs — the Chapter tab (`:192-674`) and the Arc/Scene tab (`:675-1160`) — each with idle / error / plan-preview / writing / paused / sync-preview / consistency / complete blocks. | `StoryGeneratorPanel.vue` | ~480 lines duplicated by structure; `GenerationStages`, `VolumePlanPreview`, `GenerationSyncPreview` etc. are already components, so the remaining duplication is the wrapper. A single `<GenerationRun :generator>` would halve the file. |
| **M4** | Failures inside the run are handled at four levels (writer guards → gate loop → `noteSceneOutcome` streak → `runHealth` budget → `haltRun`), each with its own counters (`runFailedScenes`, `runConsecutiveFailures`, `consecutiveWriteFailures`, `runHealth`). | `:1751-1800`, `:2444-2475` | Correct but hard to reason about; the counters can disagree (`runConsecutiveFailures` counts critique failures, `consecutiveWriteFailures` counts empty prose). |

### UX of the run

- Two levels of mode before anything happens (tab, then "Prompt type" chips on Ideate) — noted in
  the UX audit.
- The plan-preview pause is the right gate; the sync-preview pause (entity acceptance) is a second
  interruption mid-run that auto mode skips but review mode does not explain.
- `describeRunFailure` is good: every failure names how many scenes were written and that they are
  saved. The chapter gate's "blocking never discards prose" is the correct contract.

## 4. What is done well

- Phase machine with a no-bypass invariant (`delegatorNoBypass.test.js`), per-scene checkpoints,
  and a resume path.
- Heartbeat watchdog on streamed tokens instead of a fixed timeout.
- Session budget sized from the requested structure with a runaway ceiling, not a fixed cap.
- Writer guards (refusal, repetition, empty prose) that *reject* rather than commit.
- Scene-scoped entity blobs (`buildSceneEntitiesBlob`) instead of the whole bible per prompt.
- Chunked metadata extraction instead of truncation.
- Deterministic contradiction rules and the digest hierarchy (v44–v47) — built, tested, and
  ready to take load off the LLM audit (C1).
- Planning is concurrent and batched.

## 5. Recommended order

1. **G1** — forward `chapterLog` to the critic (four call sites; one line each). Add the
   end-to-end run test (M1) in the same change so the assertion exists.
2. **G2** — include the pending reviewed scene in the prefetch's chapter log.
3. **G3** — reuse `chosenEval` for anchors instead of re-critiquing.
4. **C1/C2** — scope the audit to changed entities and recheck only flagged ones. This is the
   only item that changes the run's *time* materially at scale.
5. **M3** — collapse the two run UIs into one component.
6. **M2** — split the two write strategies out of the orchestrator when next touched.

## 6. What shipped (second pass)

| Item | Change | Where |
|---|---|---|
| G1 | `chapterLogBefore(sceneIndex, pending?)` builds the log from written scenes and, for scenes not yet written (the parallel path's closing anchor), from the plan's beat marked "planned, not yet written". Every critic call, the anchor writer call, the repair rewrite and the drift check now receive it. | `generation/writing/sceneGate.ts` |
| G2 | The review-mode prefetch passes `currentSceneResult` as the pending scene, so scene *i+1* is drafted knowing scene *i*. | `generation/writing/batchStrategy.ts` |
| G3 | The gate's verdict is kept on the written record (`gateEval`) and reused by the anchor/middle evaluation passes instead of a second critic call. | `generation/writing/parallelStrategy.ts` |
| C1 | Chapter-boundary audits scope to entities the new chapter's scenes touch (`scopeEntitiesToScenes`); scenes without cast metadata fall back to the full audit. | `ConsistencyService.ts` |
| C2 | Fix rounds recheck only flagged entities plus whatever the rewritten scenes touch (`entitiesToRecheck`). | `ConsistencyService.ts` |
| M1 | `volumeGeneratorRun.test.js`: the real orchestrator, real stores and Dexie, only the model faked by `schemaName`. Asserts the critic's prompt carries the chapter log, the writer's brief carries prior scenes, and each scene is critiqued once. | `src/tests/unit/` |
| M2 | Scene gate, parallel strategy and batch strategy extracted verbatim into `generation/writing/{sceneGate,parallelStrategy,batchStrategy}.ts` with explicit context interfaces; the orchestrator is 2,795 lines. Per-scene failures in the parallel path now log their reason (they were swallowed into a result object). | `generation/writing/` |
| M3 | `useGenerationRunController` (state + handlers per pipeline) and `GenerationRunView` (the shared phases) replace the two copies; the panel is 932 lines after the 2026-09-14 panel pass. | `composables/generation/`, `components/story/` |

M4 (the four failure counters) — done 2026-09-15: `critique_failed` / `write_failed` ledger kinds with `streak()` / `failedScenes()`; the two consecutive counters are gone.

## 7. What shipped (third pass — running the book)

Driving a real 10-chapter run end to end exposed three things the unit tests could not.

| Item | Change | Where |
|---|---|---|
| Ollama rejected every skeleton call | `repeat_last_n: -1` is not accepted by the server (HTTP 400), so the director's skeleton batch never succeeded and every plan came from the degraded path — the root cause of the repetitive outlines seen in earlier runs. `-1` now resolves to `num_ctx`. | `providers/ollama.ts` |
| Gate failures dropped the scene | After `SCENE_MAX_ATTEMPTS` the gate threw and both strategies treated the scene as failed: no prose, an empty subsection, later scenes drafted against the hole. With the critic floor at 7 per dimension and measured real prose averaging below that, a one-click run lost 10 of its first 15 scenes. The best attempt is now committed with `contentStatus: 'review'`, recorded as `gate_failed` in the health ledger (so the degraded-rate invariant still reports it), and flagged in the chapter list. | `writing/sceneGate.ts`, `parallelStrategy.ts`, `batchStrategy.ts`, `CommitService.ts`, `ChapterManager.vue` |
| Running headless | A browser-driven run dies on any Vite full reload. `vitest.live.config.js` + `src/tests/live/saltRoad.live.js` run the real pipeline against local Ollama under fake-indexeddb, stream progress to `reports/live/<slug>/progress.log`, dump the outline as soon as it exists and the finished book as `book.md`. `LIVE_MODEL` picks the prose model; the utility model stays qwen3:8b. | `vitest.live.config.js`, `src/tests/live/` |
| Model pin was stale | `VersatileGenerate.configureModels()` wrote the legacy `OLLAMA_MODEL` key, which nothing reads; the prose model lives in the settings blob. Demo projects are also stamped with the signed-in owner, or they never appear in the workspace list. | `generateDemoStory.ts` |
| Project premise never reached the generator | `createProject` stored the description as `synopsis`, which nothing read back; onboarding's premise and workspace type were silently lost on reload. Stored as `description` / `category` now, with a `synopsis` fallback for older rows. | `db-projects.ts`, `projectStore.ts`, `exportService.ts` |

### Measured on the default models (run of 2026-09-14)

Full 10 × 3 × 2,400 run on the shipped defaults (prose `dolphin-mistral:7b`, utility
`qwen3:8b`), headless:

- Planning 12 min, prose 45 min, 28,617 words, every scene committed.
- **30 of 30 scenes fell below the critic floor** (`show_tell` 6 on 25, `pacing` 4–5 on 5).
  The floor (`minDimensionScore: 7`) was calibrated on the qwen3:8b critic; with the
  default prose model the critic also runs on dolphin, and its show/tell score sits at 6
  for essentially all of that writer's output. The gate cannot pass, so every retry is
  spent for nothing and the run used to end in `error` with the book fully written.
- The prose itself reads as told-not-shown summary ("a vortex of despair", "made of
  tougher stuff") — the critic is right.

The same premise with `LIVE_MODEL=qwen3:8b` (one chapter): all three scenes pass the gate
first time, and the prose opens mid-action with concrete detail and subtext. The 10-chapter
example under `reports/live/the-salt-road/` was generated this way.

**Decision for the maintainer (taken in §8):** at the time of this pass `config/ollama.ts`
kept dolphin as the prose default because it is uncensored for adult dark fantasy. On this
hardware that choice cost most of the prose quality *and* made the quality gate unpassable.
The critic that produced these numbers turned out to be broken for qwen (§8), so the
decision waited for a re-measure; see §8 "Default prose model" for the outcome.

Two more fixes landed from the same run:

| Item | Change | Where |
|---|---|---|
| Progression contract was dropped | `validatedChapters` re-shaped every chapter and lost `events`, `revealed`, `stateAfter`, `storyFunction`, `partOf`. The spine, the writer's brief and the plan preview never saw them — which is why chapter 5 planned "finds the dead man" three times. Carried through now; the spine prompt lists the chapter's events and the fallback entry uses them as key facts. | `useStoryDirector.ts`, `context/spine.ts` |
| Quality floor ended a finished run in `error` | Both strategies now record the breach as a `gate_failed` health event (parallel: fail ratio ≥ 50 %; sequential: 3 in a row) and continue to completion; every scene is on disk either way. | `writing/parallelStrategy.ts`, `writing/batchStrategy.ts` |
| Skeleton events could be interior | The skeleton prompt now refuses "reflects / gathers strength / decides" as events and demands a named counterpart, object or place per event. | `useStoryDirector.ts` |

### The example (run 5, qwen3:8b prose)

`docs/examples/the-salt-road.md` — 10 chapters, 30 scenes, 28,457 words, 62 minutes end to
end, `phase=complete`, zero gate failures, one warning (`bible_static`). Chapter 1 opens
mid-action with a concrete object (the folded letter), dialogue carries subtext, tension
and pacing follow the brief. It reads as a first draft a novelist could revise, which is the
honest ceiling of an 8B model; the outline is coherent but generic in places (chapters 5
and 8 are thin).

What the run still taught, and what changed after it:

| Finding | Change |
|---|---|
| The scene planner named the unnamed antagonist "Ahmed"; the writer had already used Ahmed for the son. | Writer canon block: bible names are the only names; everyone else is a role; a canon name is never reused. |
| Chapters with interior events ("gazes at the stars / packs supplies / sets off") survive the skeleton. | `findInteriorChapters` + a shared `replanChapter` (also used for duplicate goals); the fix schema now carries `events`, so a replanned chapter does not keep the old ones. |
| A re-planned duplicate chapter kept its old events. | Same fix. |

## 8. What shipped (fourth pass — reading the book)

Run 5 completed with one warning, `bible_static`, and thirty identical critic
verdicts. Both were real, and both had been invisible to every test.

| Finding | Mechanism | Change |
|---|---|---|
| **No entity or edge was ever written by a one-click run.** | Two defects stacked. `confirmPlan` always runs `parallelStrategy`, which never called `discoverSync`/`commitSync` — the batch strategy (resume and review only) was the only caller. And `commitSync` threw before writing anything: `graphStore.nodeInstances.value` on a Pinia-unwrapped `ref` is `undefined`, so its pre-commit snapshot did `JSON.parse("undefined")`; the catch logged it and the run went on. This is the mechanism behind `DERIVED-SURFACES-AUDIT` (prose + embeddings only). | `generation/writing/bibleSync.ts`: after a chapter's scenes land, one `discoverSync` per scene, one `commitSync` per chapter — entities as `generated`, edges stamped with the chapter, `structuredResults` populated for the terminal audit. `commitSync` returns `{ entitiesCreated, edgesWritten }` so `bibleChangesCommitted` counts commits. `volumeGeneratorRun.test.js` asserts a discovered character, location and edge reach Dexie. |
| **The critic's 7 was a default, not a judgement.** | `CRITIC_SCHEMA` had no `required`. Under Ollama's grammar-constrained decoding qwen3:8b answered `{ "pass": true, "strengths": [...] }` — no score, no dimensions, no issues — on every scene, and `useStoryCritic` did `parsed.score ?? 7`. `deriveVerdict` then "passed on self-reported score (no dimension scores available)". Run 5's "zero gate failures" was the gate passing itself. | Schema built per workspace: every field required, `dimensionScores` names its keys, `score` first in emission order. No fabricated score (derived from dimensions when the overall is missing); a verdict-less answer is retried once with a pointed reminder, then returned as `evalUnavailable`, which the gate already counts (`eval_unavailable`, abort budget 5). `src/tests/live/criticProbe.live.js` reproduces it against the real model: before, `{pass, strengths}` ×3; after, score 8 / show_tell 7 / one minor issue ×3. |
| `bible_static` conflated two failures | After the fix, a 1-chapter live run whose four characters all came from the bootstrapper synced every scene, added nothing, and still tripped "check that entity sync is reaching the bible". | `InvariantFacts.scenesSynced`: `bible_static` fires only when metadata exists and no scene went through sync; `bible_quiet` warns when ≥ 9 synced scenes added nothing. Two live 1-chapter runs: `synced=3`, no violations; the second had `bibleChanges=0` and is now silent. |
| Harness reported the wrong scene | `writtenScenes` is a slot array filled out of order; "last non-empty slot" was the book's final scene for the whole second phase. | Report newly filled slots; `health.json` lists the committed bible. |

Consequences worth stating plainly:

- The run-5 quality numbers in §7 — "30 of 30 dolphin scenes below the floor", "all three qwen scenes pass first time" — were produced by a critic that, at least for qwen, was not scoring. The dolphin verdicts came through with dimension scores (show_tell 6), so that comparison may hold; the qwen "pass first time" did not mean what it said. Re-measure before deciding the default model.
- A one-click run will now grow the bible by whatever the writer reports, without a review pause. Entities arrive as `generated` and can be approved or deleted in the Story Bible. Whether the parallel path needs the batch path's sync-preview pause is an open product question (`planning/README.md`).
- Expect gate failures on the next run. A scene that fails after retries is kept for review (§7); a run with several is the gate working.

### Default prose model — decided

Re-measured with the repaired critic, same premise, same machine:

| Prose model | Run | Scenes | Passed the gate | Failed | Scores (overall / weakest dimension) | Invariants |
|---|---|---|---|---|---|---|
| `qwen3:8b` | run 6, 10 × 3 × 2,400 | 30 | 29 | 1 | dimension scores present on every verdict | none; `bibleChanges=10`, `synced=30` |
| `qwen3:8b` | 1-chapter check (same premise as the dolphin row) | 3 | 3 | 0 | 8 / show_tell 7 · 8 / emotional_goal 7 · 8 / show_tell 7 | none |
| `dolphin-mistral:7b` | 1-chapter check | 3 | 0 | 3 | 7.5 / voice 6 · 8 / show_tell 5 · verdict unavailable | `degraded_rate` |

Both 1-chapter checks are `reports/live/model-check-<model>/health.json`, run back to back on
the same day with the same seed premise.

The §7 comparison holds now that both sides are scored by a critic that emits dimensions:
dolphin's prose sits below the floor on voice or show/tell on every scene, and one verdict
did not come back at all. `config/ollama.ts` therefore ships `DEFAULT_MODEL = 'qwen3:8b'`
for prose (the utility default was already qwen3), and exports dolphin as
`UNCENSORED_MODEL` — an explicit opt-in in Settings → AI for content qwen3 refuses to write
plainly, with the settings hint saying it will fail the gate more often. The two settings
have independent defaults: switching prose to dolphin no longer drags planning, metadata
and the critic along with it (`ollamaConfig.test.js`). The gate floor stays at 7; it is not
recalibrated per model, because the point of the floor is that dolphin's prose *is* weaker.


## 9. Multi-agent on LangGraph (fifth pass — 2026-09-18)

**What changed.** The writing stage has a second orchestrator
(`writing/graphStrategy.ts`, ADR-0001): a LangGraph graph where the Writer and the
Critic are separate nodes on separate device lanes, and an Editor decides each
superstep. The measured constraint that shaped it: on the 8 GB reference GPU a
second GPU model evicts the first (12–18 s per switch), while a 3B model with
`num_gpu: 0` runs on the CPU at ~11 tok/s concurrently with the GPU model.

**What it buys.** (1) A Critic that is not the Writer — `qwen2.5:3b-instruct` on
the CPU by preset — so the judge is not the author. (2) The critique's wall-clock
cost overlaps the next draft instead of queueing behind it; with lookahead 2 the
Writer is never idle waiting for a verdict. (3) A model-made control decision
(agentic mode) that passes the "is it agentic" test: it chooses whether to
revise, what to revise with which instruction, whether to accept a near-miss,
and when to stop — inside the fence of legal moves.

**The A/B to run before the preset becomes the default** (same premise,
*the-salt-road*, same seed settings):

| Run | Orchestrator | Writer | Critic | Editor | Measure |
|---|---|---|---|---|---|
| A | legacy | qwen3:8b | qwen3:8b | — | baseline: 29/30 gate passes, 62 min |
| B | langgraph / workflow | qwen3:8b | qwen3:8b | pure function | isolates the graph (should match A) |
| C | langgraph / workflow | qwen3:8b | qwen2.5:3b (CPU) | pure function | the different-family critic |
| D | langgraph / agentic | qwen3:8b | qwen2.5:3b (CPU) | qwen2.5:3b (CPU) | the agent |

For each: gate pass rate, wall time, tokens per role, swap count (must be 0),
`agentDecisions` — model vs fallback counts — and a blind read of six scenes.
Before C: run the small critic over the 30 existing salt-road scenes and compare
its ranking with the recorded 8B verdicts; if they do not agree at all, the
CPU critic goes back to the drawing board (a larger CPU model, or the 8B critic
in a batched pass) before the pipeline is rebuilt around it.

**Known gaps.** `commitNode` mirrors `parallelStrategy`'s commit path rather than
sharing it (fold once the graph is the default); the graph does not do
anchor-first ordering (scenes are written in plan order, which the lookahead
makes continuity-friendly but loses the legacy path's cross-chapter
parallelism); resume by `threadId` exists in the API but has no UI yet.

**First real run (2026-09-18, `reports/live/the-graph-test/`).** 1 chapter × 2 scenes ×
500 words, `orchestrator=langgraph mode=agentic preset=multi-agent`, Writer `qwen3:8b` on the
GPU, Critic and Editor `qwen2.5:3b-instruct` on the CPU. 18.6 min end to end, `error=null`,
553 words, bible synced. What the log and Ollama's own log showed:

- The two lanes are real: `draft scene 2 · critique scene 1` and `draft scene 1 · critique
  scene 2` ran as single supersteps with both models resident (`ollama ps`: 8B 6.3 GB VRAM,
  3B 2.2 GB CPU).
- Both scenes failed the 3B critic's first verdict and were revised with its feedback; both
  committed for review (best scores 6 and one unparsable verdict) — `degraded_rate 2/2`. That
  is the CPU critic being weak or strict, not the graph: the exact question run C of the A/B
  above answers, and the reason the preset is not the default.
- **The embedder was the swap.** `snowflake-arctic-embed2` (1.1 GiB) is loaded on the GPU for
  the retrieval context before each draft; with the 8B at 16k context there is no room, so
  Ollama evicted the writer for the embedder and the embedder for the writer — about a
  minute per scene, and the legacy path pays it too. Fixed by placing the embedding role on
  the CPU by default (`config/roles.ts`, `embedding`).

**Second real run, traced (2026-09-18, `reports/live/the-traced-run-1/`).** Same shape at
1,000 words per scene, every model call routed through AgentOps v1.1 with the agent role
and `<run>/<step>/<role>` on the spans. **8.1 min** end to end (vs 18.6), 948 words,
`error=null`, synced 2 — the embedder fix is most of the difference. Three more things the
trace and the log showed:

- **Two more embedding paths were still on the GPU.** The provider's `generateEmbedding`
  honoured the placement, but `embeddingService.ts` (the bootstrap/planning retrieval) and
  `ollamaService.generateEmbedding` posted `/api/embed` directly with no `num_gpu` — Ollama's
  log still read *"predicted to exceed available memory, evicting"* for a 1.1 GiB model
  twice during planning. Both now spread the `embedding` placement. Writing-stage embeds
  loaded as a third runner without eviction (`loaded runners count=3`).
- **The writer's calls arrived at the gateway untagged.** 22 traces: `critic` ×4,
  `editor` ×2, `utility` ×6, and 10 with no role — every draft and top-up. `writeSceneStructured`
  (the path every strategy and the graph use) never passed `role: 'writer'`; only the older
  `writeScene` did. Fixed, with a regression test that asserts the role on the prose call
  and its top-up. Placement was unaffected (the writer inherits the GPU default), the
  *trace* was — which is exactly what a trace with roles is for.
- **The agentic Editor contributed nothing yet.** Of 7 decisions, 5 had one legal move per
  lane (no model call) and the 2 model answers were rejected — `commit` and `critique` with
  `target: null` — so the workflow order took over both times. The 3B did not hold the
  schema's `target` field; the fence and the fallback did their job, and the decision log
  says so. Run D of the A/B measures this; a 3B Editor may need a stricter schema
  (`target` required per action) or a larger CPU model.
- The 3B critic again failed 2/2 (score 6, `show_tell` 4): consistent with the first run.

**Third run (2026-09-18, `reports/live/the-traced-run/`), with both fixes.** **6.6 min**,
882 words, `error=null`, synced 2. 22 traces: `writer` ×4 (two drafts, two revises — now
tagged), `critic` ×4, `editor` ×2, `utility` ×6, 6 untagged (bootstrap calls that carry no
role by design). **Zero evictions from the run**: Ollama's log shows `loaded runners
count=3` (8B on the GPU, 3B and embedder on the CPU) from the first draft to the last
commit; the two evictions logged a minute later belong to `criticProbe.live.js`, which the
live config runs next in its own jsdom (tracing off, 8B reloaded at 16k) — not to this run.
Unchanged: the 3B critic failed 2/2 (scene 2 scored 7 overall but `show_tell` 5 under the
dimension floor), and both agentic Editor answers were rejected (`commit` with no target,
`critique #1` when #1 was not awaiting a verdict). The graph is proven; the 3B judge and
the 3B editor are the open questions, and they are runs C and D.

| Run | Scenes | Words | Wall | Embedder | Writer tagged | Editor model answers accepted |
|---|---|---|---|---|---|---|
| the-graph-test | 2 | 553 | 18.6 min | GPU, evicting the writer each scene | — (not traced) | 0 / 0 (workflow-only steps) |
| the-traced-run-1 | 2 | 948 | 8.1 min | provider on CPU; two stray paths still GPU | no — untagged | 0 / 2 |
| the-traced-run | 2 | 882 | 6.6 min | CPU everywhere, 0 evictions | yes | 0 / 2 |

## 10. What the critic actually sees (sixth pass — 2026-09-23)

§9 put one check in front of A/B run C: score the 30 committed salt-road scenes
with the small CPU critic and compare its ranking with the 8B's. Running it
answered a different question, because two of its premises turned out to be
false.

**The 8B verdicts were never recorded.** `health.json` keeps `failedScenes` and
`consistency`, not per-scene scores, so both critics were re-scored here through
the same `evaluateScene` path on identical inputs. Corpus, harness and analysis:
`reports/live/critic-rank-agreement/`, `src/tests/live/criticRankAgreement.live.js`,
`tools/critic-rank-agreement.py`.

**There was no ranking to agree with.** `qwen3:8b` scored **8/10 on all thirty
scenes**. Five distinct dimension vectors covered the set, fourteen scenes shared
one of them, `voice` was 9 on 29/30 and `emotional_goal` 10 on 29/30. The only
dimension that moved was `continuity`, and since `deriveVerdict` fails a scene on
its weakest dimension, continuity alone decided every pass and fail. The
five-dimension rubric was doing one dimension's work.

### Two defects, both invisible from outside

- **The critic read 74% of each scene.** `draft.slice(0, 4000)` against scenes of
  4,380–6,313 chars: all thirty truncated, 26% unseen on average, 37% at worst.
  The critic was judging prose that stopped mid-action and marking it down for
  it. All seven gate failures were `continuity: 6`.
- **The rubric was dead code.** Every dimension in `evalDimensions.ts` carries a
  1–10 anchor set and nothing outside that file ever read `.rubric`. The prompt
  asked for five numbers and named no scale, so the model returned a plausible
  constant.

Fixed: the critic gets the whole draft (24,000-char runaway guard, and when it
bites the prompt says so, because a cut ending is not a defect in the writing);
`formatDimensionRubrics` sends the 1/3/5/7/9/10 rungs (~600 tokens of an 8k
window). `computeSummary`'s fallback keeps the head *and* tail of a scene — that
path only runs when metadata extraction failed or was skipped, and it was not
observed firing in any run here.

### Before and after, same model, same thirty scenes

| | qwen3:8b before | qwen3:8b after | qwen2.5:3b before | qwen2.5:3b after |
|---|---|---|---|---|
| Passes the gate | 23/30 | **30/30** | 0/30 | 7/30 |
| Overall score | 8 on all 30 | 8 on all 30 | 4–6 | 5–7 |
| Distinct dimension vectors | 5 | 8 | — | — |
| Saw the whole scene | no | **30/30** | no | **30/30** |

**All seven gate failures were truncation artifacts.** With the full text the same
model on the same scenes never drops a dimension below 7. The anchors widened the
dimension spread (`voice` unpinned from 9-on-29 to a 7/8/9 spread) but did not
unpin the overall score.

### What this means for run C

Agreement between the two critics after the fix: raw 23.3%, **Cohen's kappa
0.000** — but that number is degenerate, because the 8B now passes everything and
there is nothing to agree about. The one real movement is `continuity` rank
agreement, **+0.011 → +0.428**: the earlier "the CPU critic agrees at chance"
reading was substantially an artifact of the broken prompt.

So the blocker on run C is not the CPU critic. It is that the 8B is a degenerate
judge — one score and one verdict for every scene, before and after — and runs
A–D all use gate pass rate as their primary measure. That measure is now provably
30/30 regardless of content. **Calibrate the gate against scenes labelled by hand
before spending four hours on A/B runs**, or every number inherits the flaw.

Caveat: the 3B's scenes ordering barely survived the prompt change (rho +0.172
against itself). That is suggestive of instability, not proof — the prompt did
genuinely change. A same-prompt test-retest has not been run.

### End-to-end (2026-09-23, `reports/live/the-long-scene-run/`)

1 chapter × 2 scenes × 2,400 words, legacy orchestrator, 12.9 min, `error=null`,
2,354 words, 2 synced, one continuity rewrite over two passes. Both scenes cleared
the old cap (6,653 and 6,857 chars) and the scene tail reached a model 2/2; 34
calls, largest prompt 12,417 chars. A 1,000-word run does **not** exercise this —
its scenes came in at ~2,600 chars, under the old cap.

`saltRoad.live.js` now writes `scenes.json` and `wire.json`: per-scene words,
chars, `overOldCriticCap`, the summary, `sceneTailReachedAModel`, and the prompt
sizes. A run could previously say only what came out of it, which is how a
four-thousand-character slice survived three live runs. AgentOps cannot fill this
gap — `PRIVACY.md` strips prompts from every read path on purpose — so the
capture is local to the run.

Three guards in `useStoryCritic.consistency.test.js` keep it from returning: the
prompt must carry a long scene's ending, must carry the anchors, and must say so
when a runaway draft really is cut. This is the third time this codebase shipped a
prompt that silently dropped the end of a scene (see `chunkProseForMetadata`),
which is why they are tests and not comments.

## 11. The continuity budget (seventh pass — 2026-09-23)

§10 measured what the critic saw. This measures what the *writer* sees of the
story so far, and the answer was: almost nothing, for a reason nobody had
re-examined.

**The numbers.** The writer runs at `num_ctx` 16,384. After the output reserve
(2,240) and scaffold (1,500) that leaves 12,644 tokens of budget. `sceneContext`
— the only block carrying what actually happened in prior scenes — was capped at
**350 tokens, 2.8% of the budget**, and sat at priority 10, last of six, so it
was also the first block dropped. The largest prompt a real run produced was
**3,104 tokens, 19% of the window**: roughly 9,500 tokens went unused while the
one irreplaceable block was rationed.

The cap was not a decision. It is `EMBEDDING_CONTEXT_MAX_CHARS = 1400` under an
old 4:1 character guess, converted to 350 tokens to "keep the same intent".

**The cap was tighter than it looked.** The preceding scene's ending rides
verbatim at 1,200 chars ≈ 344 tokens — which is the entire 350-token budget. The
`[Earlier related scenes]` block, `selectRelevantPriorScenes` and its scoring
therefore had room for exactly one line before the loop broke. Measured over the
30 committed salt-road scenes:

| Prior scenes | 350-token budget | 3,793-token budget |
|---|---|---|
| 5 | 1 earlier scene | 3 earlier scenes (418 tok) |
| 10 | 1 | 8 (566 tok) |
| 20 | 1 | 18 (830 tok) |
| 29 | 1 | 27 (1,103 tok) |

**What changed.**

1. `retrievalBudgetTokens()` — 30% of the usable window instead of a constant,
   floored at the old 350 so a small `num_ctx` behaves exactly as before.
2. `SCENE_PRIORITY.sceneContext` 10 → 40, above `chapterLog`. The bible,
   entities and contract are static and re-derivable; the chapter log holds the
   same events in weaker form. Prior-scene content is the one loss nothing
   downstream can recover.
3. The strategy switch is no longer "more than 25 prior scenes". Nothing about
   scene 25 makes semantic retrieval start being worth it — a 9-scene book has
   the same question with fewer candidates. It now ranks whenever there are 3 or
   more prior scenes, and the budget decides how deep the ranked list goes.

**A wrong turn worth recording.** The first implementation of (3) was "if every
summary fits the budget, send them all — ranking can only lose information".
`src/tests/evaluation/productionRetrieval.test.js` failed on it, correctly:
padding the budget with every remaining scene does not add to the relevant ones,
it buries them, and the sibling assertion (a fantasy scene retrieves
predominantly fantasy scenes) would have gone with it. **The budget decides how
deep the ranked list goes; it does not decide to stop ranking.**

**Verified.** 3,190 unit tests, typecheck, policy and lint green; a real 2×3×1,200
run completed `error=null`, 6 scenes, 2,378 words, 6 synced, two continuity
rewrite passes, 10.7 min. The prompt grew only 3,104 → 3,344 tokens there, which
is the expected result at that size: a 6-scene book has at most 4 candidates. The
gain scales with book length, which is what the table above measures.

**Correction to the table above (2026-09-23, same day).** Those numbers come
from calling `buildEmbeddingContext` directly at two budgets, which is the
*positional* path only. They are a fair measurement of that helper and NOT a
before/after of the pipeline, which is how the commit message and the first
version of this section read:

- At 25 or fewer prior scenes the old pipeline did take the positional path, so
  "1 earlier scene" is right there.
- Above 25 it already used embedding retrieval at `k = 5`, so the old figure for
  29 prior scenes is **5, not 1**.
- The new pipeline takes the embedding path from 3 prior scenes up, where `k`
  is a floor, so it never emits fewer than 5 either.

Measured end to end by `continuityProbe.live.js`, earlier scenes actually cited
by the pipeline: **6 / 12 / 18 / 24 / 27** at 7 / 13 / 19 / 25 / 28 prior
scenes, against 5 at every depth when the budget is pinned to 350.

Two further things that probe exposed:

- **The budget is not a hard cap.** The preceding scene's ending is appended
  before any budget check, so a 350-token budget produced 448–479 tokens in
  practice. Nothing downstream breaks — `fitSceneContext` trims later — but the
  number is a target, not a ceiling.
- **`k` as a floor blunts the comparison.** Pinning the budget to 350 in the new
  code still cites 5 scenes, so the probe's "narrow" arm is *not* the old
  behaviour. It isolates the effect of the budget within the new design, which
  is all it can honestly claim.

## 12. Does the extra context help? (2026-09-23)

Paired, not A/B-of-two-books: the Ollama path sends no `seed`, so two whole
books measure sampling noise as much as the change. Same scene brief, same
bible, same chapter log, same prior scenes; only `embeddingContext` differs.
Five scenes at increasing depth, **five repeats per cell, 50 generations, zero
errors**. `continuityProbe.live.js`, `tools/continuity-probe.py`.

The five-dimension critic cannot answer this — §10 showed it returns 8/10 for
all thirty scenes — so the measure had to match the change. A **callback** is a
mention of a named character who is not in that scene's own brief: the writer
can only produce one by remembering a scene nobody handed it.

| scene | narrow cited / callbacks | wide cited / callbacks |
|---|---|---|
| 8 | 5 / 0.6 | 6 / 0.8 |
| 14 | 5 / 0.0 | 12 / 0.8 |
| 20 | 5 / 0.4 | 18 / 0.4 |
| 26 | 5 / 0.4 | 24 / 0.8 |
| 29 | 5 / 0.0 | 27 / 0.4 |

Exact paired permutation over per-scene means: callbacks **+0.36, p = 0.125**;
named mentions +0.56, p = 0.438; distinct callbacks +0.36, p = 0.125. Direction
favours the wider budget on four of five scenes, but that is not significance
and the effect is under one callback per scene.

**The budget is free.** 27.9 minutes for the wide arm against 28.9 for narrow —
3.5x the context at no wall-clock cost, because prefill on a resident model is
cheap next to generation. This is not a speed-for-quality trade.

**The metric was wrong, not merely weak.** Every scene brief carries
`charactersPresent`, so the writer is *told* who is in the scene and rarely
needs to recall anyone. Callbacks are near zero in both arms because the
pipeline's own design makes them unnecessary. The plausible value of a
continuity budget was never "remembers names" — it is "does not contradict what
already happened", i.e. facts and events. Measuring that needs a judge
(`checkContradictions` against the fact ledger); a deterministic metric aimed at
the wrong quantity is worse than a noisy one aimed at the right one.

**Standing conclusion.** The wider budget is kept on narrow grounds: it delivers
3.5x the continuity (measured), costs nothing (measured), and shows no sign of
harm — "lost in the middle" did not appear at ~1,100 tokens of summaries. It is
**not** shown to improve the prose. Anyone revisiting this should measure facts,
not names.

**Still unmeasured: whether the prose is better.** §10 established that the gate
passes 30/30 regardless of content, so the pipeline cannot currently tell you
whether more continuity helps or hurts — "lost in the middle" is a real risk at
1,100 tokens of summaries. Calibrating the gate against hand-labelled scenes
remains the prerequisite for answering that.

## 13. Linking the chapters (eighth pass — 2026-09-23)

§11 asked whether chapters are actually connected. They were not: chapter N+1's
opener is anchored to `prevSpine.emotionalStateAtEnd`, one sentence generated
from the OUTLINE before any prose existed, so a chapter opens against a
description of what the previous chapter was *planned* to do.

**Nothing needed building.** Every piece of a chapter knowledge graph already
existed and none of it reached the writer:

| Piece | Where | Reached the writer |
|---|---|---|
| Chapter-stamped edges (`fromChapter`/`untilChapter`) | `storyGraphStore`, 15–20 per run | no |
| Time-slice reader — the graph as it stood at chapter N | `sliceEdgesAtChapter` | no |
| Path-walking formatter | `getRelationshipContext(ids, depth, atChapter)` | no |
| Chapter-keyed fact ledger (`Ch3: <fact>`) | `buildFactLedger` | no |

`buildFactLedger`'s three callers are all in `ConsistencyService` — it is read
*after* the prose to find contradictions and never *before* to prevent them. The
graph's only consumer is entity generation, which calls `getRelationshipContext`
**without** `atChapter`, hitting exactly the bug its own doc warns about: "a
scene in chapter 3 is described using a betrayal that has not happened yet and
an alliance that ended twenty chapters ago".

**Increment 1: the fact ledger reaches the writer.** `buildStoryStateContext`
emits the chapter-tagged ledger, built from prose only (`buildFactLedger(null,
…)`) — the spine already carries the planned facts and mixing them would hide
which is which. It rides as an `ESTABLISHED FACTS` block under the spine at
priority 45, with wording that says facts take precedence over the plan where
they differ.

**Chapter scoping is not optional.** The anchor-first writer drafts every
chapter's opening and closing scene before any middles, so chapter 5's facts are
in `writtenScenes` while a chapter-1 middle is being written. Without the filter
that middle would be handed its own ending. A test pins it.

**Verified end to end** (`reports/live/the-proof-run/`, 2 chapters × 2 scenes):
`error=null`, 4 scenes, 1,548 words, 4 synced, 6.6 min, and **2 of 23 model
calls carried the block** — exactly the two chapter-2 anchors, since chapter 1's
are written before anything exists. The ledger had real content (five `Ch1:`
facts lifted from the prose), so the feared inert case — correct wiring carrying
an empty ledger because metadata extraction returned nothing — did not occur.
CI guards: the chapter tagging, the future-facts exclusion, the block reaching
the assembled prompt, and no block when nothing is established.

**Not claimed: better prose.** Same limit as §12. This is a mechanism proof.
Whether linking chapters by observed facts reduces contradictions needs the
fact-level measure (`checkContradictions` against the ledger), not name counting.

**Increment 2, not done:** the graph itself. `getRelationshipContext(seeds, 2,
chapterNumber)` is ready to call; it needs store access from the generation path
and a decision on how many seeds to walk.

## 14. Does the fact ledger reduce contradictions? (ninth pass — 2026-09-23)

The measure §12 said was the right one. Paired: identical brief, bible, chapter
log, prior scenes and retrieval context; the only difference is whether
`storyState` carries the ledger. 4 scenes × 3 repeats × 2 arms, 24 generations
and 24 judge calls, 0 errors. `contradictionProbe.live.js`.

**The instrument had to be fixed before it could be trusted.**
`checkContradictions` only examined an entity appearing in two or more of the
scenes given to it. Handed one scene it returned 0 for everything, including
prose stating a living character "had been dead for two years" — identical to
the clean control. The threshold is now 1 when a ledger is supplied (there is
canon to contradict) and 2 when it is not. Without calibrating first, this probe
would have measured 0 in both arms and reported a confident null.

| scene | nofacts (per repeat) | facts (per repeat) |
|---|---|---|
| 14 | 0, 0, 0 → 0.0 | 0, 0, 0 → 0.0 |
| 20 | 3, 5, 3 → 3.7 | 4, 6, 2 → 4.0 |
| 26 | 4, 2, 4 → 3.3 | 4, 3, 4 → 3.7 |
| 29 | 2, 0, 0 → 0.7 | 4, 4, 0 → 2.7 |

Mean paired difference **+0.67 contradictions per scene** with the ledger, exact
paired permutation **p = 0.25** (floor 0.125 at four pairs). Output length is
unchanged: 775 vs 783 mean words.

**The ledger did not reduce contradictions, and the direction is against the
hypothesis.** p = 0.25 is not significance, so the honest reading is "no
detectable effect, trending the wrong way", not "it makes things worse".

Two candidate explanations, neither tested:

1. Noise. Four pairs, three repeats, an LLM judge, and per-scene variance that
   is visibly large (scene 29 ran 2/0/0 against 4/4/0).
2. Engagement. A writer given forty facts writes prose that touches them and
   sometimes gets one wrong; a writer given none writes vaguer prose with less
   to contradict. Under this reading the metric partly counts engagement with
   the story rather than damage to it, and the arms are not comparable on it.

Explanation 2 would mean the measure is still not right — a scene that never
mentions the debt cannot contradict the debt. Distinguishing them needs a
denominator: contradictions per *ledger fact the prose actually engages with*.
That is not built.

**Standing conclusion.** Three mechanisms are now measured and true: the critic
sees whole scenes (§10), the writer gets 3.5x the continuity at no cost (§11,
§12), and chapters are linked by observed facts rather than planned ones (§13).
**No measured improvement in output quality has been demonstrated by any of
them.** The pipeline is better instrumented and better grounded; whether it
writes better prose is unproven, and three separate probes have now failed to
show it.

## 15. Why the overall score is a constant — one hypothesis, killed (2026-09-23)

§10 left the gate passing 30/30 with `score` a flat 8/10 across all thirty
committed scenes, before and after the rubric anchors. Everything downstream
waits on that: a gate that never fails cannot measure a change.

**The hypothesis.** `buildCriticSchema` listed `score` as its FIRST property, and
under Ollama's grammar-constrained decoding property order is emission order. So
the model had to commit to one number for the whole scene before assessing a
single dimension or naming a single issue — a guess, not a summary. The schema's
own comment already applies that reasoning to `pass` ("the verdict is written
after the judgement rather than first"); it just never applied it to `score`.

**The test.** Reorder to `dimensionScores → issues → strengths → score → pass`
and re-score the same thirty scenes with the same model.

| schema order | score | distinct dimension vectors | pass |
|---|---|---|---|
| score first (original) | 8 × 30 | 8 | 30/30 |
| score last | **9 × 30** | **4** | 30/30 |
| score first (re-run after revert) | 8 × 30 | 7 | 30/30 |

**Disconfirmed, and it was a regression.** The score stayed constant, just at 9
instead of 8. Worse, three dimensions that had varied — continuity (7×21, 9×9),
voice (7×4, 8×4, 9×22) and show_tell (8×13, 9×17) — each collapsed to a single
value, halving the distinct vectors from 8 to 4. The third row gives the noise
floor for this measurement: two runs of the identical configuration produced 8
and 7 vectors, so 4 is a real difference and not run-to-run variance.

Reverted. The comment in `buildCriticSchema` now says not to try it again and
why.

**What this rules out.** Emission order is not what pins the overall score. Two
explanations remain, neither tested: the model has no calibrated notion of a
1–10 scene score and lands on its prior regardless of what it is shown (the
rubric anchors already failed to move it, which fits), or the prompt asks for a
summary number in a way that invites a default. Either way the conclusion from
§10 stands unchanged: **`score` is unusable as a signal, the discriminating
information is in `dimensionScores`, and `deriveVerdict` already keys on the
weakest dimension rather than the score — which is the right design given this.**

The remaining route to a gate that discriminates is calibration against scenes
labelled by hand, which no amount of prompt or schema work substitutes for.

## 16. The gate cannot detect defects (tenth pass — 2026-09-23)

§10 found the gate passing 30/30 with a constant score. §15 ruled out emission
order. Both were attempts to improve the judgement. Neither asked the prior
question: **does the gate respond to a defect at all?**

Answering it needs no human labels. Take committed scenes that already pass,
break one specific thing in each by string surgery, and see whether the matching
dimension falls. The ground truth is not anyone's taste — it is "every line of
dialogue now reads identically, so `voice` should drop".
`gateSensitivity.live.js`, 4 scenes × 5 variants × 2 repeats, 40 evaluations, 0
errors, 3.7 min.

| injected defect | target | that dimension | score | passed |
|---|---|---|---|---|
| control | — | continuity 7.0, voice 9.0, emotional_goal 9.0, show_tell 8.8, pacing 8.0 | 8.0 | 8/8 |
| every line of dialogue replaced with one generic line | voice | **−0.1** | 8.0 | 8/8 |
| half the paragraphs replaced with flat summary | show_tell | **−0.8** | 8.0 | 8/8 |
| three filler paragraphs, +819 chars advancing nothing | pacing | **−0.1** | 8.0 | 8/8 |
| a named character stated dead, the debt denied | continuity | **+0.2** | 8.0 | 8/8 |

**40 out of 40 passed.** The one real signal is `show_tell` falling 0.8 for its
own defect, which is movement in the right direction and nowhere near enough to
fail a scene against a threshold of 7. The continuity contradiction — the single
most damaging defect a novel can carry, and the dimension `deriveVerdict` keys
on — moved the score *up*.

**This settles the question threshold calibration was supposed to answer.**
Calibration adjusts where the line sits; it cannot help when the measurement
does not move. §10, §12 and §14 all reported "no detectable effect" through this
gate, and now it is clear why: the instrument reads the same number whatever it
is shown.

**What did work.** The first version of the `told_not_shown` and `padding`
injections inserted identical text repeatedly. `detectRepetition` — a
deterministic check, no model — caught it immediately and decisively: score 1,
`pass: false`, dimension scores empty. It was so unambiguous that it exposed the
bug in the fixtures. The deterministic guard in this pipeline works; the LLM
scoring beside it does not.

That asymmetry is the finding worth acting on. Defects that can be defined can
be checked deterministically — repetition already is; length against the brief
already is; a contradiction against the fact ledger can be
(`checkContradictions` now catches a single scene against the ledger, §14, and
detected the injected "dead for two years" case in isolation). The five-number
LLM rubric is the part that carries no information, and every attempt to fix it
from the prompt side has now failed: required fields (§10 background), rubric
anchors (§10), emission order (§15).

**Not yet tested:** whether asking about one dimension per call, instead of five
at once, restores sensitivity. That is the last cheap prompt-side hypothesis. If
it also fails, the honest conclusion is that an 8B model cannot do this job and
the gate should be rebuilt out of deterministic checks plus the contradiction
judge, which demonstrably do detect things.

## 17. One question at a time restores the gate (eleventh pass — 2026-09-23)

§16 established that the five-dimension gate cannot detect injected defects. The
last cheap explanation from the prompt side was dilution: one call asks for five
numbers, five rubrics, an issues array and a strengths array over a
6,000-character scene. `focusedGate.live.js` tests it — same scenes, same
injections, but one dimension per call with only that dimension's rubric, each
variant paired against its own control on the identical question. 64 calls, 0
unparsed, 6.9 min.

| defect | dimension | combined (§16) | focused control → injected | delta | scenes caught |
|---|---|---|---|---|---|
| every line of dialogue made identical | voice | −0.1 | 8.38 → 7.75 | **−0.62** | 2/4 |
| half the paragraphs replaced with summary | show_tell | −0.8 | 8.50 → 6.38 | **−2.12** | 4/4 |
| three filler paragraphs advancing nothing | pacing | −0.1 | 7.75 → 6.75 | **−1.00** | 4/4 |
| a named character stated dead | continuity | **+0.2** | 7.50 → 6.50 | **−1.00** | 2/4 |

All four move the right way; mean −1.19, exact paired permutation p = 0.125,
which is the floor at four pairs. `show_tell` and `pacing` are caught on 4 of 4
scenes. The continuity contradiction flips from +0.2 to −1.00.

**So the model can do this job; the combined call was preventing it.** That
reverses the pessimistic reading of §16 — the problem is not an 8B ceiling, it is
asking one question five ways at once.

**A confound, stated because it changes what to build.** The focused prompt
differs from production in TWO ways: one dimension per call, and `evidence`
before `score` in the schema, with an instruction to quote the text that decides
the mark. Either could be doing the work. §15 found that moving `score` after the
other *dimension scores* made things worse, which does not settle this — quoting
evidence is reasoning, while emitting four more numbers is not. Untangling them
is one more probe arm and should happen before production is rebuilt around
either.

**Cost, if this becomes the gate.** Five focused calls per scene instead of one:
~30 s against ~6 s of critic time per scene, so roughly 15 minutes against 3 on a
30-scene book. Affordable for a gate that works, and the calls are independent so
they can share the resident model.

**What this does not change.** No output-quality improvement has been
demonstrated for any change made today (§12, §14). What it changes is the
prospect of demonstrating one: a gate that responds to defects is the instrument
every earlier probe lacked.
