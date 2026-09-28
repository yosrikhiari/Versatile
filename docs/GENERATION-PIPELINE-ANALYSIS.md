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

### 17a. Which half of the focused call mattered (2026-09-23)

§17 changed two things at once — one dimension per call, and `evidence` before
`score` with an instruction to quote the deciding text. `NO_EVIDENCE=1` drops
the evidence field and keeps everything else.

| defect | dimension | with evidence | score only |
|---|---|---|---|
| dialogue made identical | voice | −0.62 | −0.38 |
| paragraphs replaced with summary | show_tell | −2.12 | **−2.75** |
| filler advancing nothing | pacing | −1.00 | −0.88 |
| a named character stated dead | continuity | −1.00 | −0.50 |
| **mean** | | **−1.19** | **−1.12** |

**The focus did the work, not the evidence field.** −1.12 against −1.19 is the
same answer, and `show_tell` is caught harder without it.

**And the cheap version is the fast one.** 64 score-only calls took 1.2 minutes
against 6.9 for the same calls with a quote — 1.1 s per call, because nothing
generates a 300-character justification. Five focused calls is therefore ≈5.6 s
per scene against ≈6.2 s for the combined call measured in §10, so a gate that
detects defects costs **no more than the gate that does not**.

One thing that comparison does not cover: production also needs `issues` for
revision feedback, and the focused arms return a score alone. Adding an issues
array back will cost some of the saving, so "cost-neutral" holds for the scoring
half and has to be re-measured for a full replacement.

**Recommended shape**, on this evidence: keep `deriveVerdict` as it is — it
already keys on the weakest dimension, which is the right design when the
summary score is uninformative — and replace the single five-dimension call
behind it with one focused call per dimension. Then re-run
`gateSensitivity.live.js`: the defects it injects are the acceptance test, and
today they all pass 40/40.

## 18. The focused gate in production (twelfth pass — 2026-09-23)

§17a said to keep `deriveVerdict` and replace the single five-dimension call
behind it with one focused call per dimension. Built, behind
`STORAGE_KEYS.CRITIC_FOCUSED`, **off by default**. `gateSensitivity.live.js`
with `FOCUSED=1` is its acceptance test — the same injected defects, through the
production critic.

**The first port scored worse than the standalone probe, and the acceptance test
caught why.** Two bugs, both mine:

- It passed `activePrompts.critic` as the system prompt. That prompt instructs
  the model to return the full five-dimension object, contradicting the single
  question the user prompt asks. Replaced with a focused system prompt.
- The shared scene block labels the bible *"character descriptions for voice
  check"* — true for voice, actively misleading for continuity. The focused
  prompt now prepends a per-dimension framing line, naming the bible as
  established fact when continuity is what is being judged.

| defect | target | combined (today) | focused (fixed) |
|---|---|---|---|
| control (clean prose) | — | passes 8/8 | **passes 6/8** |
| every line of dialogue identical | voice | −0.12, passes 8/8 | **−1.00, fails 0/8** |
| paragraphs replaced with summary | show_tell | −0.75, passes 8/8 | **−2.50, fails 0/8** |
| filler advancing nothing | pacing | −0.12, passes 8/8 | −0.50, fails 4/8 |
| a named character stated dead | continuity | +0.25, passes 8/8 | **+0.00, passes 6/8** |

**Voice and show_tell are solved.** Both go from undetectable to caught on every
scene. Pacing is caught half the time.

**Continuity is not, and should not be fixed here.** The injection contradicts
the first line of the bible it is given (`Ch1: Halim is alive and leading a
caravan`), so the fixture is sound and the judge simply cannot see it — the same
result the standalone probe got (−0.50, 2 of 4). But `checkContradictions`
**did** catch that exact injection in isolation (§14 calibration: one
contradiction, correctly diagnosed as alive-versus-dead). The dedicated
contradiction judge against the fact ledger is the right home for continuity;
asking the scene critic for a continuity number is not.

**Cost is not the objection.** 3.4 minutes for the focused acceptance run
against 3.7 for the combined one, on identical work.

**Why it stays off by default.** Clean prose now fails 2 of 8. A gate that can
fail will sometimes fail good work, and the separation is real (6/8 against 0/8),
but flipping the default changes every generation run — more revision attempts,
longer runs — and that deserves its own measurement rather than riding along
with this one. The generation contract already limits the damage: gates warn
rather than discard, and a failed scene commits its best attempt as `review`.

**Recommended finish, not built:** route continuity through
`checkContradictions` against the ledger instead of the focused critic, re-run
the acceptance test, then measure run-level impact before changing the default.

## 19. Why the focused gate named the wrong dimension (thirteenth pass — 2026-09-24)

§18's focused gate caught voice and show_tell defects but often **blamed the
wrong dimension**: a scene whose paragraphs were replaced by summary failed on
`voice`. Four measurements, each killing or confirming one explanation:

| probe | finding |
|---|---|
| biggest drop vs lowest score | show_tell had the **biggest drop 4/4** on the summary defect; it lost only the "lowest score" race because dimensions sit at different baselines (voice 5 on a clean scene 14). |
| "quote the passage" (DeepSeekMath-V2-style verifier, 53 calls) | every failing dimension quoted a passage that exists — and for defects, **the planted one**. The judge *sees* the flaw; it pins it on whichever dimension it is asked about (halo). Quote-exists filtering removes nothing. |
| classify each quoted passage (one multiple-choice call) | right for local flaws (summary → show_tell 4/4, "dead two years" → continuity 3/3, both ~1.0 probability), wrong for pattern flaws (flat voice, filler) and biased toward show_tell on clean passages. Not shipped. |
| baseline-relative attribution (offline) | worse than lowest-score (6/16 vs 10/16). Killed. |
| **input isolation** (probe, 60 calls) | give each judge only its evidence. **Voice from dialogue alone**: clean 8.7–9.0, flattened 3.0–3.6 on 2 of 3, other defects barely move it. **Pacing as per-paragraph ADVANCES/FILLER labels**: 10/12 planted fillers flagged at the exact paragraph numbers, 2 false flags on 4 clean scenes. Per-paragraph show/tell labels **failed** (84–88% of clean paragraphs called "reported"). |

**Shipped (`criticIsolation.ts`, focused mode only, still off by default):** voice
is judged on the dialogue lines alone, skipped under `MIN_VOICE_LINES` (6) —
scene 14 has 2 lines, and its "clean scene fails voice" was a verdict about a
sample too small to carry one — with a free verbatim-repetition guard in front;
pacing is per-paragraph labels, fail at ≥ 2 filler paragraphs, and the issue
names the paragraphs so a reviser can cut exactly those. show_tell and
emotional_goal stay whole-scene. Tests: `criticIsolation.test.js`.

Acceptance (`gateSensitivity.live.js FOCUSED=1`, `tools/gate-attribution.py`):

| | combined | focused, whole scene (§18) | focused, isolated |
|---|---|---|---|
| defects caught | 0/16 | 11/16 | 15/16 |
| target dimension named | 0/16 | 9/16 | 11/16 |
| other dimensions pushed under the floor | 0 | 13 | 9 |
| clean scenes failed | 0/4 | 1/4 | **2/4** |

By defect: padding named 2/4 → **4/4** (with paragraph numbers); summary 4/4
both; voice 3/4 both (the 4th is scene 14, now correctly not judged);
contradiction named **0/4** both — its three "catches" are pacing false flags,
not detections. Continuity still belongs to `checkContradictions` (§18).

**Not solved: pacing false flags on clean prose.** The same labelling prompt
flagged 0 paragraphs of clean scene 8 through `/api/chat` (probe) and 3
through `/api/generate` (production). Deterministic per format, unstable
across formats on borderline paragraphs. Clean counts over both runs
{0,1,0,1,3,2,0,1} overlap padded counts {3,3,2,4,4,3,3,4}; the ≥ 2 threshold
was set from the probe and was NOT re-tuned on the acceptance scenes. Next:
per-label probabilities (logprobs) so only confident FILLER counts, and the
30-scene defect set so thresholds are chosen on data they are not tested on.
The voice-flatten −7 in production is the verbatim guard firing on a fixture
that repeats one line; the LLM voice judge's own sensitivity is the probe's
2-of-3, which needs a non-verbatim voice fixture to measure properly.

## 20. Closing the gate's blind spots on 30 scenes (fourteenth pass — 2026-09-24)

§19 left two problems: clean scenes failing pacing, and continuity named 0/4.
Everything below is measured on all 30 corpus scenes. Odd scenes chose any
threshold and even scenes were held out, because four scenes were enough to
see the gate move but not to tune it and then test it on the same prose.

**1. The pacing false flags came from `repeat_penalty`.** The Ollama provider
always sends the prose sampling defaults (`repeat_penalty 1.15`,
`repeat_last_n 512`). A label array is the same two words repeated, so the
penalty pushes the model off "ADVANCES" as the list grows. That is why §19's
probe (no penalty) and the production run disagreed. A probe replicating the
production request exactly (`tools/judge-probes/pacing_penalty_probe.py`):

| clean prose, 30 scenes | penalty 1.15 (production) | penalty 1.0 |
|---|---|---|
| false FILLER flags | 32 | 9 |
| scenes failing at ≥ 2 flags | 7/30 | 1/30 |
| padded scenes caught at ≥ 2 | 30/30 | 30/30 |

With the penalty off, ≥ 2 flags was chosen on the odd scenes (1/15 clean fail,
15/15 caught) and gave 0/15 clean fails and 15/15 caught on the held-out even
scenes. Fix: `JUDGE_SAMPLING = { repeatPenalty: 1 }` on every focused judge
call. Judge output is labels and scores, not prose.

