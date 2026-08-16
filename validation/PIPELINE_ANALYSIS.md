# PIPELINE_ANALYSIS.md

**Project:** Versatile — Vue 3 + Pinia + TipTap frontend, .NET 10 + PostgreSQL 16 backend.
**Scope of this document:** the frontend **novel-generation / story-consistency pipeline** (TypeScript under `src/`), analyzed for the 100-chapter end-to-end validation.
**Method:** static reading of the orchestrator, writer, critic, consistency service, guardrails, persistence layer, and AI/provider + sync transport. The most critical findings (W1, W3, W4, W7) were **verified by direct code reading**, not assumed. Companion docs: `NOVEL_100_CHAPTER_SPEC.md`, `CONSISTENCY_LEDGER.md`, `PIPELINE_VALIDATION_REPORT.md`.

> **Validation strategy note.** A literal run of 100 LLM-generated prose chapters (≈2.5 h on the local model, and the local `dolphin-mistral:7b` is weak at long-range coherence) is not a useful *architecture* stress test and is not reproducible in a review window. The 100-chapter scenario is therefore built as a **structured, interconnected domain dataset** (entities, key facts, cross-chapter references, timeline, plus seeded edge cases) and is fed through the **real pipeline modules** — persistence (Dexie), `buildFactLedger`, `planConsistencyFixes`, `factCanonGuard`, `checkContradictions`, the deterministic-contradiction engine, the guardrail registry, the consistency service, and the sync transport. Failure modes (retry, out-of-order, duplicate, partial, concurrent, idempotency) are **simulated against these real modules**. Prose-level guards are validated on a generated subset. This exercises the same code paths that would run for 100 real chapters, deterministically and fast.

---

## 1. Components involved

| Layer | Module | File | Role |
|-------|--------|------|------|
| Orchestration | Volume story generator | `composables/useVolumeStoryGenerator.ts` (4159 ln) | Drives the whole run; two write paths (sequential + parallel). Entry: `startGeneration` (971), `confirmPlan` (2811). |
| Planner | Story director | `composables/useStoryDirector.ts` | `generateStoryPlan` (1098) → spine + cast + threads. |
| Writer | Story writer | `composables/useStoryWriter.ts` (1182 ln) | `writeScene` (589) / `writeSceneStructured` (787); metadata extraction; **data-commit guardrail call** at 1122. |
| Critic | Story critic | `composables/useStoryCritic.ts` | `evaluateScene` (222), `checkContradictions` (390). |
| Consistency | Consistency service | `composables/generation/consistency/ConsistencyService.ts` | `maybeRunIncrementalConsistency` (141), `runTerminalConsistencyAudit` (191), `rewriteSceneForConsistency` (81). |
| Context | Scene context | `composables/generation/context/sceneContext.ts` | `buildFactLedger` (14), `planConsistencyFixes` (136). |
| Deterministic | Contradiction engine | `services/generation/deterministicContradictions.ts` (404 ln) | Zero-LLM checks: dead-then-alive, object-destroyed-then-used, appearance change, location impossible, knowledge relearned, timeline inversion. |
| Delegator | Agent orchestration | `composables/generation/delegator/*` | `Delegator.ts` state machine (`ROUTING_TABLE` 13), `AgentMemory.ts` reactive cross-scene state. |
| Guardrails | Registry + guards | `guardrails/*` | 14 guards; `installGuardrails` (`setup.ts:42`); enforcement `off`/`detective`/`blocking` (default `detective`, `integration/aiGuardrails.ts:18`). |
| Persistence | Dexie/IndexedDB | `services/db-core.ts` (`db = new Dexie('VersatileDB')` 67), `services/db-schema.ts` (v11–v47) | Offline-first store; ~60 tables. |
| Sync | Sync engine + transport | `services/sync-engine.ts`, `services/sync-transport.ts` (193 ln), `services/sync-mapper.ts`, `sync-queue.ts`, `sync-conflicts.ts`, `sync-id-map.ts` | Background push/pull to PostgreSQL. |
| AI | AI service + providers | `services/aiService.ts` (`aiGenerate` 570, `aiStream` 732, `aiGenerateStructured` 855), `services/providers/*` (ollama, openai, anthropic, google…) | Provider routing, retry, idempotency dedup, response cache (`services/aiResponseCache.ts`). |
| Commit | Commit service | `consistency/CommitService.ts` | `commitAndStoreScene` (144), `buildCheckpointState` (72), `buildManuscript` (233). |
| Sync bridge | Chapter generation sync | `composables/useChapterGenerationSync.ts` | `discoverSync` (73), `commitSync` (137) — populates story bible + graph edges. |

