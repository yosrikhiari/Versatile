# Extraction Plan: useVolumeStoryGenerator.js

**File:** `src/composables/useVolumeStoryGenerator.js` (2330 lines)
**Goal:** Extract module-level pure functions into `generation/` submodules, reducing file size and isolating AI-facing logic for testability.
**Principle:** Zero behavior change. Each extraction verified via `git diff --stat` + `node -e "require()"` smoke test.

---

## Phase 1 — Module-Level Helpers (lines 28–491)

These are pure or nearly-pure functions defined outside the composable. No reactive refs, no Pinia stores. Safest extraction.

### 1a. Spine Helpers → `generation/context/spine.js`

| Function                 | Lines   | Deps                                                                                             | Notes              |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| `isOllamaProvider`       | 28–35   | `useAiService` (imported)                                                                        |                    |
| `PARALLEL_CHAPTER_LIMIT` | 37      | `isOllamaProvider`                                                                               |                    |
| `formatFullSpineEntry`   | 39–55   | none                                                                                             |                    |
| `SPINE_ENTRY_SCHEMA`     | 100–110 | none                                                                                             | Plain object       |
| `compressSpine`          | 112–121 | `formatFullSpineEntry`                                                                           |                    |
| `SPINE_TIMEOUT_MS`       | 147     | none                                                                                             | Constant           |
| `fallbackSpineEntry`     | 153–168 | none                                                                                             |                    |
| `generateSpine`          | 170–242 | `SPINE_TIMEOUT_MS`, `SPINE_ENTRY_SCHEMA`, `fallbackSpineEntry`, `aiGenerateJson`, `useAiService` | Async, uses import |

**Export contract:**

```js
export {
  isOllamaProvider,
  PARALLEL_CHAPTER_LIMIT,
  formatFullSpineEntry,
  SPINE_ENTRY_SCHEMA,
  compressSpine,
  SPINE_TIMEOUT_MS,
  fallbackSpineEntry,
  generateSpine
}
```

### 1b. Context/Retrieval → `generation/context/sceneContext.js`

| Function                      | Lines   | Deps                                                        | Notes    |
| ----------------------------- | ------- | ----------------------------------------------------------- | -------- |
| `buildExistingEntitiesBlob`   | 254–279 | none                                                        |          |
| `buildFactLedger`             | 57–82   | none                                                        |          |
| `EMBEDDING_CONTEXT_MAX_CHARS` | 281     | none                                                        | Constant |
| `buildEmbeddingContext`       | 361–402 | `selectRelevantPriorScenes`, `EMBEDDING_CONTEXT_MAX_CHARS`  |          |
| `selectRelevantPriorScenes`   | 404–424 | none                                                        |          |
| `PROSE_EXCERPT_MAX_SCENES`    | 359     | none                                                        | Constant |
| `buildRetrievalContext`       | 432–491 | `buildEmbeddingContext`, `getEmbedding`, `cosineSimilarity` | Async    |
| `planConsistencyFixes`        | 297–347 | none                                                        |          |

**Export contract:**

```js
export {
  buildExistingEntitiesBlob,
  buildFactLedger,
  buildEmbeddingContext,
  selectRelevantPriorScenes,
  buildRetrievalContext,
  planConsistencyFixes,
  EMBEDDING_CONTEXT_MAX_CHARS,
  PROSE_EXCERPT_MAX_SCENES
}
```

### 1c. Concurrency → `generation/utils.js` (extend existing)

| Function            | Lines   | Deps | Notes                       |
| ------------------- | ------- | ---- | --------------------------- |
| `parallelWithLimit` | 123–143 | none | Already in composable scope |

Already exist in `generation/utils.js`: `retryWithBackoff`, `sanitizeJsonResponse`, `sanitizeJson`, `FIELD_LENGTH_CONSTRAINTS`, `normalizeField`, `wrapApiError`.

---

## Phase 2 — Composable Helpers (inside `useVolumeStoryGenerator()`)

These reference reactive refs and sub-composables. Extraction requires parameter passing or a `setup()` pattern.

### 2a. Scene Review Callbacks

| Function          | Lines     | Cross-refs                                                                            |
| ----------------- | --------- | ------------------------------------------------------------------------------------- |
| `approveScene`    | 2160–2169 | `currentSceneResult`, `writeParams`, `commitAndStoreScene`, `phase`, `writeNextBatch` |
| `rejectScene`     | 2171–2179 | `currentSceneResult`, `logRejectedPattern`, `phase`, `writeNextBatch`                 |
| `rerequestScene`  | 2181–2189 | `currentSceneResult`, `scenePlan`, `currentWriteIndex`, `phase`, `writeNextBatch`     |
| `regenerateScene` | 2081–2158 | Many refs + `buildRetrievalContext`, `computeSummary`, `completeGeneration`           |

**Strategy:** Keep inline. These are short (9–78 lines each) and tightly coupled. Extraction would require passing 6+ refs — not worth it.

### 2b. Checkpoint/Persistence Helpers

| Function               | Lines     | Cross-refs                                                           |
| ---------------------- | --------- | -------------------------------------------------------------------- |
| `buildCheckpointState` | 563–591   | `writeParams`, `phase`, `volumeId`, `scenePlan`, `chapterPlan`, etc. |
| `commitAndStoreScene`  | 750–788   | `manuscriptStore`, `phase`, `progress`                               |
| `completeGeneration`   | 1947–2052 | Many refs + `sync`, `saveGenRun`, `getFailedSubsections`             |

**Strategy:** Keep inline. `buildCheckpointState` is already a coherent block but references 10+ refs.

### 2c. Orchestration Functions

| Function                | Lines           | Cross-refs                                                      |
| ----------------------- | --------------- | --------------------------------------------------------------- |
| `startGeneration`       | 790–1102        | ALL sub-composables + ALL refs                                  |
| `runParallelGeneration` | 1104–1365       | `generateAnchor`, `generateMiddleScene`, `writer`, `sync`, etc. |
| `writeNextBatch`        | 1366–1871       | ALL refs + inline eval + `critic`                               |
| `repairFailedScenes`    | 1872–1946       | ALL refs + `critic`                                             |
| `resumeGeneration`      | 630–749         | ALL refs                                                        |
| `confirmPlan`           | 1603–1770 (est) | ALL refs + `director`, `batchCreatePlanStructure`               |
| `confirmSync`           | 2054–2079       | `sync`, `writeNextBatch`, `completeGeneration`                  |

**Strategy:** These are the god composable's core. Extraction would require a sub-composable or service pattern. Not worth it without a larger refactor.

### 2d. Dead Code

`useStoryRevisor` is imported in `useSceneEval.js` — NOT in `useVolumeStoryGenerator.js`. No dead code found in this file.

---

## Execution Order (safe, no behavior change)

1. Create `generation/context/spine.js` — extract spine helpers, verify no broken imports
2. Create `generation/context/sceneContext.js` — extract context/retrieval helpers, verify
3. Append `parallelWithLimit` to `generation/utils.js` — verify
4. Update `useVolumeStoryGenerator.js` — replace inline definitions with imports
5. Verify: `git diff --stat` shows only removals + import additions, no logic changes
6. Verify: `node -e "require('./useVolumeStoryGenerator')"` doesn't throw (once inside correct module system)

## Estimated Impact

| Metric                         | Before | After        |
| ------------------------------ | ------ | ------------ |
| File lines                     | 2330   | ~1700        |
| Module-level functions in file | 15     | 3 (imported) |
| Pure functions extracted       | —      | 18           |
| Files created                  | —      | 2 (or 3)     |