**2. "Summary → pacing" was my fixture, not the judge.** `told_not_shown`
swaps paragraphs for content-free sentences, which really are filler. The new
`told_faithful` fixture (`make_told_faithful.py`, cached) turns the same
paragraphs into one plain sentence that keeps their plot facts. On it, pacing
moved −0.07 (2/30) while show_tell moved −1.83. Pacing isolation holds.

**3. Ties named the wrong dimension.** `deriveVerdict` named one "weakest"
dimension, so on a tie the first in list order won. On `told_faithful`,
show_tell tied with emotional_goal on 11 verdicts and lost all 11. The verdict
now carries `failingDimensions` (lowest first), and the reason lists all of
them. `sceneGate` feeds every failing dimension to the prompt adjuster, not
just the first.

**4. Continuity by isolation, with evidence checked by code.** The judge sees
the bible's lines as facts plus only the scene sentences that name someone in
the bible. It returns `{sentence, fact}` pairs, and `verifyContradictions`
keeps a pair only if both strings are really there (letters and digits
only, so "Hal,im" still matches). Probe: planted contradiction 29/30 (the one
miss was that garbled quote, now tolerated), clean 0/30, 6 invented quotes
dropped. It also surfaced a real error in committed scene 14 ("since the day
Halim died" against "Halim is alive"). The same prose had passed every
earlier critic.

**Acceptance: the production critic, 30 scenes × 6 variants**
(`FOCUSED=1 SCENES=all OUT_SUFFIX=final`, `tools/gate-attribution.py --split`):

| | combined (default) | §18 focused, 4 scenes | **final, 30 scenes** | held-out half |
|---|---|---|---|---|
| defects caught | 0/16 | 11/16 | **133/145** | 64/72 |
| target dimension among the failures | 0/16 | 9/16 | **129/145** | 63/72 |
| clean scenes failed | 0/4 | 1/4 | **2/30** | 1/15 |

| defect | named | notes |
|---|---|---|
| contradiction | **30/30** | was 8/30 with the whole-scene judge |
| padding | 30/30 | with paragraph numbers |
| told_not_shown | 30/30 | |
| voice_flatten | 18/25 | the other 7: 6 scenes with < 6 dialogue lines (not judged), 1 stopped by the repetition guard. 18/18 where voice can be judged. |
| told_faithful | 21/30 | the mildest defect, and some cached summaries keep imagery |

**Residuals, not hidden.** The two clean fails are pacing on scenes 4 and 5.
Scene 4's flagged paragraphs are slow, atmospheric material (arguably a
correct fail). Scene 5's paragraph 5 is plot-moving dialogue, a real false
flag. Co-failures remain only in the two judges that still read the whole scene:
show_tell fails with padding (15/30) and voice_flatten (8/25), and
emotional_goal fails with both summary fixtures. The isolated judges barely
leak. Some of that is defensible (stated feelings do weaken the emotional
beat), but show_tell is the next candidate for isolation. A per-paragraph
show/tell label failed in §19, but that probe ran through `/api/chat`, before
the penalty finding, so it is worth one re-test under `JUDGE_SAMPLING`.

**Still off by default.** The gate now discriminates. Turning it on changes
every run (more revisions, longer runs), and that is a run-level measurement of
its own. The combined critic (`callCritic`) still uses the prose sampling
defaults. Whether `JUDGE_SAMPLING` helps it is untested.

## 21. Blame once, confirm before failing, and what the gate costs a run (2026-09-24)

Three items from §20's residuals, all measured on 30 scenes (odd scenes
choose, even scenes held out).

**Per-paragraph show/tell is dead, confirmed.** Re-tested under
`JUDGE_SAMPLING` (`showtell_probe.py`): 61% of clean paragraphs were labelled
REPORTED, the same 61% as the planted telling paragraphs, so the labels carry
no signal. But the same probe labelled **88 of 90 planted filler paragraphs
REPORTED**. Filler really is flat telling. The show_tell co-fail on padded
scenes (15/30 in §20) was one flawed paragraph being failed twice, not a
leaking judge.

**Blame once.** Pacing now runs first, and when it fails a scene, the
paragraphs it named are removed from the text the show_tell judge reads. On
the 30-scene acceptance run, padding → show_tell co-fails went **15 → 0**, and
padded scenes naming only pacing went 12 → 25. The trade: on `told_not_shown`
(content-free summaries, which are filler as much as telling), pacing now owns
3 of the paragraphs and show_tell was named 27/30 instead of 30/30. Caught
stays 30/30.

**Confirm before failing (pacing).** A pacing pass that would fail the scene
is re-asked with the paragraphs **reversed**, and the scene fails only if at
least one forward flag is confirmed (`pacingVote`). This is DeepSeek-GRM-style
voting at k = 2, and it only runs when the first pass would fail, so clean
prose pays nothing extra (`pacing_vote_probe.py`):

| | forward only | forward + reversed confirm |
|---|---|---|
| clean fails, odd (chosen) | 1/15 | **0/15** |
| clean fails, even (held out) | 1/15 | **0/15** |
| padded caught, odd / even | 15/15 / 15/15 | 15/15 / 15/15 |

**Confirm before failing (voice): not shipped.** Clean scene 10 failed voice
(5) in the acceptance run after passing (7) in an earlier one, which looked
like sampling noise. A probe of 3 forward draws plus 1 reversed pass per scene
(`voice_confirm_probe.py`) says otherwise: the clean scenes that fail voice
fail on every draw, and the reversed pass agrees. Confirmation changed nothing
(odd 3/33 → 3/33, even 4/24 → 4/24). Read by hand, the failing dialogue really
is interchangeable: scene 17 is "Does it hurt?" / "It does," / "But not enough
to stop us." / "This will help," / "I know." Scene 2, rated 9, has "Trust is a
luxury among traders. We deal in certainty, not faith." These are **true
positives on a model-written corpus that was never gold**. "Clean" meant "not
injected", not "good".

**Acceptance** (`gate-sensitivity-focused-30-vote`): caught 133/145, target
named 126/145, other dimensions pushed under the floor 113 → 99, **clean fails
1/30** (0/15 odd, 1/15 even; the one is scene 10's voice, per the paragraph
above). Pacing clean fails: **0/30**.

**What the gate costs a run** (`saltRoad.live.js`, 2 chapters × 3 scenes, same
settings, `LIVE_FOCUSED=1` against the default):

| | gate off (combined) | gate on (focused) |
|---|---|---|
| wall time | 13.4 min | 10.8 min |
| model calls | 41 (6 judge) | 66 (38 judge) |
| prose (writer) calls | 10 | 9 |
| scenes committed as `review` | 0/6 | 1/6 |

The focused gate adds about 32 short judge calls and no measurable time. The
writer dominates the run, and the 2.6-minute gap in the gate-on run's favour is
the noise between two different books. One run per arm measures cost, not
quality. Whether gated books read better needs the gate itself on both books'
committed scenes, and more than six of them.

Also fixed: `useGroupChat.test.js` timed out under full-suite load (2 of 4
runs). Its first group test was the first code path to lazily import
`groupChatGraph` (LangGraph). The import now happens in `beforeAll` under the
60 s hook timeout. The suite then passed 3 of 3 full runs.

## 22. §14 retracted: the ledger did not make contradictions worse (2026-09-24)

§14 concluded that handing the writer the ESTABLISHED FACTS ledger produced
**more** contradictions (+0.67/scene, p = 0.25, "trending the wrong way"). The
24 scenes it wrote were saved, so they were re-graded with the §20 isolated
continuity checker (29-30/30 on planted contradictions, 0/30 false on clean
prose), against the same ledger each scene was written with
(`tools/judge-probes/rejudge_contradictions.py`):

| | with ledger | without |
|---|---|---|
| `checkContradictions` (§14 judge) | 31 | 23 |
| isolated checker, quotes verified by code | **0** | **0** |

Two of the old judge's heaviest verdicts, read by hand against their ledgers:
- scene 20 r2 (with the ledger, **6** "contradictions"): every event matches the
  facts. The nearest candidate is "the mule's infection" against "the mule is
  gravely injured", which is a detail, not a contradiction.
- scene 26 r1 (without it, **4**): Nesrin confronting Ahmed in a room.
  Nothing in chapters 7-8 is contradicted. "You were there when the trader
  warned me" concerns who was present, which the ledger never states.

**Retraction:** §14's difference was the old judge's false alarms, not the
writer. In 24 generations neither arm contradicts the ledger, so the ledger
neither hurts nor measurably helps at this depth. The no-ledger arm already
carries the same facts through the chapter log and retrieval. Measuring a
benefit needs facts the writer cannot get any other way.

Not claimed: the isolated checker's recall on *subtle* natural contradictions.
It is measured only on a blatant planted one.

**Open, and more important than the ledger:** `checkContradictions` still
drives the chapter-boundary audit in `ConsistencyService`, and its findings
trigger **rewrites** (`CONSISTENCY_FIX_ROUNDS` × `CONSISTENCY_FIX_MAX_SCENES`).
If it raises false alarms at the rate these two scenes suggest (10 flags, 0
real), the audit is rewriting correct scenes. Next: measure its false-alarm rate
on the 30 clean corpus scenes against their ledgers, and compare it with the
isolated checker, before touching the audit.

## 23. The chapter audit accused good scenes and missed the real one (2026-09-24)

