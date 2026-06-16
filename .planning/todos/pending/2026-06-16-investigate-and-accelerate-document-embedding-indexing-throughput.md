---
created: 2026-06-16T11:15:00+01:00
title: Investigate and accelerate document embedding indexing throughput
area: general
files:
  - src/services/embeddingQueue.js:34
  - src/services/embeddingService.js:18
  - src/composables/useSemanticChunking.js:59
  - src/services/documentChunker.js:52
  - src/composables/useEmbeddingIndexer.js
  - src/composables/useResearchDocuments.js:148
  - src/composables/useManuscriptContext.js:140
---

## Problem

The document/embedding indexing pipeline has several performance bottlenecks that slow down document import, reindexing, and manuscript context retrieval:

1. **Sequential queue processing** (`embeddingQueue.js:38`): The `processQueue()` loop dequeues and processes one batch at a time with a single `await getEmbeddings()`. No concurrency — each embedding API call blocks the next. For large documents with hundreds of chunks, this creates a serial waterfall of API calls.

2. **Semantic chunking embeds every sentence** (`useSemanticChunking.js:59`): `computeChunksForSentences()` calls `getEmbeddings()` for every sentence to compute pairwise similarity for split decisions. This means a 500-sentence document makes 500 embedding API calls just to determine where chunk boundaries fall — before the actual document indexing even begins.

3. **Reindex is all-or-nothing** (`useResearchDocuments.js:148`): `reindexDocument()` recomputes chunks and re-embeds the entire document with no incremental or hash-based skip. If one paragraph changes, everything gets reprocessed.

4. **No embedding caching by content hash**: Two documents with overlapping content or the same document imported twice generate duplicate embedding API calls.

## Solution

TBD — options to investigate:

- **Parallel batch dispatch**: Process N batches concurrently in `embeddingQueue.processQueue()` within provider rate limits (e.g., 2–3 in-flight requests)
- **Skip embedding for chunk boundary detection**: Use a cheaper heuristic (paragraph breaks, heading detection, token count) before semantic merging, reducing embedding calls by 10–100x for long texts
- **Content-hash caching**: Store `sha256(text) → embedding` in IndexedDB to skip duplicate embedding calls on reindex
- **Incremental reindex**: Compare old vs new chunk hashes; only re-embed changed chunks
- **Batch size tuning**: Expose batch size override in settings UI; benchmark optimal batch size per provider (Ollama local vs Mistral API)
- **Progress feedback during indexing**: Surface per-chunk progress in the UI for large documents so users see activity rather than a frozen screen
