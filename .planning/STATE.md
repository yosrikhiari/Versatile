# STATE.md — Project Memory

## Project Reference

**Project**: Versatile — AI-powered fiction writing assistant
**Core Value**: Multi-agent generation pipeline (Director → Writer → Critic → Revisor) that helps writers produce, evaluate, and iteratively improve fiction
**Milestone**: AI Pipeline Evaluation & Quality Gates
**Current Focus**: Phase 4 complete — evaluation/revision panels integrated in StoryGeneratorPanel.vue

## Current Position

**Phase**: 1-4 Complete
**Status**: All code for Phases 1-4 is done and tested
**Progress**: 65 new tests across 6 test files, all passing (23 are Phase 4 unit tests)

## Performance Metrics

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Requirements mapped | 12/12 | 12 | ✓ Full coverage |
| Phases defined | 4 | 4 | Fine granularity |
| Code implemented ahead of state | Yes | — | STATE.md was stale; code spans Phases 1-3 |

## Accumulated Context

### Decisions
- Milestone scope strictly limited to Critic/Revisor evaluation pipeline — no Director/Writer changes
- All work is frontend-only (Vue 3 / client-side) — no backend
- Phase ordering follows natural dependency chain: define → audit → automate → surface
- ROADMAP.md approved on 2026-06-16 — all 4 phases are planned for execution
- **Volume pipeline** (`useVolumeStoryGenerator`) is what UI renders — Phase 4 must bridge critique data into volume pipeline or build panels off orchestrator data

### Requirements Coverage

| Req ID | Description | Phase | Status | Evidence |
|--------|-------------|-------|--------|----------|
| EVAL-01 | Map Critic evaluation dimensions | 1 | ✅ Done | `src/config/evalDimensions.js` — 6 workspace types, 30 dimension definitions |
| EVAL-02 | Define scoring rubrics per dimension | 1 | ✅ Done | 1-10 rubrics with full descriptor per level for all 30 dimensions |
| EVAL-03 | Verify rubric coverage against frameworks | 1 | ✅ Done | Tests validate key alignment between Critic output & evalDimensions config |
| EVAL-04 | Audit Critic output consistency | 2 | ✅ Done | `src/__tests__/consistencyAudit.test.js` — 7 tests, all passing |
| EVAL-05 | Measure Revisor response quality | 2 | ✅ Done | `src/__tests__/revisorAudit.test.js` — 17 tests, all passing |
| GATE-01 | Auto-check Critic dimension coverage | 3 | ✅ Done | `gateDimensionCoverage()` in `src/services/evalGates.js` |
| GATE-02 | Auto-check score distributions | 3 | ✅ Done | `gateScoreDistribution()` in `src/services/evalGates.js` |
| GATE-03 | Auto-check Revisor addresses issues | 3 | ✅ Done | `gateRevisionEffectiveness()` in `src/services/evalGates.js` |
| GATE-04 | Test suite for eval logic | 3 | ✅ Done | `src/__tests__/evalGates.test.js` — 11 tests covering coverage, distribution, revision gates |
| LOOP-01 | Surface dimension-level scores | 4 | ✅ Done | `EvalPanel.vue` renders dimension scores, gate results, issues, strengths |
| LOOP-02 | Track score deltas | 4 | ✅ Done | `RevisionDeltaPanel.vue` shows word count delta, score delta, per-dimension delta |
| LOOP-03 | Visual indicator for degradation | 4 | ✅ Done | `computeDegradation()` in `degradation.js` — per-dimension delta badges in both panels |

### Implementation Details — Already Done

**Phase 1 — Evaluation Framework** (`src/config/evalDimensions.js`):
- 6 workspace type dimension sets: Creative (5), Novel (=Creative), Legal (4), Technical (4), Business (4), Research (4)
- 30 complete 1-10 rubric scales with behavioral descriptors at every level
- Weight and threshold functions per dimension

**Phase 2 — Orchestrator Integration** (`useStoryOrchestrator.js`):
- Critic + Revisor pipeline now stores per-scene `critiqueResult`, `revisionCritiqueResult`, `gateResults`
- `evalGates` summary computed at story finalization
- Re-run single scene also captures gate results

**Phase 3 — Quality Gates** (`src/config/evalGateConfig.js`, `src/services/evalGates.js`):
- `gateDimensionCoverage` — checks if Critic issues cover all expected dimensions
- `gateScoreDistribution` — flags suspicious score patterns (default fallback, score-issues mismatch)
- `gateRevisionEffectiveness` — measures score delta and word-change % between pre/post revision

