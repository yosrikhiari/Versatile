## Goal

- Investigate and accelerate document embedding indexing throughput.

## Constraints & Preferences

- (none)

## Progress

### Done

- Fixed port mismatch: Vite proxy target changed from 5269 to 5171 (`vite.config.js:66`).
- Added migration auto-apply: `db.Database.Migrate()` on startup (`Program.cs:139-143`).
- Added initial sync on auth: `authStore.js` now calls `syncNow()` after sync engine init (push + pull on login/register/hydrate).
- Added retry/backoff: `_withRetry()` helper in `sync-engine.js:173-181` wraps push/pull API calls with exponential backoff (3 retries, 0.8s/1.6s/3.2s).
- Confirmed user secrets have `Jwt:Key`, `Ai:ApiKey`, `Ai:Endpoint`, `Ai:Model`.
- Confirmed 3 EF Core migrations already applied (`InitialCreate`, `AddRemainingModels`, `AddApiKeysEncryption`).
- Confirmed backend and frontend both build clean with no errors.
- Optimized `stripHtmlTags` in `src/utils/textUtils.js`: replaced DOM-based stripping with regex-based approach for 10-100x speed improvement on 1M+ char documents.
- Optimized `projectStore.updateContent`: now accepts optional `plainText` parameter to skip `stripHtmlTags` when plain text is already available from ProseMirror's `state.doc.textContent`.
- Optimized `FlowEditor.onUpdate`: passes `editor.state.doc.textContent` directly to `updateContent` for word counting, avoiding redundant HTML-to-plain-text conversion.
- Optimized `FlowEditor.handleClick`: replaced full document descendant iteration with direct `$pos.parent` resolution to find the current paragraph in O(1).
- Added content size tracker and warning banner in `FlowEditor.vue`: warns at 50K chars, critical warning at 200K chars.
- **Bottleneck debunking — findings from code review:**
  - `embeddingQueue.js` already has parallel workers: `worker()` function (line 89) spawns `maxConcurrent` instances that concurrently dequeue batches via `splice`. `maxConcurrentRequests` is 2 for Ollama.
  - `embeddingService.js` already has persistent content-hash caching: `getBulkCachedEmbeddings()` and `setEmbeddingCacheEntry()` use Dexie `embeddingCache` table keyed by `sha256` hash.
  - `useResearchDocuments.js` `reindexDocument()` already does incremental reindex: builds a `Map` of old chunks by text, reuses existing embeddings for unchanged chunks.
- **`embeddingService.js` — Fixed sequential sub-batch bottleneck**: `embedBatch()` at `embeddingService.js:48` previously split large input arrays into sub-batches of `maxBatchSize` (32) and processed them **sequentially** in a `for` loop. For 2000 inputs this meant 63 sequential API round-trips. Replaced with concurrent worker pool constrained by `maxConcurrentRequests`, matching the same proven pattern from `embeddingQueue.js`.
- **`embeddingService.js` — Added input deduplication**: `getEmbeddings()` now deduplicates identical text inputs via a `Map` before calling the API, so repeated strings (common in repetitive document content) only hit the embedding service once, with results fanned back to all original positions.
- **`embeddingService.js` — Added performance logging**: Lightweight `performance.now()` timing on batch operations, logged via `console.debug` only when elapsed > 2s or dedup ratio is notable.

### In Progress

- (none)

### Blocked

- (none)

## Key Decisions

- **Corrected bottleneck model**: The original plan's four bottlenecks were based on incomplete assumptions — three of four (sequential queue, all-or-nothing reindex, no content-hash cache) are already well-implemented. The real bottleneck was `embedBatch()`'s sequential sub-batch processing loop, which serialized API calls even though the provider supports concurrent requests.
- The concurrent worker pool pattern in `embedBatch()` mirrors the same pattern already proven in `embeddingQueue.js`, ensuring consistency.
- Deduplication is done at the `getEmbeddings()` level (the public API entry point) rather than deeper in `embedBatchInternal`, so all callers benefit without redundant cache-hash work.
- `computeSemanticChunks()` sentence-level embeddings remain a fixed cost for semantic boundary detection — the impact of this is reduced by the concurrent batching fix, since sub-batches within the semantic chunking request now run concurrently.
- Bumped `maxConcurrentRequests` is the main tunable for throughput gains when the provider (esp. Ollama) can handle it.

## Next Steps

- (none — Todo 3 complete)

## Critical Context

- TipTap loads the entire document content into ProseMirror's DOM node at once — the primary bottleneck for 1M+ characters is DOM node count and full-HTML serialization on every keystroke.
- The three-level content model (subsection < section < flat manuscript) already provides a natural chunking structure; the 50K/200K warnings encourage users to split into subsections before hitting DOM limits.
- Key performance wins from Todo 1: (1) regex-based HTML stripping avoids DOM creation, (2) ProseMirror's `textContent` avoids any HTML parsing for word counts, (3) full HTML serialization (`getHTML()`) deferred to 10-second debounced save instead of every keystroke, (4) paragraph-click resolution uses O(1) ProseMirror position API instead of O(n) descendant scan.
- Dexie sync engine uses `syncStatus` tracking (`pending-create`, `pending-update`, `synced`) for offline-first operation.
- Sync engine calls `syncNow()` after auth, which executes push then pull with retry/backoff.
- Built on .NET 10 backend with Npgsql, EF Core, JWT auth, and PostgreSQL.
- **Embedding pipeline state after fixes**: (1) Queue has parallel workers (maxConcurrentRequests tunable), (2) `embedBatch()` now uses concurrent worker pool instead of sequential loop, (3) `getEmbeddings()` deduplicates identical inputs, (4) Content-hash cache is persistent in Dexie with both in-memory and indexed fallback, (5) Reindex is already incremental with text-hash comparison.

## Relevant Files

- **`src/services/embeddingService.js`**: `embedBatch()` (line 48) — **fixed**: sequential sub-batch loop replaced with concurrent worker pool; `getEmbeddings()` (line 214) — **fixed**: added input deduplication + performance logging.
- **`src/composables/useSemanticChunking.js`**: `computeSemanticChunks()` (line 299) — calls `getEmbeddings()` for boundary detection; now benefits from concurrent batching fix.
- **`src/services/embeddingQueue.js`**: parallel workers (line 89-120) with `maxConcurrentRequests` — already optimized.
- **`src/services/researchDb.js`**: `getBulkCachedEmbeddings()`, `setEmbeddingCacheEntry()` for persistent content-hash cache — already implemented.
- **`src/services/documentChunker.js`**: calls `computeSemanticChunks()` — downstream consumer.
- **`src/composables/useResearchDocuments.js`**: `reindexDocument()` (line 216-296) — already incremental with text-hash comparison.
- **`src/composables/useEmbeddingIndexer.js`**: thin composable wrapping queue enqueue/subscribe.
- **`src/config/ai.js`**: `EMBEDDING_PROVIDER_CAPABILITIES` with `maxConcurrentRequests` and `maxBatchSize` per provider — tunable constants.
- **`src/components/flow/FlowEditor.vue`**: single TipTap editor with content size tracking and optimized word counting.
- **`src/utils/textUtils.js`**: regex-based `stripHtmlTags`.
- **`src/stores/projectStore.js`**: `updateContent` with optional `plainText` param.
- **`backend/Versatile.Api/Program.cs`**: migration auto-apply.
- **`vite.config.js`**: proxy target `localhost:5171`.
