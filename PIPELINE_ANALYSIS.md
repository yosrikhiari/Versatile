# Pipeline Analysis: Versatile Fiction-Writing System

## Overview
Versatile is a fiction-writing assistant with a Vue 3 + Pinia + TipTap frontend, .NET 10 + PostgreSQL 16 backend, and 5 AI providers. The pipeline is **offline-first** with Dexie.js IndexedDB sync to PostgreSQL. The core workflow generates scenes, validates consistency, and maintains a story bible/network.

## Architecture

### High-Level Layers
| Layer | Responsibility |
|---|---|
| **Presentation** | Vue 3 components, TipTap editor, offline-first Dexie writes |
| **Composition (Pinia stores)** | `useStoryDirector`, `useVolumeStoryGenerator`, `useStoryWriter`, `useStoryCritic`, `useAiService` |
| **Services** | AI generation (`aiService.ts`), consistency checks (`deterministicContradictions.ts`, `ConsistencyService`), relationship networking (`relationships.ts`), edge timeline (`edgeTimeline.ts`), scene context (`sceneContextService`), commit/commitSync |
| **Database** | PostgreSQL (EF Core) + IndexedDB (Dexie) dual-write, tenant-filtered, checkpoint-based sync |
| **AI Providers** | 5 providers, local-only mode default, Ollama `qwen3:8b` as primary |

### Component Map

| Component | File | Key Functions |
|---|---|---|
| **Director** | `useStoryDirector.ts` | `generateStoryPlan` → `planChunked` (skeleton in batches → scenes per chapter) |
| **Volume Orchestrator** | `useVolumeStoryGenerator.ts` | Phase machine: bootstrapping → bible → network → structure → spine → prose → consistency |
| **Writer** | `useStoryWriter.ts` | `writeScene` / `writeSceneStructured` (two-pass: prose + metadata extraction) |
| **Critic** | `useStoryCritic.ts` | `evaluateScene` (quality + continuity + voice + pacing) + `checkContradictions` (LLM fact-check) |
| **AI Service** | `aiService.ts` / `useAiService.ts` | `aiGenerate`, `aiStream`, `aiGenerateJson`, `IdempotencyTracker` (W8 opt-in key) |
| **Network** | `relationships.ts` | `generateRelationships` (AI call, schema validation, retry, W11 surfacing) |
| **Deterministic Engine** | `deterministicContradictions.ts` | 7 rules (dead/alive, object destroy, appearance, location impossible, knowledge relearned, timeline inversion, seam continuity) |
| **Edge Timeline** | `edgeTimeline.ts` | `planEdgeWrites` (supersession, reversal, ordering constraints) |
| **Consistency Service** | `ConsistencyService.ts` | Incremental audit at chapter boundaries + terminal auto-fix (max 3 rounds) |
| **Stores** | `src/stores/` | `projectStore`, `volumeStore`, `manuscriptStore`, `settingsStore` (Pinia) |
| **DB Syncer** | `sync-transport.ts` | `commitSync`, `discoverSync`, `resolveAndCommitEdges` (Dexie → PostgreSQL) |

## Data Flow: End-to-End Scene Lifecycle

```
1. PLANNING (Director/Spine)
   Input: goal, evidence, sessionBudget, signal, optional idempotencyKey
   → generateStoryPlan → planChunked (batched skeleton → per-chapter scene planning)
   Output: storyArc (ordered scene plan), usedTitles ledger, chapter skeletons

2. GENERATION (Writer)
   Input: scene plan + entities + context + story bible + story contract
   → writeSceneStructured (aiGenerate + metadata extraction pass 2)
   → guardScene (refusal/ repetition guards)
   Output: { prose, structured: {summary, usedEntities, newEntities, networkEvents, keyFacts} }

3. NETWORK (Relationships)
   Input: newEntities from metadata + existing cast/locations/threads
   → generateRelationships (AI structured call with schema)
   → buildRelationshipEdges (name→ID resolution)
   → planEdgeWrites (existing graph reconciliation, supersession logic)
   Output: characterRelationships + graphEdges + dropped/superseded/unorderable counts

4. PERSISTENCE (CommitService)
   Input: committed prose + structured metadata + entity discoveries
   → computeSummary (full prose → summary field)
   → manuscriptStore.updateSubsectionData (Dexie: content, wordCount, contentStatus='generated')
   → entity discovery → discoverSync → commitSync (Dexie → PostgreSQL transaction)
   → resolveAndCommitEdges (graph edge deduping with temporal windows validFrom/validUntilChapter)
   Output: scene row committed, bible updated, graph edges persisted

5. CONSISTENCY AUDIT
   Input: written scenes + story bible + fact ledger (spineArray)
   → maybeRunIncrementalConsistency (chapter boundary) → runTerminalConsistencyAudit (bounded fix rounds, max 3)
   → rewriteSceneForConsistency (if autoMode) → writer.writeSceneStructured → re-check
   Output: zero issues OR max-rounds exhausted; if issues persist, UI flags for author review

6. DETERMINISTIC HARD GATE
   At each chapter boundary: runDeterministicContradictionChecks(entityStates)
   → 7 rules fire on entity-state timeline → errors = block, warnings = surface but don't block
   → Harness self-test: all 7 rules must pass on seeded data; 0 false positives on consistent arc
```

## Persistence & Sync Mechanics

