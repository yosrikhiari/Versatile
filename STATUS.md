# Versatile — Verified Status

> Ground-truth snapshot of the novel-generation pipeline and tech-debt state,
> verified against the live codebase (not aspirational). Supersedes the former
> `PIPELINE-PLAN.md` and `CLEANUP-PLAN.md`, which described as "to-do" a large
> body of work that is in fact already built and passing.
>
> Health at last check: `npm run build` passes; **1092 unit tests pass** (107 files).

---

## Novel-generation pipeline — ~90% built

The end-to-end path is `useNovelPipeline` wrapping `useVolumeStoryGenerator`.
The declared DAG: **bible → network → structure → spine → prose → consistency**
(`PIPELINE_DAG` in `src/composables/useNovelPipeline.js`).

| Stage / concern | State | Where |
|---|---|---|
| **Schema v2 & status** | ✅ Done | `genRuns.state.version===2`, `generationStatus`, `canonLocked`, `contentStatus` |
| **DAG orchestrator + resume-from-stage** | ✅ Done | `useNovelPipeline.js` |
| **Story Bible (chars ∥ locs → threads)** | ✅ Done | `useEntityBootstrapper.js` |
| **Story Network (typed edges)** | ✅ Done | `generation/generators/relationships.js`, `StoryNetwork.vue`, `utils/networkGrouping.js` |
| **Structured output** | ✅ Done | `generateStructured` in `aiService.ts` + all providers |
| **Spine (cross-volume, degrade-and-continue)** | ✅ Done | `generateSpine` / `fallbackSpineEntry` in `useVolumeStoryGenerator.js` |
| **Prose (hybrid parallel)** | ✅ Done | `runParallelGeneration` |
| **Embedding-similarity retrieval (25+ scenes)** | ✅ Done & wired | `buildRetrievalContext` (4 call sites); Ollama or Mistral embeddings, prose fallback |
| **Enrich from prose (sync-preview)** | ✅ Done | `useChapterGenerationSync.js` |
| **Per-chapter + final contradiction audit** | ✅ Done | `critic.checkContradictions` (per-chapter and final) |
| **Canon lock after Stage A** | ✅ Done | `canonLocked` in `useEntityBootstrapper.js` |
| **End-of-run repair pass** | ✅ Done | `repairFailedScenes` |

### Partially built / remaining (pipeline)
- **Fact ledger → auditor: DONE.** `buildFactLedger(spine)` accumulates the
  spine's per-chapter `keyFacts` (who's alive/injured/where, who knows what) into
  an ordered canon ledger, now fed into `checkContradictions` so the auditor
  flags prose that contradicts established canon.
- **Fact ledger ← prose: NOT done.** The ledger is built from the spine's
  *planned* keyFacts, not reconciled against what the prose actually generated. A
  future pass could extract durable facts from written chapters and merge/correct
  the ledger, so plan-vs-prose drift is caught. Lower urgency now that the
  audit-against-canon half exists.
- **Full transactional atomicity** — batch inserts exist for graph edges
  (`addGraphEdgesBatch`) and char relationships, but not all stage writes are
  wrapped in `db.transaction`; no `addCharactersBatch` / `addSectionsBatch`.

---

## Tech debt

### Done this cleanup pass
- ✅ Removed unused `shaders` dep; Gemini key moved to header (prior work).
- ✅ Gated the hardcoded test-user seed behind `DEV_MODE` (db-core.js).
- ✅ Retired dead `useStoryOrchestrator.js` (a second, unused scene generator).
- ✅ Eliminated all 28 silent `catch {}` blocks (8 now warn, 20 documented).
- ✅ Repo hygiene: dotnet run output + scratch `TestApi/` gitignored/removed.
- ✅ **Recovered 35 test files** that a blanket `src/tests/` gitignore had silently
  dropped from version control (they ran locally but were never committed).
- ✅ **Backend `ApiControllerBase`**: hoisted the `UserId` claim extraction out of
  34 controllers (`Auth`/`ApiKeys` excluded). Builds clean; 21 backend tests pass.
- ✅ Circular dep `manuscriptStore` ↔ `projectStore` was **already mitigated** —
  `projectStore` imports `manuscriptStore` via lazy `await import()`. No action.

### Remaining — each needs a human-in-the-loop step, not blind execution
- **`StoryGeneratorPanel.vue` split — in progress (1883 → 1800).** Two cleanly-
  separable script blocks extracted into tested composables (`useResearchScope`,
  `useGenerationHistory`). Remaining: the generation-orchestration core (coupled
  to panel streaming refs) and the ~1244-line template → child components. Those
  carry real Vue regression risk that build + unit tests won't catch, so they
  need a runtime smoke test through the logged-in generator flow.
- **Fact ledger ← prose.** The structured writer emits no durable facts, so this
  needs a design decision first: extend the writer's output schema vs. add a
  per-chapter extraction pass (each has real cost on the working pipeline).
- **Full transactional atomicity.** Subtle: a Dexie transaction can't stay open
  across the `await` to an AI enrich call, so the bootstrapper must be split into
  compute-then-batch-write phases before `db.transaction` wrapping is safe.
- **Dexie schema compaction.** Low value, HIGH data-loss risk (every migration
  restates the full table set). Do only in a dedicated pass with a migration-test
  harness — not worth the risk otherwise.

---

## Known latent items
- `commitAndStoreScene` chapter grouping: the old `Math.floor(i/3)` assumption
  was replaced with real `chaptersWithScenes` grouping. ✅
- Name→ID silent drop in relationship building: fixed via name reconciliation in
  `buildRelationshipEdges`. ✅

---

## Error taxonomy (in force)
- **Transient** (network/5xx/timeout): retry w/ backoff, then demote.
- **Permanent** (401/403/bad key/missing model): abort the *stage*, keep committed work.
- **Content** (bad JSON, failed critique, empty prose): bounded repair →
  degrade-and-continue → mark `failed`; never halt the run. Quality-floor abort
  at 3 consecutive; `SCENE_MAX_ATTEMPTS = 2`.