**Critic Prompt Updates** (`src/config/documentPrompts.js`):
- All 6 workspace critic prompts now request `dimensionScores` in JSON output
- Dimension keys match the workspace-specific dimension names

**Phase 2 — Audit Tests** (`src/__tests__/consistencyAudit.test.js`, `src/__tests__/revisorAudit.test.js`):
- `consistencyAudit`: 7 tests — parseStructure captures dimensionScores, key alignment, distribution validation, edge cases (empty/partial/extra dims), active dimension filtering
- `revisorAudit`: 17 tests — revision attribution (consistent/partial/none), quality metrics (dimension-adjusted/equal-weight), edge cases (missing critiques, empty issues, negative score deltas)

**Phase 3 — Gate Tests** (`src/__tests__/evalGates.test.js`):
- 11 tests — dimension coverage (full, partial, empty), score distribution (default fallback, score-issues mismatch, uniform), revision effectiveness (improvement, new issues, missing data, zero change, max scores)
- Edge cases: empty issues array, missing `dimensionScores`, non-existent dimension key, all-same scores

### Blockers
None.

### Technical Notes
- Existing source: `useStoryCritic` and `useStoryRevisor` composables in `src/composables/`
- Test framework: Vitest (72 existing tests, none covering eval)
- AI providers: raw `fetch()` calls (no SDKs) in `src/services/providers/`
- Data model: Dexie.js/IndexedDB for all structured data
- Volume pipeline (`useVolumeStoryGenerator.js`) does NOT store critique data — default rendering path
- Orchestrator pipeline (`useStoryOrchestrator.js`) stores full eval data — used in `StoryGeneratorPanel.vue` for chapter-level generation
- Phase 4 panels (`EvalPanel.vue`, `RevisionDeltaPanel.vue`) wired into `StoryGeneratorPanel.vue` complete state view at lines 977–1007
- `useSceneEval` composable owns evaluation/revise lifecycle; stores per-scene results in `sceneResultsMap` for aggregate summary
- `degradation.js` is a pure utility function (`computeDegradation`) — independently testable, no Vue dependency

### Pending Todos

| Todo | Area | Created |
|------|------|---------|
| Handle 1M+ character documents without browser crash | general | 2026-06-16 |
| Connect PostgreSQL database and link frontend to backend | api | 2026-06-16 |
| Investigate and accelerate document embedding indexing throughput | general | 2026-06-16 |

## Session Continuity

### Current Session (2026-06-18)
- **Phase 4 (EvalPanel UI)**: Created `src/components/eval/EvalPanel.vue` — shows dimension scores, gate results, issues, strengths; accepts optional `degradation` prop for per-dimension delta badges (improvement/regression/no-change)
- **Phase 4 (RevisionDeltaPanel UI)**: Created `src/components/eval/RevisionDeltaPanel.vue` — shows word count delta, score delta, revised prose preview, per-dimension delta breakdown with degradation status (green/amber/red icons)
- **Phase 4 (Degradation Service)**: Created `src/services/degradation.js` — `computeDegradation(originalCritique, revisedCritique)` returns per-dimension `{ before, after, delta, status }` plus `hasRegressions`/`hasMajorRegressions` booleans; 8 unit tests
- **Phase 4 (useSceneEval composable)**: Created `src/composables/useSceneEval.js` — evaluate/revise/reset lifecycle, scene brief building, revision bounce detection, degradation computation; maintains `sceneResultsMap` for per-scene persistence; exposes `aggregateStats` computed (evaluated count, average score, total regressions, major regressions)
- **Phase 4 (Integration)**: All panels wired into `StoryGeneratorPanel.vue` complete state view; scene index passed through evaluate/revise handlers for aggregate tracking; story-level eval aggregate summary card added between quality card and scene list
- **Tests**: 23 Phase 4 unit tests across 2 files all passing; pre-existing 15 failures in integration tests unchanged (IndexedDB API unavailable in test env)
- **STATE.md updated** to reflect Phases 1-4 complete

### Current Blockers
None — Phase 4 fully implemented and tested.

### Next Actions
All 4 phases complete. Next milestone candidates:
- Writer pipeline improvements (Director/Writer integration)
- Production monitoring for eval metrics
- Story-level trend analysis across multiple revisions