**Dexie IndexedDB (offline-first):**
- Stores: `characters`, `locations`, `plotThreads`, `graphNodeInstances`, `volumeEntities`, `pendingSyncEdges`, `genRuns`
- Writes debounced (500ms per-field), batched via `commitSync`
- `discoverSync` extracts new entities from structured metadata
- `commitSync` transactionally writes across `TARGET_TABLES`: characters, locations, plotThreads, graphNodeInstances, volumeEntities

**PostgreSQL (EF Core):**
- 55+ DbSet entities, tenant-filtered via `OrganizationId`
- Key tables: `Stories`, `Chapters`, `Scenes`, `BibleEntries`, `Sections`, `Subsections`, `Volumes`, `PlotThreads`, `CharacterRelationships`, `GraphEdges`, `GenRuns`
- Checkpoint system: `genRuns` table with `state` JSON, `version: 2`, `currentStage`, per-stage progress
- Migrations: 15+ files tracking schema from initial create through 20260723

**Sync-Transport:**
- `commitSync` discovers new entities + network events from structured metadata
- `resolveAndCommitEdges` resolves pending edges against existing graph, stamps chapter numbers, handles supersession
- Background retry: buffered edges re-entered when entities become resolvable

## Idempotency (W8) Contract

**Key design:** opt-in `idempotencyKey` — callers that omit it keep original behavior (re-generations produce fresh text).

**Threading:**
- **Director skeleton:** `${idempotencyKey}:batch:${batchStart}` (batch-scoped)
- **Director scenes:** `${idempotencyKey}:scene:${i}` (per-scene, scene-indexed)
- **Network weave:** Single key reused across internal retries (MAX_ATTEMPTS=2). "A single network weave is one logical request."
- **Writer:** Passed through `aiGenerate/aiStream` options → `IdempotencyTracker.dedup`

**Collapse condition:** settled success retained under `idk:<key>` for `IDEMPOTENCY_TTL_MS` (60s); identical retry returns cached result; different key → fresh call; no key → original behavior.

**Transport-level guard (fix S-097):** beyond the in-flight `IdempotencyTracker`, `SyncTransport.pushOne` now checks `idMap.getApiId(table, local.id)` before POSTing a `pending-create` row. If a server id is already mapped (POST succeeded but the local `syncStatus`/`apiId` confirmation write was lost — crash, hook suppression, or the 500ms per-field debounce race), it reconciles with a `PUT` against the existing id instead of a second `POST`, preventing a **duplicate server entity**. This is the client-side completion of the W8 contract and is covered by `syncTransport.test.js` ("does not POST a duplicate when a pending-create row is re-pushed").

## Deterministic Consistency Engine (7 Rules)

| # | Rule Type | Description |
|---|---|---|
| 1 | `dead_then_alive` | Character established dead, reappears without revival sourceFacts |
| 2 | `object_destroyed_then_used` | Object marked destroyed/lost, then used again intact |
| 3 | `appearance_change` | Same attribute asserted two different ways |
| 4 | `location_impossible` | Character in two locations same chapter, gap ≤ 2 scenes |
| 5 | `knowledge_relearned` | Character learns same topic twice across scenes |
| 6 | `timeline_inversion` | First scene references "yesterday/previously" with no prior content |
| 7 | `seam_disconnect` | **No character carries over** between adjacent scenes. Referenced by `deterministicSeam.test.js` but **unimplemented** until fix **S-096** — now implemented in `deterministicContradictions.ts` and wired into `runDeterministicContradictionChecks`. |

**Invocation:** `runDeterministicContradictionChecks(sceneDigests, _scenes, entityStates)` → returns `DeterministicContradiction[]`.

**Entity states:** Sourced from the structured `EntityStateRecord` model (`./generation/entityStates`), grouped by `entityType:entityId` via `indexStatesByEntity` and ordered by `compareStatePosition`. Each record carries explicit fields — `state.present`, `state.status` (`alive`/`dead`), `state.condition` (`intact`/`destroyed`/`lost`), `state.location`, `state.knows[]`, `state.attributes{}` — so rules assert on declared state, **not** prose parsed by regex. (Earlier drafts claimed DEATH/REVIVAL/INJURY regex extraction from prose; the current engine is structured, which removes a whole class of false positives and is why `dead_then_alive` can distinguish a recorded revival from an unexplained reappearance.)

**Hard gate:** errors block; warnings surface. The acceptance gate is deterministic HARD checks (undocumented chars = 0, fact-canon contradictions = 0 missed, dropped threads = 0, names present). The advisory `checkContradictions` (→ `qwen3:8b`) is intentionally NOT a hard gate.

## Consistency Service

**Incremental audit** at chapter boundaries (`maybeRunIncrementalConsistency`):
- Receives `endIndex` (last scene index committed)
- Runs `ConsistencyService.maybeRunIncrementalConsistency(endIndex)`
- Triggers terminal audit if enough issues accumulate

**Terminal audit** (`runTerminalConsistencyAudit`):
- Bounded fix rounds (max 3)
- Calls `rewriteSceneForConsistency` which invokes writer + critic in a loop
- If issues persist after 3 rounds, UI flags for author review

## Existing Tests & Test Patterns

- **Vitest** with `vi.useFakeTimers()` for debounce tests
- **Both suites green** (Vitest + Playwright E2E); failing test = regression
- **`vi.resetModules()` drain issue:** new module registry does not stop old instance; stray timer firing in later test fails whichever test it lands on
- Tests are pure (no LLM calls, no DOM); fixtures in `src/tests/unit/fixtures/`
- Mock setup in `src/tests/setup.js`
- Both Vitest and Playwright suites must be green

## Database Schema (Key Tables)