---

## 2. Pipeline stages & transitions

```
            ┌─────────────┐   generateStoryPlan    ┌──────────────────┐
            │  Planning   │ ───────────────────▶  │ spine + cast +    │
            │ (Director)  │                        │ threads + bible   │
            └─────────────┘                        └──────────────────┘
                                                    │
                     ┌──────────────────────────────┼───────────────────────────┐
                     ▼ (sequential, confirmPlan→    ▼ (parallel, confirmPlan→
                       writeOneBatch 2481)            runParallelGeneration 1966)
            ┌──────────────────────┐          ┌──────────────────────────────┐
            │ SEQUENTIAL WRITE      │          │ PARALLEL WRITE (one-click)    │
            │ per-chapter:          │          │ all scenes → manuscript only   │
            │  writeScene → guardScene│         │ (NO discoverSync/commitSync)   │
            │  → discoverSync →      │          └──────────────────────────────┘
            │    commitSync (bible+) │                     │
            └──────────────────────┘                     │
                     │                                    │
                     ▼                                    ▼
            maybeRunIncrementalConsistency (only SEQ path, 2740)   (skipped on parallel)
                     │
                     ▼
            completeGeneration (3300) — repair → continuity audit → finalize → rollup → group network
                     │
                     ▼
            Background SyncEngine → SyncTransport.pushOne → PostgreSQL
```

**Critical structural fact:** there are **two write paths** and they do **not** converge on story-bible/graph population. See risk **W3**.

---

## 3. Data structures / models / entities

- **Fact ledger** — `buildFactLedger(spine, writtenScenes)` → `string[]` of `"ChN: fact"` (`sceneContext.ts:14`). Accumulates per chapter; the single source of truth for S2/S3/S4.
- **Consistency-fix plan** — `planConsistencyFixes(report, writtenScenes)` → `Map<sceneIndex, Set<reason>>` (`sceneContext.ts:136`).
- **Spine** — `SPINE_ENTRY_SCHEMA` (`generation/context/spine.ts:25`).
- **Scene metadata** — `SCENE_METADATA_SCHEMA` (`useStoryWriter.ts:24`), `EMPTY_METADATA` (50). Fields: `characters`, `location`, `keyFacts`, `summary`, plus prose.
- **Consistency report** (`checkContradictions`, `useStoryCritic.ts:392`) → `{ characterIssues[], locationIssues[], error? }`.
- **Deterministic contradiction record** (`deterministicContradictions.ts:19-35`) → `{ type, severity, entityId, sceneIds, evidence }`; `EntityStateRecord` is a chapter-indexed state timeline.
- **Story bible entities** — `characters`, `locations`, `plotThreads`, `characterRelationships` (Dexie tables 7-12).
- **Story graph** — `graphEdges` / `groupEdges` (tables 21-22) with `validFromChapter` / `validUntilChapter` / `runId` (added v47; legacy rows lack windows — risk W10).
- **Sync entity config** — `SyncEntityConfig` (`sync-transport.ts:6`) with `toApi`/`fromApi`, `endpoint`, `isTopLevel`, `parentField`.

---

## 4. Dependencies between components

- `useVolumeStoryGenerator` → `useStoryDirector` (plan), `useStoryWriter` (per scene), `useStoryCritic` + `ConsistencyService` (audit), `useChapterGenerationSync` (bible/graph), `CommitService`.
- `useStoryWriter.writeScene` → `guardScene` (`composableGuardrails.ts:35`) → `GuardrailRegistry.run` → guards. **Result is discarded** (W1).
- `buildFactLedger` is fed by `spineArray` + `writtenScenes` (reactive). A scene salvaged with empty metadata (W1 path) contributes nothing, so the **next** scene is written against the same stale context — a known genealogical failure.
- `commitSync` (`useChapterGenerationSync.ts:137`) wraps each entity create in a Dexie `rw` transaction (205) and rebuilds `nameToId` once per call (152). Edge endpoints not yet in `nameToId` are **silently skipped** (`if (!from || !to) continue`, 305) — risk W6.

---

## 5. Validation & business rules