§22 read two of `checkContradictions`' heaviest verdicts and found no
contradiction in either. That judge drives the chapter-boundary audit in
`ConsistencyService`, and its findings trigger **rewrites**. Measured the way
§20 measured the scene gate (`auditFalseAlarm.live.js`: every corpus scene
against its own ledger, called as the audit groups scenes, flagged text saved):

| 30 scenes | `checkContradictions` | isolated | isolated + confirm |
|---|---|---|---|
| clean scenes accused | **10/30** (26 accusations) | 3/30 | **0/30** |
| planted "dead two years" named | **1/30** | 30/30 | **30/30** |

Every old accusation read was false: "collapses under the salt in Ch2, which
contradicts her carrying it later", "her clothes smelled of damp earth in one
scene and of iron in another", "Yusuf leans on a crate in one scene and waits
at a gate in another". People recover, smells change, and characters move.
So the audit rewrote correct scenes and let the real contradiction through
29 times out of 30.

**Shipped, behind the focused flag:** with a ledger, `checkContradictions` now
checks each scene's sentences that name someone in the story against the facts
of **earlier chapters only**. A later fact ("Ch9: Halim dies") must not make an
earlier "Halim is alive" a contradiction. It returns the audit's existing
report shape, with `between` holding the scene's own sentence, so
`planConsistencyFixes` targets exactly the scene that holds it (pinned by a
test where the latest scene with the character is not the one at fault).

**Check the checker.** The isolated audit's 3 remaining accusations were the
same pair: "Halim warns her about the salt's strange properties" against the
fact "Halim warns her of its unnatural qualities". Both quotes were real, and
they agree. Each code-verified pair now gets one yes/no question: can both be
true? Only "no" survives (DeepSeekMath-V2's meta-verification, here a
3-token answer). It runs only on flagged pairs, and it applies to the scene
gate's continuity check as well. Result: 0/30 clean, 30/30 planted.

Not claimed: recall on subtle natural contradictions. The planted one is
blatant, and §22's 24 generated scenes contained none to find.

## 24. The focused critic is the default (2026-09-24)

`isFocusedCriticEnabled()` now returns true unless the setting is explicitly
`false`. The evidence it rests on: §20–§21 (133/145 planted defects caught
on 30 scenes, 1/30 clean fails, and that one a true positive on reading),
§23 (the audit: 0/30 good scenes accused, 30/30 caught), and §21's book run
(+32 short judge calls, no measurable wall time). The combined critic stays
available (`setFocusedCritic(false)`). The five test files that cover it pin it
explicitly, so the default cannot silently change what they test.
`saltRoad.live.js` takes `LIVE_FOCUSED=0|1`, and `wire.json` records the mode
that actually ran. `contradictionProbe.live.js` now grades through the isolated
audit path unless combined mode is pinned.

What is still not shown: that gated books *read better*. That needs more than
one book per arm, with committed scenes compared by a judge that §19–§23
showed can see.

## 25. Repair in place instead of writing the scene again (2026-09-24)

A failed gate used to mean one thing: `sceneGate` asked the writer for the
whole scene again. That is about 75 s of generation, it discards every
paragraph that was fine, and the new draft can bring new problems, with only
`SCENE_MAX_ATTEMPTS` = 2 tries. Since §19–§23 the focused critic says
**exactly** what is wrong for two dimensions: the filler paragraphs by number
(confirmed by the reversed pass), and the contradicting sentence with the fact
it breaks (code-verified, then "can both be true?"). Those now travel as data on
the issue (`paragraphs`, `evidence`).

When those are the **only** failing dimensions (`planRepair`), the gate cuts
the paragraphs with no model call, and rewrites each contradicting sentence
with one short call (`repairSentence`). It then judges the result through the
same `critiqueAttempt`. If that passes, it is the scene. If not, the loop
continues to the full rewrite as before, so a repair can only save work.

Probe (`tools/judge-probes/repair_probe.py`, 30 scenes, odd chooses / even
held out):

| | odd | even |
|---|---|---|
| padded scene passes after cutting confirmed filler | 14/15 | 13/15 |
| real paragraphs cut / planted cut | 2 / 34 | 4 / 35 |
| cutting every *forward* flag instead: real paragraphs cut | 5 | 10 |
| contradiction scene passes after one sentence rewrite | 15/15 | 14/15 |

Only confirmed flags are cut; cutting every forward flag took 2–3× more real
prose.

The end-to-end test (`volumeGeneratorRun.test.js`, "repairs a scene in place")
passed **vacuously** on its first version. The fake writer returned HTML with
no blank lines, so the critic saw one paragraph and there was nothing to cut. It
was caught by asserting the critic saw ≥ 3 paragraphs. The second version then
showed the gate's 80% length floor refusing a repair that cut two thirds of a
scene, and sending it back to the writer. That is the right call, and it is why
the fixture now has 12 paragraphs.

Not yet in `graphStrategy` (the LangGraph path composes the gate primitives
itself).

**First real run** (`saltRoad.live.js`, 2 chapters × 3 scenes, same settings as
§21, `repairs` in `wire.json`): 9.8 min, 8 writer calls, **0 of 6 scenes left for
review** (the §21 gate-on run left 1). The repair fired **once** and did not
clear that scene by itself. The full rewrite then did, as designed. So on real
prose a repair is rarer than on planted defects: it only fires when pacing or
continuity are the *only* failures, and real failures are often voice or
emotional goal. How often it saves a rewrite needs more than one book.

## 26. Repair in place on the LangGraph path (2026-09-25)

§25's repair ran only in the legacy loop. `graphStrategy` composes the gate
primitives itself (draft node, critique node, Editor decision), so it never
repaired. The repair is now one gate primitive, `repairAttempt`, which
repairs the judged draft, judges the repair, and returns the repaired draft
with its verdict, or null. The legacy loop and the graph's critique node both
call it, so what a repair may touch and how it is judged cannot drift between
orchestrators.

In the graph it runs inside the critique node, on the critic's lane. Cutting
located filler and rewriting one sentence are critic-sized jobs. The Editor then
decides on the repaired draft, which usually means accepting it rather than
putting a whole-scene redraft on the GPU lane. `repairAttempt` is optional
on `GraphSceneGate`, so a gate without it (a test double) simply never
repairs.

Tests (`graphStrategy.test.js`): a scene that fails and whose repair passes is
drafted once and commits the repaired prose as `generated`; a repair that fails
falls back to a new draft carrying the repair's feedback. Both were checked
against a mutation: with the repair call disabled, both fail.

Real run (`LIVE_ORCHESTRATOR=langgraph`, 2 chapters × 3 scenes): complete, 8.7
min, 51 calls, 6/6 generated, **0 repairs**. The one scene the gate sent back
had no repairable failure. The run shows the graph path end to end with the
change in place; the repair itself on this path is shown by the tests, not by
this run.

## 27. What is still imperfect, and the plan (2026-09-25)

**How sure the numbers are** (Wilson 95%): caught 133/145 = 86–95%;
contradictions 30/30 = 89–100% (blatant planted only); faithful telling 21/30
= 52–83%; **clean false fails 1/30 = 0.6–17%, which is not established**.
Thirty clean scenes cannot show a low false-alarm rate.

**Telling markers, a negative result** (`tools/judge-probes/telling_markers.py`,
no model calls). Named emotions ("she was afraid") and filter verbs ("she
realized") per 100 words, counted in code: the faithful-telling fixture has 0.00
named emotions/100w, and only more filter verbs (0.61 vs 0.12). At scene level
the telling version has more markers than its clean scene in 18/30, close to
chance. The fixture's telling is *summarised action*, not named emotion, so
a lexical signal cannot be judged on it, and a named-emotion defect is needed
first.

**What research says** (checked on arXiv/GitHub; see the report for detail):
- *Inter-dimension dependence* is a named effect: a judge's reasoning uses
  off-target evidence (arXiv 2608.23783, "DimCheck": filter the evidence,
  then judge). One rubric per call, which we already do, is the no-training
  fix for prompt-level interference (2608.14684). What remains comes from the
  scene content.
- No reliable show-vs-tell detector exists. Frontier models locate
  "unnecessary exposition" at 0.46 precision (LAMP, 2409.14509). Small models
  do extraction and narrow yes/no reliably, and a taste judgment unreliably;
  that is why §19's per-paragraph DRAMATISED/REPORTED label failed.
- Absolute emotional-impact scores are weak (ρ ≈ 0.51 at best, 2406.12680)
  and biased to surface features (2609.13773). Pairwise both-orders comparison
  works better (2507.00769).
- Contradiction recall on natural errors: ConStory-Bench (2603.05890, MIT,
  Hugging Face, LLM-labelled) and FlawedFictions (2504.11900, human-verified,
  data on request).
- Our planted-defect method is FBI (2406.13439). It adds a human check that
  each planted flaw is real. An honest false-alarm rate needs a human-labelled
  set of about 60–100 scenes with the rubric frozen first (2404.12272), and a
  bias-corrected rate (2511.21140).
- Repair vs regenerate is untested for fiction. A code study at matched compute
  favoured regeneration 40–3 (2609.00854).

**Plan, in order:**
1. Human-labelled set: about 80 real scenes, rubric frozen first, 20
   re-labelled a week later. All gate numbers reported against it.
2. show_tell as extract-then-check: a named-emotion defect; the model quotes
   emotion-naming sentences, code verifies them; one yes/no per quote, "also
   shown within ±2 sentences?"; fail on the share of named-but-unshown
   emotions against the clean-scene distribution.
3. emotional_goal: remove emotion-naming sentences, then a multiple-choice
   "what does the reader feel?"; then a pairwise comparison against a flat
   version, in both orders.
4. Two-pass evidence filtering for whatever still reads the whole scene;
   yes/no probabilities; pass marks from the step-1 labels.
5. Continuity recall on ConStory-Bench chunked to scene size, with about 50
   disagreements hand-checked.
6. Repair vs rewrite at matched compute on 30 failed scenes.
7. Only then: gated vs ungated books, compared pairwise by a judge that is
   not the gate.

## 29. On real scenes the gate is nearly blind again (2026-09-25)

Step 1 of the §27 plan, with the labelling reshaped: 78 scenes was too much
for one person (`LABELLING-RUBRIC.md` addendum). All 78 pool scenes were
labelled twice by independent Claude reviewers under the frozen v1 rubric,
never shown the gate's verdicts, second pass blind to the first. The human
reference is 12 of them (labelling desk artifact), **still to be labelled**:
every number below is **reviewer labels, not human labels**.

**Are the reviewers consistent?** Pass 1 vs pass 2: continuity κ 0.75, voice
0.66, show_tell 0.68, pacing 0.85, emotional_goal 0.89, overall keep/revise
0.59. That is substantial to near-perfect agreement, so a usable reference.

**The gate vs the reviewers' consensus** (scenes where both passes agree;
gate = production focused critic, `gateOnPool.live.js`; Wilson 95%):