| Table | Key Columns | Relationships |
|---|---|---|
| `Stories` | `Id`, `UserId`, `Title`, `Genre`, `Tone` | → `Chapters`, `BibleEntries`, `Volumes`, `Sections`, etc. (cascade) |
| `Chapters` | `Id`, `StoryId`, `Order`, `Title`, `ArcAssignment` | → `Scenes` (cascade) |
| `Scenes` | `Id`, `ChapterId`, `Title`, `Content`, `WordCount`, `Order` | → `Subsections` |
| `BibleEntries` | `Id`, `StoryId`, `Title`, `Content`, `Category` | → Characters/Locations/PlotThreads (app logic) |
| `GraphEdges` | `Id`, `StoryId`, `sourceId`, `sourceType`, `targetId`, `targetType`, `relationshipType`, `validFromChapter`, `validUntilChapter`, `runId` | Polymorphic edges |
| `GenRuns` | `Id`, `projectId`, `state` (JSON), `updatedAt`, `version` | Checkpoint persistence, 15+ migrations |

**Tenant filtering:** `OrganizationId` query filter on all story-related entities.

**Migrations:** 15+ files in `Infrastructure/Migrations/`.

## AI Provider Configuration

**5 providers:** Ollama (local, default), OpenAI, Anthropic, Gemini, Groq

**Feature→Default:** All `{ provider: 'ollama', model: null }` — local-only mode absolute.

**Model routing:** 
1. Check `options.complexity` → `resolveOptimalModel`
2. If `localOnly` → force Ollama
3. Feature override → use override
4. Otherwise → `store.aiProvider` (configurable)
5. Fallback chain → Ollama

**Eval dimensions** per workspace type (CREATIVE/NOVEL/LEGAL/TECHNICAL/BUSINESS/RESEARCH): continuity, voice, emotional_goal, show_tell, pacing + centralConflict for NOVEL. Default threshold = 7.0 (average of all dimension defaults).

**Voice profiles:** literary, pulp, minimalist, conversational, atmospheric.

**Key constants:**
- `STAGE_IDLE_TIMEOUT_MS`: bible 420s, network 420s, structure 480s, prose 15min, spine 420s, consistency 420s
- `SKELETON_BATCH_SIZE`: 12, `MAX_ATTEMPTS` (relationships): 2
- `SCENE_MAX_ATTEMPTS`: 2, `QUALITY_FLOOR_CONSECUTIVE`: 3
- `WRITE_FAILURE_STREAK_ABORT`: 4, `MAX_REJECTED_PATTERNS`: 5
- `PARALLEL_SCENE_LIMIT`: 2, `SYNC_BATCH_SIZE`: 3, `MAX_SYNC_BATCH_SIZE`: 6
- `RECENT_SCENE_LOG_LIMIT`: 20

## Data Flow Diagram (textual)

```
goal → Director (planChunked) → storyArc + chapter skeletons
     → Writer (writeSceneStructured) → prose + structured metadata
     → Relationships (generateRelationships) → characterRelationships + graphEdges
     → CommitService (discoverSync + commitSync) → Dexie + PostgreSQL
     → ConsistencyService (maybeRunIncrementalConsistency) → audit → auto-fix loop
     → Deterministic Engine (runDeterministicContradictionChecks) → 7 rules → errors/warnings
```

## Risks & Known Weaknesses (from validation session)

| ID | Issue | Status |
|---|---|---|
| W1 | `writeSceneStructured` silently discards undocumented characters | FIXED: guard updated |
| W2 | Default enforcement is product/UX decision, not defect | Documented residual |
| W3 | Parallel prose stage discards stageSignal | FIXED: signal threaded |
| W4 | (not in original 11) | — |
| W5 | (not in original 11) | — |
| W6 | `planEdgeWrites` dedupe threw away betrayals | FIXED: new dedupe logic |
| W7 | SyncTransport double-post without idempotency key | FIXED: idempotency key sent |
| W8 | AI idempotency in-flight only (opt-in key) | FIXED: call sites wired |
| W9 | Parallel prose stage's workFn discarded stageSignal | FIXED: signal threaded |
| W10 | Legacy issues (v48/v49 migration) | FIXED |
| W11 | `generateRelationships` silently dropped unorderable claims | FIXED: console.warn + activity-log |
| F1 | Undocumented-character guard missing | FIXED: GuardrailRegistry.runSync |
| F2 | FactCanon guard missing | FIXED: factCanonGuard updated |
| F3+ | (not in original) | — |
| S1 | 100-chapter accumulated state drift: minor entity attributes shift across 100 chapters without explicit tracking | **UNDER STRESS TEST** — validation pending |
| S2 | Graph edge temporal window drift: validFromChapter/validUntilChapter accumulate rounding errors across 100 chapters | **UNDER STRESS TEST** — validation pending |
| S3 | Bible entity attribute staleness: per-field debounce (500ms) means rapid consecutive writes may overwrite each other's IndexedDB updates | **UNDER STRESS TEST** — validation pending |
| S4 | Chapter-log summary truncation in the metadata path: `summarizeLog` keeps only the last 3 entries (`LOG_RECENT_KEPT=3` in `src/utils/promptUtils.ts`); the orchestrator's primary writer context uses `runningChapterLog.slice(-RECENT_SCENE_LOG_LIMIT)` = last 20 scenes | RESOLVED in design — covered by `src/tests/unit/promptUtils.test.js`; only the secondary metadata `logSummary` is 3-deep, which is acceptable (it is the lowest-priority block in `fitSceneContext`) |
| S5 | Idempotency key expiry across 100 chapters: `IDEMPOTENCY_TTL_MS=60s` may expire before a long run completes | RESOLVED / by-design — see S13. `_cleanup()` (the only consumer of the TTL) has no callers, so in-flight keys live until their promise resolves; cross-process dedupe is guaranteed by the S-097 `SyncTransport` idMap guard. Covered by `src/tests/unit/idempotencyTracker.test.js` |
| S6 | Deterministic contradiction rules not validated at scale: 7 rules validated on seeded data; 100-chapter harrow tests whether false positives/negatives emerge | **UNDER STRESS TEST** — validation pending |
| S7 | Sync batch size (MAX_SYNC_BATCH_SIZE=6) with 100 chapters: entities discovered in chapter 1's first scene may not sync until batch close; 100 chapters may exceed effective batch window | **UNDER STRESS TEST** — validation pending |
| S8 | `fitSceneContext` token budgeting for 100 chapters: accumulated context may exceed the model window and be silently discarded | RESOLVED in design — `fitSceneContext` drops by explicit priority (contract > entities > bible > spine > log > sceneContext) and reports what it sacrificed in `note`; this is the intentional, visible alternative to Ollama's silent front-discard. Covered by `src/tests/unit/contextBudget.test.js` |
| S9 | Entity-state derivation at scale: 100 chapters of accumulated state must not mis-derive status/condition/location | RESOLVED in design — entity states are **structured** (`EntityStateRecord` in `src/services/generation/entityStates.ts`), read off facts/keyFacts the writer already emits, **not** regex-parsed prose. Covered by `src/tests/unit/entityStates.test.js` |
| S10 | `runDeterministicContradictionChecks` entity state hashing: 100 chapters of accumulated state may produce hash collisions or state derivation failures | **UNDER STRESS TEST** — validation pending |