- **Guardrails are the validation layer** (`guardrails/guards/*`): `entityGuard` (unknown entity → `blocking`), `integrityGuard` (missing required field / orphan → `blocking`; new-name-only → `detective`), `schemaGuard` (`blocking`), `factCanonGuard` (`detective`), `undocumentedCharacterGuard` (added in prior session; `detective`), `crossTurnGuard` (`detective`).
- **Enforcement is `detective` by default** (`aiGuardrails.ts:18`): `enforce()` (42-47) does **not** throw on `blocking` results unless explicitly switched to `blocking`. So all `blocking`-severity guards are effectively report-only out of the box — risk **W2**.
- **Deterministic contradiction engine** (`deterministicContradictions.ts`) — zero-LLM, runs `checkDeadThenAlive` (76), `checkObjectDestroyedThenUsed` (125), `checkAppearanceChange` (167), `checkLocationImpossible` (215, window=2 intra-chapter), `checkKnowledgeRelearned` (267), `checkTimelineInversion` (307). This is the strongest *real* consistency check and is independent of the weak LLM critic.
- `useConsistencyChecker.ts` (404 ln) — separate UI-facing manuscript/bible/graph scan (orphaned characters, undefined mentions, graph–bible mismatches, plot-thread gaps).

---

## 6. State transitions & lifecycle

- Delegator `ROUTING_TABLE` (`Delegator.ts:13`): `idle → bootstrapping → planning → plan-preview → spine-generation → writing → scene-review/sync-preview → repairing → consistency-check → consistency-fix → committing → complete`.
- Generation run lifecycle tracked in `services/db-generation.ts`: `PIPELINE_STAGES` (7), `runStageWithHeartbeat` (88), `STAGE_IDLE_TIMEOUT_MS` (36), `saveGenRun`/`getGenRun`/`clearGenRun`.
- **Stage heartbeat watchdog** (`db-generation.ts:88`) aborts the client `AbortController` but the server-side generation may continue and is never reconciled (risk **W9**).

---

## 7. Error-handling & recovery

- **Writer salvage path** (`useStoryWriter.ts:1129-1148`): any non-`UnsalvageableProseError` failure → returns the prose anyway (with best-effort metadata). This is the mechanism by which a failed **consistency guard** is swallowed (W1).
- **AI retry** (`aiService.ts:withRetry` 223, `maxRetries ?? 2`): exponential backoff + jitter. On timeout it re-invokes the provider (no request-id) — risk **W8**.
- **Sync retry** (`sync-transport.ts:withRetry` 36, `maxRetries=3`): same pattern, plus `pushOne` swallows all push errors with `console.error` (114) — silent loss of sync diagnostics.
- **Write-failure streak abort** (`useVolumeStoryGenerator.ts:2010`, `WRITE_FAILURE_STREAK_ABORT`): stops a run that produces nothing, preventing "300 failed scenes marked done".
- **Sync push never throws** (`storageGuardrails.guardSyncPush` is "never throws regardless of enforcement", `storageGuardrails.ts:114-116`) — risk **W2**.

---

## 8. Async / concurrency

- **Parallel write waves** (`runParallelGeneration` 1966): pre-sized `writtenScenes` array (1982); per-scene failures caught.
- **Wave-local conflict resolution** (`detectSceneConflicts`/`resolveSceneConflicts` ~2331): reconciles facts **within** a wave only; cross-wave/chapter contradictions are not reconciled at write time — risk **W5**.
- **Stage heartbeat** aborts client side only (W9).
- **Per-entity commit transaction** in `commitSync` (205) — but `pushOne` (sync) is **outside** any transaction (W7).
- Debounced persistence: `AGENTS.md` mandates debounced IndexedDB writes (`wordCountTimer`, per-field timers). Concurrent scene commits could race on shared reactive state (`writtenScenes`, `progress`), though they write distinct subsection rows.

---

## 9. External integrations

- **AI providers** (`services/providers/*`): `ollama` (local, `http://localhost:11434`), plus OpenAI/Anthropic/Google/etc. Routing via `resolveFeatureConfig` (`aiService.ts:333`) honoring `settings.localOnly`. Ollama endpoint is also available in-browser at `/ollama` (proxy) — direct `localhost:11434` is for headless scripts.
- **PostgreSQL (backend)** reached only via `SyncTransport` (`_api` injected `ApiFn`). The local app never writes Postgres directly; sync is a background timer (`_startFlushTimer` in `sync-engine.ts:62`).

---

## 10. Persistence & caching

- **Dexie/IndexedDB** (`db-core.ts:67`, schema `db-schema.ts` v11–v47). Key tables: `projects`, `manuscripts`, `sections`/`subsections` (manuscript body), `characters`, `locations`, `plotThreads`, `characterRelationships`, `storyElements`, `groupEdges`/`graphEdges` (with validity windows), `volumes`, `snapshots`, `storyDocuments`, `generatedStories`, `pendingDeletions`, sync queue/maps, `sessionArchive`, `storyStateSnapshots`.
- **Two-tier write:** parallel path writes `subsections` (manuscript) only; sequential path additionally writes bible + graph via `commitSync`. Neither path is the same as the Postgres sync (separate background process).
- **Response cache** (`aiResponseCache.ts`, Dexie-backed) — caches provider responses (could mask non-determinism across retries if not keyed on full request hash).
- **Idempotency tracker** (`aiService.ts:263` `IdempotencyTracker.dedup` 276) keys on SHA-256 of `(provider, model, temperature, feature, systemPrompt, prompt)` — **in-flight only**; entry deleted on `.finally` (285). Not a persisted idempotency key (W8).

