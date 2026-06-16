---
created: 2026-06-16T05:35:57+01:00
title: Handle 1M+ character documents without browser crash
area: general
files:
  - src/services/documentChunker.js:52
  - src/composables/useSemanticChunking.js:156
  - src/composables/useResearchDocuments.js:46
  - src/components/research/ResearchPanel.vue:30
---

## Problem

Importing large research documents (1M–2M+ characters) causes the browser tab to freeze or crash during chunking. The `chunkDocument()` → `computeSemanticChunks()` pipeline processes the entire text in the main thread — yielding via `yieldToMain()` is insufficient for massive payloads. Sentence splitting, potential embedding generation, and chunking of 1M+ character texts overwhelms the browser's event loop. Users lose work/data when the tab crashes mid-import with no recovery.

## Solution

TBD — options include:
- Pre-split document before embedding pipeline (e.g. 500K sub-chunks processed sequentially)
- Web Worker to offload heavy processing off main thread
- Progressive/streaming import with per-batch UI progress updates
- File size warning before import with user confirmation
- Cap import size with truncation and warn user