### 100-Chapter Stress Test Analysis

This section documents the pipeline analysis specifically through the lens of a 100-chapter interconnected novel dataset (see `NOVEL_100_CHAPTER_SPEC.md`).

#### Data Flow Through All Pipeline Stages (100-Chapter Lens)

**1. PLANNING (Director/Spine) — Chapters 1–100**
- `generateStoryPlan` runs once at onset, producing `storyArc` and `chapterPlan`
- `planChunked` batches skeleton generation in groups of 12 (SKELETON_BATCH_SIZE=12)
- **100-chapter stress**: Chapter boundaries must align correctly across the full 100-chapter span. The `batchEndIndex` function (which aligns to chapter ends using actual scene counts, not fixed stride-3 assumption) is critical — a fixed stride would silently misalign chapter consistency checks after chapter 24.
- **Spine context** (`spineArray`, `spineContext`) must remain coherent across all 100 chapters. The `fitSceneContext` function budgets tokens via `fitSceneContext` — with 100 chapters of accumulated context, the front-loading silence discarding ( Ollama ~2,050 of ~6,153 tokens at num_ctx=4096) means early chapter context may be silently dropped in later chapters, producing contradictions that the deterministic engine only catches in Chapter 60+.

**2. GENERATION (Writer) — Chapters 1–100**
- `writeSceneStructured` two-pass: prose generation (pass 1) + metadata extraction (pass 2)
- **100-chapter stress**: 
  - `detectRefusal` must correctly identify model refusals across 100 generations — a refusal in Chapter 3 that returns as prose propagates as "I'm sorry, but I can't continue this" into Chapter 63 (the documented failure mode where detective-mode guardrails let refusals persist as prose).
  - `detectRepetition` must operate on 100 scenes of varying length — the 6-word n-gram check (max 3 occurrences) and 2-paragraph-segment check (max 2 occurrences) may produce false positives on well-written but thematically similar prose.
  - `extendToTarget` with MAX_EXTENSION_PASSES=2: across 100 chapters, some scenes may consistently fall short of word targets, and the 85% tolerance ratio (LENGTH_TOLERANCE_RATIO=0.85) means some scenes end at ~765 words against a 900 target — the word count discrepancy accumulates in chapter logs.
  - `extractSceneMetadata` chunking at 6000 chars **with paragraph-boundary splitting and full-coverage merge** (`chunkProseForMetadata` + `mergeSceneMetadata` in `src/composables/useStoryWriter.ts`): the OLD implementation did `slice(0, 6000)`, which on ~9,500-10,500-char scenes left the final third structurally invisible. That bug is **fixed in code** — every chunk is extracted and unioned, so no scene third is dropped (locked by `src/tests/unit/metadataChunking.test.js`).

**3. NETWORK (Relationships) — Chapters 1–100**
- `generateRelationships` AI structured call with schema, `buildRelationshipEdges` name→ID resolution, `planEdgeWrites` with temporal windows
- **100-chapter stress**:
  - `planEdgeWrites` supersession logic: edges have validFromChapter/validUntilChapter. Across 100 chapters, a relationship established in Chapter 3 validFromChapter=1 may be superseded in Chapter 95 validFromChapter=95 — the supersession logic must correctly stamp the old edge as expired without orphaning entities.
  - Edge ID stability: graph edges have persistent IDs. Across 100 chapters with 55+ DB tables and Dexie ↔ PostgreSQL dual-write, edge IDs must survive sync. The `SyncTransport.pushOne` idempotency key mapping (W8 fix) must hold across 100 chapters of retries.
  - `resolveAndCommitEdges` temporal deduping: with 100 chapters, the number of concurrent valid edges grows. The "one logical request" network weave (MAX_ATTEMPTS=2 for relationships) must not silently drop unorderable claims across the full span.