| dimension | reviewer problems caught | false alarms on reviewer-fine |
|---|---|---|
| continuity | **0/13** (0–23%) | 0/29 |
| voice | 0/5 | 1/37 |
| show_tell | **0/28** (0–12%) | 0/37 |
| pacing | **0/22** (0–15%) | 3/49 |
| emotional_goal | 0/10 | 2/45 |

The gate fails 12/78 scenes. The reviewers would revise 46 of the 64 they
agree on. The planted-defect numbers (133/145) measured blatant defects;
real ones are subtler.

**The reviewers are right where it can be checked.** Their continuity notes
quote the text: scene 14 "since the day Halim died" (facts: Halim alive);
scene 9 "the amulet Halim had given her before he died"; scene 6 a man
"lying lifeless… the silence of death" who then coughs and dies; the harbour
scene "closed the laptop… leaving only the faint glow of the screen". The gate
scored continuity 8 on each.

**Why each dimension misses:**
- *Continuity, presupposition.* Scene 14's sentence reaches the isolated
  checker, and the checker claims nothing. The planted defect was an assertion
  ("X had been dead for two years"); real errors are presupposed inside a
  clause ("since the day Halim died"). The small judge checks what a sentence
  asserts, not what it assumes. Also, the gate has no within-scene check at
  all, and the rubric (and the reviewers) count self-contradictions.
- *Pacing, threshold.* There is a weak signal: on reviewer-problem scenes the
  gate flags one paragraph (score 7) 32% of the time, against 16% on fine
  scenes. On scene 9 it flagged ¶13 where the reviewers said ¶13–15. The "≥ 2
  flags, confirmed" rule was tuned on blatant planted filler and passes that.
- *Show_tell, no signal.* 7s and 8s alike on problem and fine scenes.
- *Emotional_goal, degenerate.* 7 on every problem scene and 42/45 fine
  ones, the constant-score failure of §10 and §15, back.

**What this changes:** the planted-defect harness stays as a regression
test, but the gate's real job is now measured against the reviewer consensus
(and the 12 human labels when they exist). The plan reorders around the
misses: (1) continuity via claim extraction that includes presuppositions,
plus a within-scene check; (2) pacing thresholds recalibrated on reviewer
labels, odd/even split; (3) show_tell extract-then-check; (4) emotional_goal
as an isolated multiple-choice question. Every change is judged on this
78-scene set.

## 30. Masterpieces as the control: the gate prefers LLM style to Chekhov (2026-09-25)

§29 left one question: are the reviewers right, or just harsh? The control is
published literature. Twelve public-domain passages (Chekhov, Wharton, Joyce,
Mansfield, Conan Doyle, Wells; Project Gutenberg, downloaded with the user's OK,
`tools/labelling/build_masterpieces.py`), each cut at a scene break to
556–851 words and given the same brief shape as a generated scene, were judged
by the production gate (`gateOnPool.live.js`, `POOL_DIR=reports/live/masterpieces`)
and by two fresh reviewers under the same v1 rubric. The reviewers could
recognise the famous ones; that is noted, not controlled.

| | reviewers: revise | gate: fail |
|---|---|---|
| 12 masterpiece passages | **1/12** (both passes; a brief mismatch of mine: Mattie is not in the excerpt) | **11/12** |
| 78 generated scenes | 53/78 (pass 1) | 12/78 |

The gate scored "The Lady with the Dog" show_tell 3, Conan Doyle 3, Joyce 5,
and Wells pacing 1, while every one of the 78 generated scenes got show_tell
7–9. The reviewers marked **0** show_tell, pacing or continuity problems in
the masterpieces (both passes).

**Reading.** On show_tell and pacing the gate does not measure quality. It
measures resemblance to LLM prose: it rewards the generated house style
("the scent of X clung to the air", "her pulse thudded") and punishes the
narrative summary that masters use deliberately. This is the surface-feature
bias the research brief warned about (arXiv 2609.13773). That is why it caught
none of the reviewers' problems (§29): it scores the wrong thing, not the
right thing weakly. The rubric allows summary "for transitions, time jumps";
the gate applies show-don't-tell literally, the reviewers apply "at a moment
that matters".

It also settles §29's open question: the reviewers pass the masterpieces
and fault the generated prose, which is the right direction.

**Also, my own review of the user's 12** (`claude-labels/main-12.json`; the
same model family, so not a human check, and not independent on
pool-harbour-08, whose reviewer notes I had seen): all three labellers agree on
42 of 50 decided cells. Where we differ I am the *stricter* one (show_tell and
pacing on two orchard scenes).

**What changes.** The masterpiece passages join the 78 as a fixed control.
Every gate change must now (a) catch the reviewers' problems on generated
scenes and (b) pass the masterpieces. A show_tell or pacing judge that fails
Chekhov is disqualified however well it does on planted defects.

## 31. Acting on the real-scene test: three dimensions stop failing scenes (2026-09-25)

**The bench.** `tools/judge-bench/bench.py` scores any candidate judge on the two
tests §29–§30 set: catch what both reviewer passes called a problem (and stay
quiet where both said fine), and pass the 12 masterpieces. Results are cached
per scene, so a re-score is free and a stopped run resumes.

**First, a confound in the labels.** Split by where the scene came from, the
reviewers' problems are not spread evenly:

| dimension | salt-corpus (old, ~980-word scenes): problem / fine | current pipeline (~410 words): problem / fine |
|---|---|---|
| continuity | 11 / 12 | **6 / 30** |
| voice | 3 / 12 | 2 / 25 |
| show_tell | 24 / 3 | 4 / 34 |
| pacing | 22 / 4 | **0 / 45** |
| emotional_goal | 7 / 13 | 3 / 32 |

Every pacing problem, and 24 of 28 show_tell problems, is in the older
salt-corpus. Word count alone separates the reviewers' pacing problems from
fine scenes at AUC 0.97 (`tools/judge-bench/pacing_features.py`); paragraph
redundancy measured with embeddings adds little once length is controlled
(AUC 0.68 inside the 500–1000-word band, 15 vs 3 scenes). So a judge can score
well on those two dimensions just by recognising the old corpus. Any result on
them has to be read within a source, and on the current pipeline there is
almost nothing to catch: the reviewers found **no** pacing problems in 45
current scenes.

**What the gate costs on current output.** It failed 11 of the 48 current
scenes: 8 on emotional_goal, 3 on pacing, 1 on voice. In **none** of the 11
did the reviewers mark a problem on the dimension the gate blamed. Every such
failure buys a repair or a rewrite. On the masterpieces the failures are
show_tell 11, pacing 6, emotional_goal 3. The pacing judge is not just weak,
it points the wrong way: it scored all 22 reviewer pacing problems 7–8
(pass), and scored three reviewer-fine scenes 1, 3 and 5.

**Change.** In the focused critic (the default), `show_tell`, `pacing` and
`emotional_goal` are now **advisory** (`FOCUSED_ADVISORY_DIMENSIONS`,
`criticVerdict.ts`): judged and reported exactly as before, but excluded from
the floor, the major-issue count and the mean, so they cannot fail a scene or
trigger repair. Continuity and voice still gate: both were validated on
planted defects (§17–§23) and neither fails a masterpiece. The combined critic
is unchanged. A dimension comes off the list only when a replacement passes
the bench.

One leak was found while testing: `gateProseQuality` (`evalGates.ts`) takes its
own average of every dimension score, which would have let advisory scores
fail a scene through a second door. It now skips them too. The e2e test that
used to assert a pacing cut (§25) now asserts that a scene whose only
complaint is filler is committed as written. The cut still exists in
`planRepair` for a future pacing judge that passes the bench; nothing in
production reaches it today. The legacy loop has no e2e test of the
continuity repair (the LangGraph path has two).

**Continuity: a second check for what a sentence assumes.** Of the 17
continuity problems both reviewers marked, 9 contradict the story facts and 8
contradict something earlier in the same scene. On the 9, production scored
continuity 8 every time (0/9 caught). Most are *assumed*, not stated: "It
hadn't been warm since the day Halim died" never says "Halim is dead", and the
one-shot check asks which sentences *state* a contradiction.

