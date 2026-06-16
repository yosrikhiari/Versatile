# STATE.md — Project Memory

## Project Reference

**Project**: Versatile — AI-powered fiction writing assistant
**Core Value**: Multi-agent generation pipeline (Director → Writer → Critic → Revisor) that helps writers produce, evaluate, and iteratively improve fiction
**Milestone**: AI Pipeline Evaluation & Quality Gates
**Current Focus**: Phase 2 — Critic/Revisor Audit & Phase 4 UI Panels

## Current Position

**Phase**: 2 (Audit) + 4 (UI) parallel tracks
**Status**: In progress — codebase spans Phases 1-3 already
**Progress**: See requirements table below

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
| EVAL-03 | Verify rubric coverage against frameworks | 1 | ⏳ Pending | Need to validate against existing Critic prompts and output coverage |
| EVAL-04 | Audit Critic output consistency | 2 | ⏳ Pending | No consistency tests written yet |
| EVAL-05 | Measure Revisor response quality | 2 | ⏳ Pending | No revisor quality metrics yet |
| GATE-01 | Auto-check Critic dimension coverage | 3 | ✅ Done | `gateDimensionCoverage()` in `src/services/evalGates.js` |
| GATE-02 | Auto-check score distributions | 3 | ✅ Done | `gateScoreDistribution()` in `src/services/evalGates.js` |
| GATE-03 | Auto-check Revisor addresses issues | 3 | ✅ Done | `gateRevisionEffectiveness()` in `src/services/evalGates.js` |
| GATE-04 | Test suite for eval logic | 3 | ⏳ Pending | No Vitest tests for eval files yet |
| LOOP-01 | Surface dimension-level scores | 4 | ⏳ Pending | `EvalPanel` component not created |
| LOOP-02 | Track score deltas | 4 | ⏳ Pending | No delta tracking UI |
| LOOP-03 | Visual indicator for degradation | 4 | ⏳ Pending | No degradation indicators |

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

### Blockers
None.

### Technical Notes
- Existing source: `useStoryCritic` and `useStoryRevisor` composables in `src/composables/`
- Test framework: Vitest (72 existing tests, none covering eval)
- AI providers: raw `fetch()` calls (no SDKs) in `src/services/providers/`
- Data model: Dexie.js/IndexedDB for all structured data
- Volume pipeline (`useVolumeStoryGenerator.js`) does NOT store critique data — default rendering path
- Orchestrator pipeline (`useStoryOrchestrator.js`) stores full eval data — used in `StoryGeneratorPanel.vue` for chapter-level generation
- `StoryGeneratorPanel.vue` currently renders `volumeGenerator.writtenScenes` in the `complete` phase — Phase 4 panels must integrate here

### Pending Todos

| Todo | Area | Created |
|------|------|---------|
| Handle 1M+ character documents without browser crash | general | 2026-06-16 |
| Connect PostgreSQL database and link frontend to backend | api | 2026-06-16 |

## Session Continuity

### Last Session
- Milestone definition complete, ROADMAP.md approved
- Phase 1 evaluation framework implemented (dimensions + rubrics)
- Phase 3 quality gates implemented (3 gate functions)
- Orchestrator integration complete (critique + gate results per scene)
- Critic prompts updated across all workspace types

### Current Blockers
None

### Next Actions
1. ✅ ~~Phase 1 — Dimensions + Rubrics~~ (already done; STATE.md was stale)
2. ⏳ Phase 1 — EVAL-03: Verify rubric coverage against frameworks (quick audit)
3. ⏳ Phase 2 — EVAL-04/05: Critic consistency audit + Revisor quality measurement
4. ⏳ Phase 3 — GATE-04: Vitest suite for eval gates
5. ⏳ Phase 4 — LOOP-01/02/03: EvalPanel + RevisionDeltaPanel Vue components
6. ⏳ Phase 4 integration: Wire panels into StoryGeneratorPanel.vue