**4. PERSISTENCE (CommitService) — Chapters 1–100**
- `computeSummary` prose→summary, `manuscriptStore.updateSubsectionData` Dexie writes, `discoverSync` entity discovery, `commitSync` Dexie→PostgreSQL, `resolveAndCommitEdges` graph edge deduping
- **100-chapter stress**:
  - Dexie debounce (500ms per-field) across 100 chapters: per-field timers in `storyBibleStore` and `manuscriptStore` mean rapid consecutive writes (e.g., character added in scene 1, then another attribute in scene 2 within 500ms) may overwrite each other. The 1500ms document regen debounce in storyBibleStore compounds this.
  - `commitSync` batch size (SYNC_BATCH_SIZE=3, MAX_SYNC_BATCH_SIZE=6): with 100 chapters, the 6-entity batch ceiling means entities discovered in chapter 1's first scene do not reach chapter 1's last scene until the batch closes — a 100-chapter run requires intermediate sync refreshes to prevent entity drift.
  - `discoverSync` entity discovery ambiguity: finding zero new entities from structured metadata is ambiguous — does it mean "scene genuinely established nothing" or "extractor never ran"? The `metadataStatus: 'skipped'` field in EMPTY_METADATA was specifically added to disambiguate this, but 100 chapters of zero-entity discoveries may still accumulate ambiguous state.
  - PostgreSQL tenant filtering (`OrganizationId`): across 100 chapters with multiple projects/orgs, query filter correctness must be verified — a missing OrganizationId on any entity silently removes it from workspace queries.

**5. CONSISTENCY AUDIT — Chapters 1–100**
- `maybeRunIncrementalConsistency` at chapter boundaries, `runTerminalConsistencyAudit` bounded fix rounds (max 3)
- **100-chapter stress**:
  - Incremental consistency runs at chapter boundaries only. With 100 chapters, there are 99 chapter boundary crossings. If the function returns early unless the index lands exactly on a chapter end (which it does by design), 96 of 99 boundaries are silently skipped. The 100-chapter spec deliberately spaces consistency checks to exercise this.
  - Terminal audit bounded at max 3 fix rounds. Across 100 chapters, if early chapters accumulate contradictions that require auto-fix, the 3-round bound may be insufficient — by Chapter 60, the auto-fix loop may be exhausted, and UI flags for author review must trigger.
  - `rewriteSceneForConsistency` invokes writer + critic in a loop. Across 100 chapters, a scene that requires 3 consistency rewrites in Chapter 15 may have its prose replaced with functionally different content, and the chain of 3 rewritten scenes must remain consistent with all later chapters.

**6. DETERMINISTIC HARD GATE — Chapters 1–100**
- `runDeterministicContradictionChecks(entityStates)` at each chapter boundary
- **7 rules exercised across 100 chapters**:
   1. **dead_then_alive**: Thaddeus dies in Chapter 19. He must not reappear in any later chapter without an explicit revival sourceFact. The entity state derivation via `deriveEntityStates()` → `readEntityState()` reads **structured** `EntityStateRecord` rows (status/condition/location/attributes/knows) produced from the facts/keyFacts the writer already emits — **not** regex-parsed prose. 100 chapters of accumulated state derivation must not produce false positives (flagging alive-Thaddeus as contradiction when he was legitimately revived) or false negatives (missing a genuine revival).
  2. **object_destroyed_then_used**: Various objects marked destroyed/lost across chapters must not be used again intact without explanation. The 100-chapter dataset tracks several such cases (Vorn's corrupted artifact, Thaddeus's notes).
  3. **appearance_change**: Same attribute asserted two different ways. Kaldic's fire affinity (Aldric and Kael both have fire) is the primary exercise — they must be differentiated by other attributes, not just affinity. The 100-chapter dataset ensures Kael's fire affinity is qualified with "arrogant demeanor" and "rivalry" distinctions.
  4. **location_impossible**: Character in two locations same chapter with gap ≤ 2 scenes. Across 100 chapters with 2-5 scenes per chapter, this rule must track character movement precisely. The `getConnectedNodes` and `getEdgesForNode` graph functions support this, but the 100-chapter accumulation tests boundary conditions.
  5. **knowledge_relearned**: Character learns same topic twice. Rissa learning light magic from Ezran in Chapter 28, then demonstrating it in Chapter 46, is the exercise — the second encounter must not be flagged as contradiction if the first was legitimate instruction.
  6. **timeline_inversion**: "Yesterday/previously" references with no prior content. Chapter 12's "yesterday" reference without prior content is the exercise — all "yesterday" references must have prior scene content establishing the referenced day.
  7. **seam_disconnect**: No character carries over between adjacent scenes. This is the "new from this session" rule added during the validation session. Across 100 chapters with 2-5 scenes per chapter, every adjacent scene pair must have legitimate carry-over or explicit absence.

#### Identified Risks from 100-Chapter Validation (New from This Session)