The candidate (`tools/judge-bench/continuity_claims.py`) runs three narrow
steps: extract every fact each sentence states or takes for granted; match
those claims against the facts; confirm each (sentence, fact) once. Three
versions, each traced to a specific failure:

| version | confirming question | reviewer facts problems | false alarms (29 fine) | note |
|---|---|---|---|---|
| v1 | "can both be true?" of the whole sentence | 3/9 | 0 | **invalid**: a prompt example was copied from a bench scene (salt-corpus-14) |
| v2 | "can both be true?" of the bare claim | 1/9 | – | "Halim is alive" (Ch1) vs "Halim is dead": *both can be true, he could have died since* |
| v3 | the facts are the story **so far**; a scene may show a change, not assume one never told | **3/9** | **0/29** | adopted |

The v2 answer is the real question, and the facts settle it: they are the
story so far, so a scene that takes a death for granted when the story never
told one contradicts it. A reasoning-first confirmation (write down what the
fact says and what the sentence assumes, then answer) caught more on probe
pairs (5/9 vs 3/9) but raised false alarms from 0/8 to 2/8 ("Élodie walked the
orchard one last time" flagged against the sale). It was not adopted: a false
alarm buys a rewrite.

Of the 6 misses, one (salt-corpus-07, "the debt Halim owed her") is a doubtful
label: the facts say Nesrin must repay *her debt* but not to whom, so a debt
Halim owes her is not ruled out. One (salt-corpus-25) is in dialogue that
names nobody from the facts, so the name filter never sends it.

*Held-out check.* The candidate was debugged on those 9, so 12 new
contradictions were planted, one per reviewer-fine scene, in varied wording
(a burial, a waved-through tax, a debt denied, doubled rations; two naming
nobody from the facts; `continuity_plants.py`). Every plant is flagged on its
own sentence, never elsewhere.

| on 12 planted contradictions | caught |
|---|---|
| old one-shot check (live, production code) | 4/12 |
| claims check v3 (bench, and the TypeScript port live: identical) | 4/12 |
| **both, merged** (live, production code) | **5/12**, no flag off the planted sentence |

They catch *different* plants: only the claims check finds the assumed death
("the only thing left of Halim after the sandstorm took him"); only the direct
check finds "with the doubled oxygen rations". So production now runs both and
merges what each confirms (`isolatedContinuity`, `useStoryCritic.ts`); each
(sentence, fact) is confirmed once. Neither plant naming nobody from the facts
is caught by either: the name filter is a known blind spot. Recall is still
low. The misses all die at the last step, the confirming question.

*Cost.* The critic took 4.9 minutes over the 12 planted scenes with both
checks, 1.2 with the direct check alone: about 18 seconds more per scene,
nearly all of it the claim extraction.

*Parked: contradictions inside one scene* (8 of the 17). Extraction flattens
actions into states ("the dying man collapses" → "the Worker is dead") and
merges people ("a worker" / "the Worker"), so a death followed by an action
vanishes before anything checks it. Written down, not built.

**Show-tell: extract-then-check is a negative result.** The candidate
(`tools/judge-bench/showtell_extract.py`) lists the sentences that name a
feeling, report a realisation, or summarise a moment, then asks of each "is
it also shown in the sentences around it?". A scene's score is its unshown
telling sentences per 100 sentences. All 77 bench scenes scored:

| | |
|---|---|
| separates reviewer problems from fine (AUC; 0.5 = chance) | 0.46 overall; 0.46 on the current pipeline (4 vs 34); 0.35 in the salt-corpus |
| pass mark chosen on the odd half (rate ≥ 25), tested on the even half | caught 11/15, false alarms **13/17** |
| masterpieces failed at that mark | **7/12** |

The masterpieces tell *more* than generated prose (median about 30 unshown
per 100, up to 79 for Wells). The reviewers' complaint is telling *at a moment
that matters*, not the amount of telling, and a rate cannot see which moment
matters. show_tell stays advisory; the candidate is not ported. A next
attempt would have to locate the scene's key moment first (from the brief's
"what changes") and judge only that passage, dramatised or summarised.

## 32. The four open items: research, then one bench each (2026-09-25)