---

## 11. Auth / authorization

- Not enforced in the generation pipeline itself; the `SyncTransport` assumes an authenticated `ApiFn` is injected. Project scoping is by `projectId`/`storyApiId` (`idMap.resolveStoryApiId`). No per-tenant guard was found inside the consistency/persistence modules — out of scope for this validation but noted.

---

## 12. Existing tests & fixtures

Under `src/tests/`: `unit/useVolumeStoryGenerator.test.js`, `.spine.test.js`, `consistencyNovel.test.js`, `deterministicContradictions.test.js`, `guardrailRegistry.test.js`, `guardrailGuards.test.js`, `guardrailStorage.test.js`, `guardrailIntegration.test.js`, `delegatorRouting.test.js`, `delegatorNoBypass.test.js` (asserts `commitSync` called once), `batchChapterAlignment.test.js`, `tenVolumeScale.test.js`, `idempotencyTracker.test.js`, `factLedgerDigests.test.js`, `edgeTimeline.test.js`; `audit/consistencyAudit.test.js`; `integration/StoryGeneratorPanel.chapter.integration.test.js`. Fixtures in `src/tests/fixtures/`.

---

## 13. Docs / architectural decisions

- `AGENTS.md` (root): offline-first Dexie + background sync; perf rules (Maps not `Array.find` in render loops; debounce).
- `generated-novel/CONSISTENCY-REPORT.md`: prior multi-chapter analysis (F1–F6) and the `undocumentedCharacterGuard` hardening.
- Most rationale is **long inline comments** in `useVolumeStoryGenerator.ts`, `db-generation.ts`, `aiService.ts`, `useStoryWriter.ts`, `useChapterGenerationSync.ts`, `deterministicContradictions.ts`. `db-schema.ts` references `docs/database-schema-changelog.md` (not present in tree).

---

## 14. Identified risks (root-cause class)

| ID | Risk | Verified? | Where |
|----|------|-----------|-------|
| **W1** | Scene-commit guardrail result discarded; consistency-guard failure swallowed by salvage path → inconsistent scene persisted. | ✅ read | `useStoryWriter.ts:1122-1148` |
| **W2** | Default enforcement `detective`; sync push never throws → blocking guards are effectively report-only out of the box. | agent | `aiGuardrails.ts:18`, `storageGuardrails.ts:114-116` |
| **W3** | Parallel (one-click) write path never calls `discoverSync`/`commitSync` → story bible + graph left empty/unchanged for a full volume. | ✅ read | `useVolumeStoryGenerator.ts:1966` vs `2749` |
| **W4** | Incremental consistency checks skipped on parallel path (only terminal audit). | ✅ read | `:2740` (seq only) |
| **W5** | Cross-wave contradiction blind spot (reconcile within wave only). | agent | `:2331` `detectSceneConflicts` |
| **W6** | `commitSync` rebuilds `nameToId` per call; edges to not-yet-known entities are silently dropped. | agent | `useChapterGenerationSync.ts:152,305` |
| **W7** | `pushOne` POST then `modify(synced)` outside a transaction; success+raced-fail or `withRetry` on timeout → duplicate server row (no idempotency key). | ✅ read | `sync-transport.ts:76-117` |
| **W8** | AI idempotency is in-flight only; retry after lost response re-executes provider call (no request-id). | agent | `aiService.ts:263-287` |
| **W9** | Stage heartbeat aborts client only; orphaned in-flight server generation not reconciled. | agent | `db-generation.ts:88` |
| **W10** | Legacy `graphEdges` rows lack validity windows; read as always-true, can shadow supersession logic. | agent | `db-schema.ts` |

These are the hypotheses the 100-chapter scenario will exercise and, where confirmed, fix with systemic safeguards (see `CONSISTENCY_LEDGER.md` and `PIPELINE_VALIDATION_REPORT.md`). The strongest *real* consistency guarantee is the deterministic-contradiction engine (§5) — the LLM critic (`checkContradictions`) is advisory and unreliable on the local model, so the validation weights deterministic checks heavily.