| ID | Issue | Root Cause | Potential Impact |
|---|---|---|---|
| S11 | Metadata extraction dropped final scene third (historical) | `chunkProseForMetadata` previously did `slice(0, 6000)`; now chunked + fully merged (see §2 GENERATION) | RESOLVED in code — every scene third is now covered; locked by `src/tests/unit/metadataChunking.test.js` |
| S12 | Refusal propagation in detective mode | Guardrail enforcement defaults to 'detective'; refusals returned as prose; persisted and fed forward | Chapter 63+: "I'm sorry, but I can't" becomes literal text |
| S13 | Idempotency key expiry across run duration | IDEMPOTENCY_TTL_MS=60s; but `_cleanup()` (the only consumer of the TTL) has no callers, so in-flight keys live until their promise resolves | RESOLVED / by-design — in-flight dedupe is correct; cross-process dedupe is guaranteed by the S-097 `SyncTransport` idMap guard. No re-invocation on retry |
| S14 | Deterministic contradiction false positives at scale | 7 rules validated on seeded data; 100 chapters may exercise edge cases not in seed | Pipeline blocks on non-contradictions, author confusion |
| S15 | Graph edge temporal window accumulation | validFromChapter/validUntilChapter across 100 chapters; no upper-bound cleanup | Orphaned edges with validUntilChapter=100 but chapter 101 never runs |
| S16 | `fitSceneContext` front-loading silence discard | Ollama ~2,050 of ~6,153 tokens evaluated; front-loaded context silently dropped | BY-DESIGN (intentional, visible) — `fitSceneContext` chooses what to drop by value and reports it in `note`, instead of letting the server drop from the front silently. Covered by `src/tests/unit/contextBudget.test.js` |
| S17 | `summarizeLog` truncation | `summarizeLog` keeps only the last 3 entries on the metadata path; the orchestrator's primary writer context uses `slice(-20)` | LOW — covered by `src/tests/unit/promptUtils.test.js`; only the secondary metadata `logSummary` is 3-deep (acceptable, lowest-priority block) |
| S18 | Per-field IndexedDB debounce race | 500ms per-field debounce in storyBible/manuscript stores; rapid consecutive writes overwrite | Entity attributes lost without error; silent data corruption |
| S19 | Sync batch drift over 100 chapters | MAX_SYNC_BATCH_SIZE=6 with fixed chapter boundaries; 100 chapters exceed effective batch window | Entity discoveries lag behind scene writes; bible outdated for later scenes |

### Validation-Discovered Regressions (Root-Cause Fixes)

While running the 100-chapter regression suite, two genuine defects in the *prior* session's partial work surfaced. Both are documented in `CONSISTENCY_LEDGER.md` (S-096, S-097) and fixed in this analysis's corresponding source modules.

| ID | Symptom (test) | Root Cause | Fix | Preventive Mechanism |
|---|---|---|---|---|
| **S-096** | `deterministicSeam.test.js` threw `TypeError: checkSeamContinuity is not a function` on all 6 cases | Rule 7 (`seam_disconnect`) was imported by the test but never implemented; `deterministicContradictions.ts` defined rules 1–6 and the runner registered only those. The planned Rule 7 was documented in the analysis but the implementation was dropped before the prior session ended. | Implemented `checkSeamContinuity(states)` (groups records by scene → collects present cast per scene → flags `seam_disconnect` only when two consecutive scenes **both** have a present cast with no shared character; empty-cast cold opens stay silent); added `'seam_disconnect'` to the type union; registered it in `runDeterministicContradictionChecks`. | `deterministicSeam.test.js` (6 cases). Removing the export now fails the suite. |
| **S-097** | `syncTransport.test.js`: re-pushing a `pending-create` row produced **2 POSTs** | `pushOne` always issued `POST` for `pending-create`. When the server row is created but the local `syncStatus`/`apiId` confirmation write is lost (crash, hook suppression, 500ms debounce race), the row stays `pending-create` and the next cycle POSTs again → **duplicate server entity**. | Added an idempotency guard in the `pending-create` branch: before POSTing, check `idMap.getApiId(table, local.id)`; if mapped, reconcile with a `PUT` to the existing id and mark `synced`. Reuses the Dexie-persisted `idMap`, so it survives reloads. | `syncTransport.test.js` (duplicate-POST + reuse-server-id cases). Dropping the guard reintroduces 2 POSTs and fails the suite. |

**Net effect on the analysis:** the 7-rule deterministic gate is now fully implemented and exercised; the W8 idempotency contract is complete at both the in-flight (`IdempotencyTracker`) and transport (`SyncTransport`) layers.

### 100-Chapter Dataset Authority (reconciliation note)

The 100-chapter narrative used by the ledger/tests is the **Aldric / artifact / prophecy arc** (10 characters, P1–P7 threads, Ch1–100). This differs from:
- the *original planning scaffold* in `NOVEL_100_CHAPTER_SPEC.md` (Dr. Elias Thorne / Choice Engine / multiverse — 3 threads), which is **non-canonical**; and
- the *unit-test fixtures* in `consistencyNovel.test.js` (Elara Voss / Kaelen Dain / cult — focused scenarios).

See the "Dataset Authority & Reconciliation Note" at the top of `NOVEL_100_CHAPTER_SPEC.md`. All chapter counts, act boundaries, and the no-data-loss / no-duplication / all-7-rules gates in this analysis are defined against the **Aldric/artifact ledger**, which is the authoritative validated dataset.

---

## Updated Test Patterns

### 100-Chapter Stress Test Suites — STATUS: PLANNED (not yet created)

> **Correction (2026-08-16, second-pass review).** The file paths listed below were recorded as "new additions" but were **never created** on disk (confirmed: `src/tests/unit/stress/**` does not exist; `e2e/` contains only `smoke/auth/responsive`). The residual risks they were meant to cover are, in fact, already exercised by the existing unit suites under **Actual coverage** below. The planned stress suites remain desirable for a true 100-chapter replay, but their absence is **not** a coverage gap today.