A literature pass (FactTrack 2407.16347, ConStory-Bench 2603.05890,
FlawedFictions 2504.11900, ContraDoc 2311.09182, "Lost in Inference"
2411.14103, speaker verification 2405.10150, "Distinguishing Fictional Voices"
LaTeCH 2024, Underwood's narrative-time method) set one candidate per item.
Recurring finding: one direct question to a small model gives high precision
and very low recall (ContraDoc, GPT-4o-mini: P 89 / R 5.6); decomposing into
short checkable statements is what raises recall (FactTrack: R 5.6 → 62.8).
Ollama 0.34 returns token log-probabilities, so a probability threshold was
testable.

**Correction to §31.** Plant 11 of set A ("the grave … the only place the man
who ruled the Salt Road could not reach her") does not contradict "Halim is
alive"; it assumes it. Set A has 11 valid plants; merged production caught 5.

### Continuity: three confirming questions instead of one

A development set (`confirm_dev.py`) holds every (sentence, fact) pair that
reaches the confirming step on plant set A, the reviewers' 9 facts-type
scenes (pairs labelled by hand) and the 29 reviewer-fine scenes: 14
contradictions, 145 not. Held-out set B (`continuity_plants_b.py`) was
written before any experiment: 14 new contradictions and 6 hard negatives
(sentences that touch a fact and agree with it).

| confirmer (dev pairs) | caught /14 | false alarms /145 |
|---|---|---|
| C0 today: "the facts are the story so far … contradicts?" | 7 | 0 |
| C1 same, as A/B/C, read as P(A) | 7 at 0.5 (9 only at a threshold near 0) | 0 |
| C2 the fact spelled out first (what must be/have been true) | 8 | 0 |
| C3 the sentence spelled out first (what it states or assumes about the fact's topic) | 3 at 0.5; best ranking, AUC 0.94 | 0 |
| C4 both spelled out | 6 | 2 |
| **any of C0, C2, C3** | **9** | **0** |

Probabilities are near 0 or 1, so a threshold buys little. The traces
showed why C0 misses: the extracted claim it is shown often drops the part
that contradicts ("Lucie cried for a week" for "cried after she was told
about the sale"; "the tax-farmer waved Nesrin through" without "without
asking for salt"). C3 replaces the claim with the sentence's own spelled-out
assumptions; C2 spells out the fact. They catch different pairs.

Held-out set B, same code, run once:

| | contradictions caught /14 | hard negatives flagged /6 | flags off the planted sentence /20 |
|---|---|---|---|
| C0 | 6 | 0 | 0 |
| **any of C0, C2, C3** | **9** | **0** | **0** |

12 of the 14 plants reached the confirming step at all; the other two are
lost at matching (the doubled-rations plant of set A was also matched to the
wrong fact).

**Then the real scenes said no.** Ported to production (C0, then C3, then C2,
first "contradicts" wins; a JSON letter instead of log-probabilities) it
matched the bench on planted scenes, live: set B 9/14 with 0/6 hard negatives,
set A 9/11 valid (yesterday's code: 5). On the 78 real scenes, live:

| | yesterday | with the three confirmers |
|---|---|---|
| reviewer continuity problems caught | 3/17 | 4/17 |
| **false alarms on reviewer-fine scenes** | **0/42** | **3/42** |
| critic minutes, 78 scenes | 25.6 | 59.2 |

The new alarms are plainly wrong ("Lucie finally lifted her gaze" against
"Lucie has not been informed of the sale"; "You've changed things, Nesrin"
against "Nesrin begins documenting her findings"; "Halim warns her about the
salt's strange properties" against the fact that he did). Planted sets hide
this: a plant is blunt, and the clean sentences around it rarely sit close to
a fact, while real scenes are full of sentences that do. **Reverted**: one
confirming question, as yesterday. Lesson: a held-out *planted* set does not
measure false alarms on real prose; only the real clean scenes do.

### Contradictions inside one scene: partly solved, not shipped

| design | reviewer problems flagged /8 | masterpieces failed /12 | fine scenes failed /42 |
|---|---|---|---|
| W3 one scan per category for verbatim quotes (ConStory-style) | 0/7, stopped | – | – |
| W4 quotes collected per 3-paragraph chunk, one pair search, self-contradicting sentences | 3 (2 at the reviewers' place) | 2 | 0 |
| W4b = W4 with a stricter confirming question | 3 | **1** | **0** |

W3 failed as the research predicted for whole-scene prompts: on a 1,056-word
scene the model returned the one-word quote "dying" twelve times. The two
masterpiece alarms were a change of time (Joyce: "her mother was alive" then,
"dead" now) and a rhetorical line (Mansfield: "you won't bring a drunken
workman back to life"); the stricter question removed the second, and a
FactTrack-style "when is each true?" question rejected everything, true
contradictions included. W4b is real progress (0 → 2–3 of 8, 0/42 false
alarms) but fails Joyce and costs 4–9 calls per scene, so it is not wired
in. The masterpieces were used to tune W4b, so they are no longer a clean
control for it.

### Voice: a counting bug, and a negative result

Line-level blind attribution is near chance even for published novels, so
the candidate was style numbers per character (line length, questions,
contractions, person, hedges, 25 function words): between-character distance
over within-character spread (`voice_style.py`). Problems vs fine: **AUC
0.53**; the masterpieces score lower than generated scenes; only 4 of 12 have
three lines per speaker. With a scene's worth of dialogue it is noise.

The false fail was a counting bug. repair-run-04 has six quoted fragments,
exactly `MIN_VOICE_LINES`, but four speeches: a tag splits a speech in two
("You carry enough to feed a village," he said, "but …"). A fragment ending
in a comma or dash now continues into the next quoted fragment of the same
paragraph across a short tag (`extractDialogueLines`). On the 90 bench
scenes this drops 6 below the minimum, all voice-fine to both reviewers,
including the false fail; no reviewer voice problem or masterpiece changes.
Voice still catches none of the 5 reviewer voice problems. The live rerun
also showed the voice judge is unstable at the pass line: two scenes with
unchanged dialogue went from 7 (pass) to 5 (fail) between runs, one of them a
reviewer-fine scene. A score that flips at the threshold on identical input
needs a vote or a margin before it can fail a scene; that is the next voice
step.

### Show-tell at the key moment: also negative

The brief's "what changes" located the turning point (one line written per
masterpiece), then two questions: is the change shown, and how much story
time passes in it. "Shown": 11/12 masterpieces, 4/4 current problems, 12/12
current fine, so there is no signal. Words per story-minute separated the
current problems from fine scenes weakly (AUC 0.77, 4 vs 12) but the
masterpieces sit among the problems (median about 27), so any pass mark
that catches the problems fails most masterpieces. show_tell stays advisory.

## 33. Fixing what §32 left: two corrections, then two fixes that hold (2026-09-26)

**Correction 1: the continuity false alarms were a porting bug.** The three
confirmers were benched by reading the model's probability for "A"; the port
asked for the letter as a JSON field constrained to `"A" | "B" | "C"`. For
the same prompts, qwen3:8b's own P(A) for "Lucie finally lifted her gaze"
(against "Lucie has not been informed of the sale") was 0.0001, and the JSON
answer was "A". A constrained enum is not the model's most likely answer.

**Correction 2: the voice judge did not flip on identical input.** The two
"new" voice false alarms (salt-corpus-10, gate-off-run-03) had *changed*
input: the §32 dialogue fix merged their 8 fragments into 6 speeches, and fed
the merged speeches the judge scored both 5, with the same wording, on both
runs. The judge reacts to how lines are split. The fix removed one false fail
and caused two.

**Correction 3: the timings were contended.** Jester's scheduled tasks
(JesterNightly*, every 15-30 minutes) call the same qwen3:8b through
`/api/chat` with default options; each alternation with Versatile's calls
reloads the model (about 18 s per call in the Ollama log). The 59.2 minutes of
§32 is not a cost measurement. The runs below were made with the Jester tasks
paused (with the user's OK, restored afterwards).

### The fixes

1. **Probabilities, not JSON letters.** `ollama.choiceProbabilities` asks for
   one token with `logprobs` (non-streaming, `think: false`) and returns the
   normalised mass of the named choices, or null (AgentOps gateway, HTTP
   error, no choice among the top tokens). `aiChoiceProbabilities` runs it on
   the role's model, placement and lane; local Ollama only. The confirmers
   count an unreadable probability as "no". Smoke test:
   `src/tests/live/choiceProbe.live.js`.
2. **Speeches decide, fragments are judged.** `countSpeeches` joins a
   tag-split speech (within a paragraph, across a short tag) for the
   `MIN_VOICE_LINES` test only; the judge reads `extractDialogueLines`
   fragments as before.
3. The voice second vote added in between was removed: its only evidence was
   correction 2's misdiagnosis.

### Clean live results (Jester paused)

| | yesterday's code | now |
|---|---|---|
| reviewer continuity problems caught (78 real scenes) | 3/17 | 3/17 |
| continuity false alarms on reviewer-fine scenes | 0/42 | **0/42** |
| voice false alarms on reviewer-fine scenes | 1/37 | **0/37** |
| current-pipeline scenes failing the gate | 1/48 | **0/48** |
| planted set A (11 valid) | 5 | **7** |
| planted held-out set B (14; 6 hard negatives) | 6 (bench) | **9**, 0/6 negatives |
| critic minutes, set A (12 scenes) | 5.1 | 6.0 (+18%) |
| critic minutes, 78 scenes | – | 32.1 |

One flag in set B landed off the planted sentence, a false alarm: "Lucie's
laughter echoed somewhere behind the trees, light and careless" against
"Lucie has not been informed of the sale". So the extra confirmers are not
free of false alarms on sentences that sit close to a fact: 1 in 32 planted
scenes, 0 in the 42 real clean ones. On real scenes they have not yet caught
anything the single question missed; their gains are on assumed
contradictions (buried, sold, never owed), which the reviewer set has few of.

### Within-scene: still not shippable

The "then vs now" masterpiece alarm (Joyce) survives every confirming
question tried: with the surrounding passage (it also rejected all three true
positives), and as a probability (P = 1.0 for Joyce; one true positive
dropped to 0.002). The model reads "her mother was alive … then" and "that
was a long time ago … her mother was dead" as a contradiction. A second
masterpiece control was built for the next attempt
(`tools/labelling/build_masterpieces_b.py`: 12 passages chosen mechanically
at 35% and 65% through the same six books), and not yet run.

### Show-tell and pacing: what a fourth attempt needs

Three judge designs failed the masterpiece rule (§29-§32). On the current
pipeline the reviewers found 4 show-tell and 0 pacing problems in 48 scenes,
too few to calibrate anything. Both stay advisory. A further attempt needs
more labelled current-pipeline scenes first (at least ~20 problems per
dimension), not another judge.

## 34. "Names the wrong dimension", re-measured on today's gate (2026-09-26)

The first-day report listed: the combined critic passed 40/40 planted
defects; the focused one caught them but "often names the wrong dimension (a
scene turned into summary failed on voice)". §19-§25 fixed most of it; §31
made show_tell, pacing and emotional_goal advisory. Re-run on today's code:
the 30-scene planted-defect harness, one repeat
(`gate-sensitivity-focused-30-s34`), read by a new tool that separates the two
costs of a wrong label (`tools/gate-blame.py`): a wrong **fail** (a gating
dimension, continuity or voice, under the floor that is not the defect's
target) re-writes a scene for the wrong reason; a wrong **warning** (an
advisory one) only tells the author the wrong thing.

| defect | n | target flagged | scene failed | wrong fail | wrong warning (dimensions) |
|---|---|---|---|---|---|
| voice_flatten | 25 | 18 | 20 | 0 | 11 (show_tell 10, emotional_goal 5, pacing 2) |
| told_not_shown | 30 | 28 | 2 | 0 | 30 (pacing 29, emotional_goal 25) |
| told_faithful | 30 | 23 | 4 | 1 | 11 (emotional_goal 8, pacing 3) |
| padding | 30 | 30 | 5 | 1 | 4 |
| contradiction | 30 | 30 | 30 | 1 | 8 (pacing 6) |

* **A scene turned into summary no longer fails on voice**: voice was not
  pushed under the floor on any of the 60 summary variants. The summary
  defects now fail 6/60 scenes (on gating dimensions they already failed
  clean), and are *flagged* on show_tell 51/60.
* **Wrong fails: 3/145.** Two are one scene's voice (scene 10: 7 clean, 5 on
  the padding and contradiction variants, whose dialogue is identical), one
  a continuity flag on a machine-written summary line ("missing him and
  feeling his absence" against "Halim is alive").
* **The "clean" corpus is not clean.** 4/30 clean scenes now fail on
  continuity; all four are real: scenes 9 and 14 ("before he died", "since
  the day Halim died") and 6 (the dying man) are reviewer-consensus
  continuity problems (§29), 21 ("the mule's still body" against "gravely
  injured") had one reviewer's "problem". The gate of §25 scored all four 8.
* **Most remaining wrong warnings are right by construction.**
  told_not_shown replaces paragraphs with content-free sentences, which are
  filler and gut the emotional beat, so pacing and emotional_goal *should*
  drop (the harness says so, §20). The ones that are wrong -- show_tell on
  flattened voices (10), emotional_goal on faithful summaries (8) -- are on
  advisory dimensions whose judges have no signal on real scenes (§29-§32).
  They are left as they are.

**Voice at the pass line.** Temperature was the obvious suspect (the voice
judge sampled at 0.3, every other focused judge at 0). A probe of the voice
judge alone (`src/tests/live/voiceTemperature.live.js`, production prompt
and options) says no: scene 10's dialogue scored 7 five times out of five at
both temperatures, and temperature 0 added one false alarm on 31
reviewer-fine scenes (0.3: 0/31; flattened voices caught 29/43 vs 28/43).
The 7 -> 5 drop inside the full run does not reproduce in isolation; it is
run-to-run nondeterminism of the inference engine, not sampling.
No margin rule separates it either: voice scores come in steps (clean 7 or 9;
flattened 2, 3, 5 or 7), and 5 is where 11/29 real flattened voices land.
Nothing changed; recorded as a known 2/145 wrong-fail source.

## 35. The plan's remaining steps (2026-09-26)

Section 7 of the report lists the plan. Steps 1-2 are done (§28-§31), step 4
is mostly moot since §31 (the dimensions it would filter only warn). This
section covers step 8 (small fixes), step 3 (emotional goal), step 5
(contradictions on real prose) and step 6 (repair vs rewrite).

### Step 8a: the Editor answers only legal moves

The agentic Editor (LangGraph path, `qwen2.5:3b-instruct` on CPU in the
multi-agent preset) answered with a fixed schema: `action` any of six,
`target` any integer or null. Every model decision in the two earlier agentic
runs was illegal (`commit` with no target, `critique #1` not offered) and fell
back to the workflow. A 2x2 book run no longer exercises it at all: with the
gate passing almost every scene each step has one legal move per lane and the
model is never asked. So a probe asks it on 24 run states that do have
choices (`src/tests/live/editorLegality.live.js`):

| answer schema | legal answers |
|---|---|
| v1: fixed (any action, any target) | 7/24 |
| v2: each lane an enum of its legal moves | 11/24 (0 illegal moves; 13 put one scene on both lanes, "revise #1" + "commit #1") |
| **v3: one enum of legal (gpu, cpu) pairs** | **24/24** |

`buildEditorSchema` now builds one `plan` enum per call from `legalPairs`
(pairs that would put one scene on both lanes are left out), the prompt lists
the plans, and `validateEditorAnswer` reads a plan back (the old shape still
validates). With the plans listed in the prompt, even the v1 schema reaches
20/24: listing the options does most of the work, constraining the answer
closes the rest. `EDITOR_PROMPT_VERSION` is `editor-v3`.

### Step 8b: a retrieval eval that can fail

`scripts/evaluate-scene-retrieval.js` scored MRR 1.0 because it is circular:
its "relevant" scenes are chosen by the same TF-IDF cosine it ranks with,
over documents built from genre keyword lists. `tools/retrieval-eval/
fact_retrieval.py` asks what production does -- rank a book's earlier scenes
by embedding similarity to a query -- with ground truth the retriever does not
define: the 40 ledger facts of the 30-scene Salt Road corpus as queries, the 3
scenes of the fact's chapter as relevant, 27 same-book scenes as hard
negatives.

| docs | scorer | MRR | hit@1 | hit@3 |
|---|---|---|---|---|
| summary | BM25 | 0.449 | 0.28 | 0.55 |
| **summary** | **nomic-embed-text (production)** | **0.671** | 0.60 | 0.68 |
| summary | nomic + task prefixes | 0.608 | 0.47 | 0.65 |
| summary | snowflake-arctic-embed2 | 0.594 | 0.45 | 0.68 |
| prose | nomic-embed-text | 0.607 | 0.50 | 0.65 |

Chance is about 0.21. Production's choices (summaries, nomic, no prefixes)
are the best of those tried; the nomic task prefixes, which production omits,
do not help here (40 queries: a 0.06 difference is 2-3 queries). The old
script now says in its header that it is circular.

### Step 8c: the spine as written, and a lost-facts bug

The chapter spine is generated from the outline before any prose exists and
was compressed once, so every scene was written against what earlier
chapters were *planned* to do. (The fact ledger already switched to facts
lifted from prose.) `spineContextFromProse` now gives each draft the chapters
before its own as written -- the closing written scene's summary and the facts
from its prose -- and the rest as planned; later chapters stay planned even
when the anchor-first writer has already drafted their anchors, so nothing
leaks backwards. The scene gate builds it per scene (`spineArray` was already
in its context).

Found on the way: the continuity fix-rewrite (`ConsistencyService.
rewriteSceneForConsistency`) rebuilt the scene record without `chapterId` and
`keyFacts`, so every scene a continuity fix touched dropped out of the fact
ledger, the writer's established facts and the spine. It now keeps them
(the rewrite's own facts when it returns some). Regression test
`consistencyRewriteKeepsFacts.test.js`, mutation-checked.

Live check (2026-09-27, `saltRoad.live.js` 2 chapters x 3 scenes, alone on
the GPU): 3 writer prompts carried the "WRITTEN SO FAR" block, chapter 1 as
its prose summary ("Nesrin investigates the poisoning of a mule near the Salt
Road...") and its lifted facts, then chapter 2 as planned. The harness now
records `spineWrittenPrompts` and a sample in `wire.json`.

### Step 3: emotional goal as a reader's multiple choice (advisory)

The 1-10 emotional_goal judge was a near-constant 7. The replacement asks
"what will a reader most likely feel by the end?" among the brief's goal and
three alternatives written from the brief alone (a different feeling, same
characters), and reads the right letter's probability
(`buildEmotionChoicePrompt`, `aiChoiceProbabilities`). A first bench drew the
wrong answers from "other stories" by id prefix -- but gate-*, repair-run and
graph-repair-run are all Salt Road books, so they were other Nesrin goals and
often just as true; drawing from genuinely other stories only tests names.
Same-scene alternatives fixed that (`tools/judge-bench/emotion_mcq.py` v2:
AUC 0.84). Live in production code on the 78 and the masterpieces:

| | 1-10 judge | multiple choice |
|---|---|---|
| reviewer emotional-goal problems flagged | 1/10 | **6/10** |
| reviewer-fine scenes flagged | 2/45 | 9/45 |
| masterpieces flagged | 4/12 | **1/12** |

It stays advisory (0/48 current scenes fail either way); its warning names
what a reader would feel instead. Several "false" flags are honest ambiguity
(Ethan Frome: "Ethan's guilt and the weight of his past" is a fair reading).
When probabilities cannot be read it falls back to the 1-10 judge.

### Step 6: repair in place vs a full rewrite

`src/tests/live/repairVsRewrite.live.js`: the 30 corpus scenes with the
planted contradiction plus the 4 corpus scenes that fail on their own text,
each fixed from the same verdict both ways.

| | repair (prompt at the time) | full rewrite |
|---|---|---|
| passes afterwards | 20/33 | **32/34** |
| time to fix (median) | **1 s** | 69 s |
| original words kept | 100% | ~60% |
| still failing on | continuity, 13/13 | 1 voice, 1 continuity |

Every failed repair had one cause: "change as little as possible" produced
"Halim had been leading a caravan for two years by then, buried past the
salt flats". A follow-up (`repairPromptV2.live.js`) on the same verdicts:

| repair prompt | passes | sentences deleted | real (4) passing |
|---|---|---|---|
| minimal change (was production) | 20/34 | 0 | 2 |
| nothing may state or imply the contradicted fact | 31/34 | **32** | 3 |
| **same, rewrite rather than delete (now production)** | **31/34** | **0** | 3 |

The middle wording deleted the planted sentence (correct: it is nothing but
the contradiction) and also a real scene's opening line (wrong). The adopted
one keeps the sentence: "Halim had been traveling the Salt Road for two years
by then, leading a caravan..."; "since the day Halim died" -> "since the day
the caravan left". It was chosen on these same 34 (4 real), so a blind
quality read of repair vs rewrite follows as the independent check.

Found while running these: two live runs hung for good (a request accepted by
Ollama and never answered, GPU idle, no timeout because time limits ship
off), both while two clients alternated `num_ctx` on one model and forced a
reload on every switch. Flagged as a separate task (a liveness guard that
never kills a slow healthy call).

**Blind quality read.** For the 30 scenes where both the adopted repair and
the rewrite pass the gate, two independent reviewers per scene (Claude
agents, method hidden, A/B order randomised, key kept outside the repo)
judged which is the better scene and whether the contradiction is really
gone (`reports/live/repair-review/`):

| | repair in place | full rewrite |
|---|---|---|
| better scene, both reviewers agreeing (agree on 25/30) | 11 | 14 |
| contradiction really gone (reviewer 1 / reviewer 2) | **28 / 27** of 30 | 24 / 24 of 30 |
| time to fix | ~1 s | ~69 s |

Quality is close to a tie with a slight lean to the rewrite, and the repair
removes the contradiction more reliably: six rewrites passed the gate while
still contradicting the facts. The plan's rule was "keep repair only if it
wins or ties at lower cost"; it ties at about 1/70 of the cost, so the gate
keeps repairing first and rewriting only when the repair fails. What the
reviewers caught that the gate did not: real-14's repair kept "the road that
claimed him" and "Halim's memory" (a death still implied), real-21's "the
animal's still body" sits badly beside "the mule stirs, weakly". The next
repair iteration should look at the whole paragraph, not the one sentence.

### Step 7: do gated books read better? Answered at the scene level

The plan's last step was 3-4 small books with the gate on against 3-4 with it
off, read blind. Not run, by decision (2026-09-27): the gate now intervenes
rarely. In the three latest live books every scene committed as `generated`
and the whole set saw one in-place repair; on the 48 current-pipeline scenes
of §29 the gate fails none. Two books that differ in one scene in ten or
fifteen cannot show a difference with four pairs, and a null there would say
nothing. What the gate does, it does at the scene level, and that is
measured:

* where it intervenes it is right: continuity failures on the corpus are
  real contradictions (§34), and it raises no continuity or voice false
  alarm on the 42/37 reviewer-fine scenes (§33);
* its fix works: the adopted repair passes 31/34 and, read blind, removes
  the contradiction in 27-28/30 against a rewrite's 24/30, at similar
  quality and ~1/70 of the time (step 6);
* it no longer damages good prose: masterpieces failing 11/12 -> 0/12 (§31).

So the honest answer is: a gated book differs from an ungated one in the few
scenes that carried a contradiction or flat dialogue, and in those scenes the
gated version is better. Whether that is visible to a reader over a whole
book is not measurable with the runs a single GPU can afford.

### Step 5: contradictions in real prose (ConStory-Bench)

ConStory-Bench (arXiv 2603.05890, MIT): one model's file,
`evaluations/gpt4o_1120.csv` (21 MB, downloaded with the user's OK to the
gitignored `reports/live/constory/`), 2,000 GPT-4o stories of about 1,300
words, each with the ConStory-Checker's findings (exact quote and the quote
it contradicts). The labels are an LLM checker's, not human. The
within-scene candidate W4b (§32) read 20 English stories with a finding in a
"state" category (memory, knowledge, appearance, quantity, name, time,
geography; both quotes found verbatim) and 20 with no finding at all
(`tools/judge-bench/constory_within.py`, seed 20260926):

| | flagged | flagged at the labelled quotes |
|---|---|---|
| stories with a finding (20) | 1 | **0** |
| stories with none (20) | 0 | 0 |

So on natural contradictions in someone else's prose it finds essentially
nothing (0/20 located, 95% range 0-16%), while raising no false alarm (0/20).
That fits §32 (2-3 of 8 on our own scenes) and the research (whole-document
checking by an 8B model is near chance, FlawedFictions). Within-scene
contradiction detection stays unshipped; a step up would need a stronger
model or a trained checker, not another prompt.

### Where section 7 of the plan stands

| step | status |
|---|---|
| 1 labelled real scenes | done (§28-§29); the user's own 12 still unlabelled |
| 2 show-tell | negative three ways; advisory (§31-§32) |
| 3 emotional goal | reader's multiple choice, advisory (this section) |
| 4 off-topic evidence filter | moot since §31 (those dimensions only warn) |
| 5 contradictions on real prose | measured: within-scene 0/20 located, 0/20 false |
| 6 repair vs rewrite | repair stays first: ties on quality, resolves more, ~1/70 the time |
| 7 gated vs ungated books | answered at the scene level (the gate intervenes ~1 in 10-15 scenes) |
| 8 small fixes | Editor 24/24 legal, retrieval eval that can fail, spine as written, lost-facts bug |

## 36. Hardening, and whether a quadtree would help the canvas (2026-09-27)

**Lost-request guard** (`ollama.ts`, f6366958). With time limits off (the
default) `resolveTimeLimit` returns 0 and every provider timer is disabled,
so a request Ollama accepted and never answered hung forever -- two live runs
on 2026-09-26/27, while another client forced model reloads by alternating
`num_ctx`. A request that has produced *nothing* for 10 minutes is now
aborted and sent once more (`OllamaLostRequestError`); once a token has
streamed the request is never cut. `choiceProbabilities` gets the same
ceiling. Four fake-timer tests; removing the guard fails them.

**Quadtree: no.** The Story Network is Vue Flow (DOM nodes, SVG edges): the
browser does hit-testing, and `only-render-visible-elements` culls with a
linear `getNodesInside`. The only O(N^2) loop is the overlap pass after
"Arrange" (`StoryNetwork.vue`, 5 passes over ungrouped nodes, once per
click). Real networks are ~20-150 nodes, 3-15 groups. Micro-benchmark
(Node 24, 160x96 nodes at constant density; microseconds):

| N | viewport, loop | viewport, tree | tree build | close pairs, loop | close pairs, tree incl. build |
|---|---|---|---|---|---|
| 50 | 1.6 | 1.7 | 102 | 7 | 233 |
| 150 | 2.4 | 3.6 | 85 | 78 | 259 |
| 500 | 5.3 | 2.5 | 302 | 894 | 1,064 |
| 5,000 | 47 | 3.8 | 11,333 | 76,328 | 21,441 |
| 50,000 | 1,808 | 6 | 232,432 | -- | 433,196 |

The tree wins from ~1,000 nodes for pairs and ~5,000 for viewport queries
once its (re)build is counted; at our N the loops are under 1% of a frame.
Revisit only with thousands of canvas items or a live force layout, and then
use `d3-quadtree`/`rbush`, not a hand-rolled tree.

**Found while auditing the hit-tests** (f6366958): node drag, drag highlight
and drop tested the node's absolute position against `group.x/y`, which are
parent-relative for nested groups, and took the first match rather than the
innermost -- only group re-parenting did it right. Now all use
`innermostGroupAt` (`utils/networkGrouping.ts`, absolute box, smallest
wins). `handleDrop` subtracted the Vue Flow root's rect and then called
`screenToFlowCoordinate`, which subtracts it again (the handler is bound on
that root), so every sidebar drop landed offset; it now passes client
coordinates. A group dropped into a group now sets `parentGroupId`. The
`storyCanvasMap` upload test's fixed 20 ms FileReader wait became
`vi.waitFor`. Suite 3,062 pass.

Still open: within-scene contradictions (needs a stronger model or a trained
checker, §35) and the user's 12 labels.

## 37. What If on any novel: import, read, branch (2026-09-27)

Plan: `docs/WHATIF-AND-IMPORT-PLAN.md`. Four steps, each measured on the six
Project Gutenberg books in `reports/live/masterpieces/raw/`.

**1. Data integrity (2c10308b).** Rows without a branch are adopted by main on
open; a fork copies the book (and, from 4a, its knowledge) with a
`sourceSubsectionId`/`sourceSectionId` link on every copy; deleting a branch
removes its rows; the recovery backup covers every table and never clears one
the backup lacks (the old list had no chapters or scenes, so a restore deleted
all prose); the JSON import remaps every reference.

**2. Import (2964895c).** txt/md/docx/epub/html, no new dependency. Chapters
from headings, else the book's own contents page, else numbered headings;
scenes at the author's breaks. All six books: right chapter count and titles,
every word accounted for (scenes + front/back matter + headings = total).

**3. Reading the book (f352ea15).** Per scene: summary, POV, place, cast, key
facts, relationships, from the local model; then names/places resolved across
the book and each scene fed through the writer's own sync path (bible,
chapter-stamped edges, `ok` digests). Ethan Frome, 34,787 words: 10.8 min
end to end; 7 characters, 21 places, 15 links. The first live read found eight
defects (duplicate digests from stringified ids, a second concurrent run,
bracketed names, "Ned" merged into "Mrs. Ned Hale", generic places, one-scene
family misreadings, label churn, a link dropped for a person not yet in the
bible) and a speed bug (background calls waited out their own 30 s foreground
linger: 16 -> 10.8 min).

**4. What If as a branch (e349f5fc, 2e6ed6bd, and this section's fixes).**
Story knowledge per branch (schema v55). Fork at the scene, plan, write with
the continuation writer against the story up to the change, check kept scenes
with the critic and repair them, compare and merge with snapshots.

The planner took three live attempts on Ethan Frome ("What if Zeena never goes
to Bettsbridge, and stays home the night Ethan and Mattie were to be alone?"):

| attempt | how | what came back |
|---|---|---|
| 1 | one call plans every later scene | every scene after the change dropped; scene V's brief "free from Zeena's presence" contradicted the change |
| 2 | one-letter A/B/C per scene, read from probabilities | "as written" at p = 1.00 for all 7 scenes, including the evening that only exists because Zeena is away; same answer with the options reordered (not position bias -- no reasoning) |
| 3a | reason first (needs -> conflict -> action), briefs see the alternate version so far | decisions sensible; every brief from V on a copy of the first ("a charged, intimate moment in the kitchen") |
| 3b | briefs see only the change and their own original scene | each brief grows from its own scene (the hired girl, the money, Mattie leaving alone -- no sled crash) |

So: one question per call (as in the gate work, §16-17); a question that needs
reasoning must be allowed to reason before it answers (a one-token read works
for look-ups, §33, not for this); and a small model anchors on any example it
is shown, so a per-item prompt must not show the other items' answers. Two of
seven briefs still contradicted the change after 3b; the plan is editable for
exactly that, and the live run used two author edits.

## 38. The three open items from §37 (2026-09-28)

**The recheck on the live Ethan Frome branch** (6 rewritten scenes read, 7
scenes after the change checked, 16 min): the kept epilogue was caught
(contradictions with the new ending; the sentence repair could not be placed,
so it is marked `review`). Rewritten chapter VIII ("Zeena's absence…",
"after Zeena left") passed.

**Writing statistics counted imported books as writing** (the workspace
showed 312,896 words "this week" for six test imports). `useWritingStats`
derived each day's output as the growth of a project's total from 0, so an
import day counted the whole book, and inflated the streak and best day. The
import now stores `importedWords` and the statistics start an imported
project from it (projects imported earlier: from their first recorded day).

**The stated change was too narrow.** The planner reduced "stays home the
night Ethan and Mattie were to be alone" to "stays home instead of going to
Bettsbridge". `chooseDivergenceFact` keeps the model's wording only if it keeps
>= 70% of the premise's content words, else uses the premise itself as a
statement. Kept -- the stated change is now what the author wrote -- but it
does not rescue chapter VIII (below).

**Name matching in the focused continuity check, measured before changing.**
The check reads only sentences naming a character as the bible spells it
("Ethan Frome"), plus capitalised words from the facts it is given. Measured
on the ORIGINAL Ethan Frome chapters I-VIII (clean text; each against the
true facts of the chapters before it) and on the branch's chapter VIII:

| names | sentences checked (clean I-VIII) | false alarms (clean) | branch VIII vs full premise |
|---|---|---|---|
| full bible names (kept) | 429 | 0 / 8 | 50 checked, 0 flags |
| + first/last names, aliases | 453 (+6%) | 1 / 8 | 52 checked, 0 flags |

First names mostly reach the check already through the facts; widening added
one false alarm and no catch, so it was not shipped. The 18-of-257 figure in
§37 was chapter VIII against the one-sentence change alone.

**Why chapter VIII passes, even against the full premise:** it is not a
contradiction of the premise. The premise fixes one night; chapter VIII is a
later day. "After Zeena left" contradicts the branch's own continuity (the
rewritten chapters keep her at home and nothing shows her leaving), and no
fact states "Zeena is still at home". A fact-contradiction check cannot see a
missing event. Catching this needs a check on who is where across scenes
(the entity-state timeline), not another prompt -- backlog. Until then the
compare screen, which shows every rewritten scene before a merge, is the
safeguard.