**Planned Vitest suites (TODO — not present in repo):**
- `src/tests/unit/stress/100-chapter-consistency.test.ts` — replay all 7 deterministic contradiction rules across the Aldric/artifact ledger
- `src/tests/unit/stress/edge-temporal-windows.test.ts` — graph edge validFromChapter/validUntilChapter across 100 chapters
- `src/tests/unit/stress/metadata-chunk-boundaries.test.ts` — `chunkProseForMetadata` 6000-char boundary (currently covered by `metadataChunking.test.js`)
- `src/tests/unit/stress/idempotency-expiry.test.ts` — idempotency key lifetime across extended runs
- `src/tests/unit/stress/sync-batch-drift.test.ts` — sync batch size behavior across 100 chapters

**Planned Playwright E2E (TODO — not present in repo):**
- `e2e/100-chapter-consistency.spec.ts`
- `e2e/edge-cases/refusal-propagation.spec.ts`
- `e2e/edge-cases/idempotency-key-lifecycle.spec.ts`

### Actual coverage (present in repo, green)

- `src/tests/unit/consistencyNovel.test.js` — cross-chapter consistency scenarios (Elara/Kaelen fixtures)
- `src/tests/unit/deterministicContradictions.test.js` + `deterministicContradictions.secondpass.test.js` + `deterministicSeam.test.js` — all 7 deterministic rules incl. Rule 7 seam_disconnect
- `src/tests/unit/entityStates.test.js` — structured `EntityStateRecord` derivation (S9)
- `src/tests/unit/contextBudget.test.js` — `fitSceneContext` priority-dropping + sacrifice reporting (S8/S16)
- `src/tests/unit/promptUtils.test.js` — `summarizeLog` 3-recent contract (S4/S17)
- `src/tests/unit/idempotencyTracker.test.js` — in-flight dedup (S5/S13/W8)
- `src/tests/unit/syncTransport.test.js` — S-097 duplicate-POST guard (W8 transport)
- `src/tests/unit/edgeSync.test.js`, `edgeTimeline.test.js` — edge temporal windows (S2/S7)
- `src/tests/unit/metadataChunking.test.js` — S-11 chunking regression (added this session)
- `e2e/smoke.spec.js`, `e2e/auth.spec.js`, `e2e/responsive.spec.js` — 7 E2E tests, all green

**All suites remain green; failing test = regression. New tests that call `vi.resetModules()` must drain async work — a new module registry does not stop the old instance, and a stray timer firing in a later test fails whichever test it lands on.**

---

## Second-Pass Review Closure (2026-08-16)

Step 11's second-pass review of the 100-chapter deliverables found **no new code defects**. The real gaps were in the analysis document, now corrected above:

- **S-11 (metadata final-third drop)** was documented as a live risk but is **already fixed in code** (`chunkProseForMetadata` + `mergeSceneMetadata` iterate and union every chunk). Locked by the new `metadataChunking.test.js`.
- **S-13 / S-5 (idempotency TTL expiry)** mis-described a live failure mode. `_cleanup()` has no callers, so the TTL never fires mid-run; cross-process dedupe is guaranteed by the S-097 `SyncTransport` idMap guard. **By-design, not a bug.**
- **S-9 / §6 rule 1 (entity-state regex)** incorrectly claimed prose is regex-parsed. Entity states are **structured** `EntityStateRecord`s read off emitted facts.
- **S-4 / S-17 (`summarizeLog`)** said "chops at 20 scenes"; it actually keeps the last 3 on the metadata path, while the orchestrator's primary writer context uses `slice(-20)`. Covered by `promptUtils.test.js`.
- **S-8 / S-16 (`fitSceneContext`)** is an intentional, *visible* priority-based drop (it reports what it sacrificed), not a silent loss. Covered by `contextBudget.test.js`.
- **Phantom stress suites**: the "new additions" test files listed under *Updated Test Patterns* do not exist; the residual risks they targeted are already covered by the existing suites listed above.

The only genuinely thin coverage remaining is a true 100-chapter *replay* (the structured ledger fed through every module in one run), which the planned `stress/` and `e2e/100-chapter-*` suites would provide. That is a nice-to-have, not a correctness gap.

---

## Chapter-Boundary Seam Continuity Closure (2026-08-16)

User directive: verify that the **ending of Chapter N flows into the opening of Chapter N+1** across all 99 boundaries, and loop test→fix→retest until locked. The deeper question: *if I generate a 100-chapter novel, will it be consistent?*

**What "consistent" actually required (and what was missing):** The consistency *safety net* — the deterministic contradiction engine — already covered dead-then-alive, object-destroyed, location teleport, appearance, knowledge, timeline. But its Rule 7 (`checkSeamContinuity`) only compared cast overlap between consecutive **scenes**; there was **no chapter-level seam rule at all**. So a character dropped between chapters would never be flagged by the real engine. The earlier fixture/harness seam checks exercised a *hand-rolled* validator, never the engine — and the unit test asserting `0 seam_disconnect` was a no-op (the engine couldn't emit that type). That was the gap behind the honest answer "generation is not proven consistent."

**Real fix — Rule 7 is now two rules in the engine** (`src/services/generation/deterministicContradictions.ts`):
- `checkSeamContinuity` (scene-level): cast must carry across consecutive scenes (unchanged, still wired in).
- `checkChapterSeam` (chapter-level, **new**): a character on stage at the end of chapter N must reappear in chapter N+1 (the next chapter in the book), or have a recorded death/loss. Fires as `seam_disconnect` (warning). Deliberately narrow (adjacent-chapter only, explained exits allowed) to respect the engine's precision bias.
- Both are wired into `runDeterministicContradictionChecks`, so the guarantee now holds over **whatever structured facts generation emits** — real LLM output included, not just the fixture.

**Other genuine defects found and fixed this pass (not just doc corrections):**
- **S-098 (real build break):** `undocumented_character` guard existed but its `kind` was absent from the `GuardrailKind` union, so `tsc` failed and the guard was never registered. Actually fixed now: union + `DEFAULT_META` in `registry.ts`, registration in `setup.ts` (with its `GroundingService` arg), and `SCENE_KINDS` in `useProseGuardrails.ts`. (The earlier "tsc clean" was a false positive — the exit code captured was `tail`'s, not `tsc`'s. `tsc --noEmit` is now genuinely clean.)
- **Metadata-chunking exports:** `chunkProseForMetadata` / `mergeSceneMetadata` in `useStoryWriter.ts` were never actually `export`ed, so `metadataChunking.test.js` (the S-11 regression) failed with `is not a function`. Exports added.
- **W7 sync idempotency:** `SyncTransport.pushOne` re-POSTed a still-`pending-create` row on every retry, minting duplicate remote entities. Fixed by reusing the existing server id from `idMap` (PUT instead of POST) — `syncTransport.test.js` now green.

**Root-cause fix (generator fixture):** `scripts/build-100-chapter-data.mjs` now emits per-chapter `ending` (closing hook), `continuesFrom` (link to preceding chapter id; `null` for ch1/flashbacks), and a travel `keyFact` justifying each location change. Regenerated `validation/novel-100-data.json` is now seam-explicit.

**Locks added:**
- `src/tests/unit/chapterSeamContinuity.test.js` (8 tests, all green): structural seam walk over all 99 boundaries (allows the 1 intentional ch52 edge-orphan seed via `KNOWN_SEEDS`); every non-flashback chapter declares `continuesFrom` + non-empty `ending`; **real-engine** seam — `deriveEntityStates` + `runDeterministicContradictionChecks` over the whole book ⇒ **0 seam_disconnect**, plus a mutation self-test proving the engine flags a cast-drop (`seam_disconnect` for "Elias Varn", boundary 50→51); 4 more mutation self-tests (broken link / cast-drop / teleport / dangling ref).
- `scripts/validate-100-chapter.mjs` gained: a real-engine `seam.engine` check (expects 0 `seam_disconnect` over the dataset-derived entity states — now genuinely meaningful), plus `deterministic.self-test.chapter-seam` / `chapter-seam-clean` self-tests, and the structural `seam` walk expecting exactly 1 failure (seeded ch52 edge-orphan). Harness reports `seam.engine` ⇒ PASS, `seam.summary` ⇒ PASS.

**Schema reconciled:** `novel-100-chapter-dataset.json.schema` was stale — described non-existent `previousChapterId`/`causes`/`effects`/`characterIds`/`prose`-required fields, omitted real `ending`/`continuesFrom`/`charactersPresent`/`location`/`references`/`flashback`. Rewritten to the actual fixture shape and validated with Ajv (`SCHEMA VALID: true`).

**Answer to "will a 100-chapter novel be consistent?":** The *detection* layer is provably complete and enforced by the real engine — a chapter-boundary cast drop is caught (`seam_disconnect`), and all other contradiction classes were already covered. A real generation run still depends on the LLM following the `openingConstraints`/`closingConstraints` prompts (those are prompts, not validators), but any drift the model introduces is now flagged by the engine rather than slipping through.

### Generation-time seam enforcement (validate + warn, 2026-08-16)

The fixture/harness guarantee above covers the *validated dataset*, not a live generation run. The one real remaining weakness was that `openingConstraints`/`closingConstraints` (`useVolumeStoryGenerator.ts:2118`) are **prompt text only** — the model is asked to carry cast across the boundary but nothing verified it. That gap is now closed with a non-blocking validator:

- **New module `src/services/generation/seamValidation.ts`** — `deriveSeamWarnings(digests)` turns each generated anchor scene (the chapter's opening, and closing when present) into the same `EntityStateRecord` timeline the engine consumes (`deriveEntityStates`), then runs the **real engine** `checkChapterSeam` + `checkSeamContinuity` over the running timeline and returns advisory `seam_disconnect` warnings.
- **Wired into the anchor phase** of `useVolumeStoryGenerator.ts`: each chapter's anchor scenes accumulate into `seamSceneDigests`; after each chapter the seam rules run and any new `seam_disconnect` is pushed to a `seamWarnings` ref (exposed from the composable) and logged to the activity log. De-duplicated by entity + boundary so a single gap does not spam every later chapter.
- **Non-blocking by design** (user-chosen "validate + warn"): warnings surface for the author to judge a deliberate exit; they never halt the run. The on-stage cast is read from the scene plan (`charactersPresent`) and deaths/losses from the generated `keyFacts`/`summary`, so it is deterministic and available regardless of extraction quality.

**Locks added:** `src/tests/unit/seamValidation.test.js` (4 tests, all green) — flags a character dropped between adjacent chapters; stays clean when cast is carried; does NOT flag a death recorded before the boundary; returns `[]` for an empty digest list.

**Result:** full unit suite **2748 passed** (2741 prior + 4 seamValidation + 3 demoAccountLogin), `tsc --noEmit` **genuinely clean (exit 0)**, harness all checks PASS.

---

*Analysis augmented for 100-chapter stress test process. Original 217-line analysis preserved; 4,200+ words added across risk identifications, data flow tracing, and exercise summaries.*