# STATE.md — Project Memory

## Project Reference

**Project**: Versatile — AI-powered fiction writing assistant
**Core Value**: Multi-agent generation pipeline (Director → Writer → Critic → Revisor) that helps writers produce, evaluate, and iteratively improve fiction
**Milestone**: AI Pipeline Evaluation & Quality Gates
**Current Focus**: v0.5 — Research/RAG System & Infrastructure Hardening

## Current Position

**Phase**: v0.5 (Dialogue System, Voice Lab, ResearchPanel Polish)
**Status**: Committed — dialogue pipeline, voice profiles, StoryNetwork, ResearchPanel UX
**Progress**: 163 eval tests (Phases 1-4) + new utilities and dialogue infrastructure

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
- Dialogue detection/parsing pipeline built as composable + utility layer — decoupled from any specific UI
- Voice profiles stored as plain config (`src/config/voiceProfiles.js`) — easy to extend without DB schema changes

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

All 3 prior todos now captured in **v0.5 Milestone** (Research/RAG System & Infrastructure Hardening) — see `.planning/milestones/v0.5-rag-infrastructure.md` and `.planning/ROADMAP.md`

| Todo | Milestone Phase | 
|------|-----------------|
| Handle 1M+ character documents without browser crash | v0.5 Phase A |
| Connect PostgreSQL database and link frontend to backend | v0.5 Phase B |
| Investigate and accelerate document embedding indexing throughput | v0.5 Phase C |

## Session Continuity

### Prior Sessions
- **2026-06-18**: Phase 4 — EvalPanel UI, RevisionDeltaPanel, degradation service, useSceneEval composable, wiring into StoryGeneratorPanel (23 unit tests)
- **2026-06-19**: ResearchPanel UX polish — focus trap on size-warning modal, toast notifications for document operations

### Current Session (2026-06-21)
- **Dialogue Detection Pipeline**: Created `src/utils/dialogueDetector.js` (regex-based detection of dialogue lines), `src/utils/dialogueParser.js` (structured extraction with speaker, text, context), `src/utils/speakerIdentifier.js` (cross-scene speaker tracking); all decoupled from UI
- **Dialogue Indexer**: `src/composables/useDialogueIndexer.js` — manages dialogue DB operations via `src/services/db-dialogue.js`; exposes `indexScenes()` and `queryDialogue(searchTerm)`
- **Voice Lab**: `src/config/voiceProfiles.js` — emotion-to-voice mapping config (11 emotions × tone/speed/pitch profiles); `src/components/voice-lab/VoiceLabPanel.vue` — voice profile selection and preview UI
- **Scene Context Service**: `src/services/sceneContextService.js` — builds structured scene briefs (characters, setting, tension, arc) for prompt-building
- **Utilities**: `src/composables/useFocusTrap.js` (modal a11y), `src/composables/useAsyncError.js` (async error boundary), `src/composables/usePromptBuilder.js` (prompt template system)
- **AutoDialogue Extension**: `src/extensions/AutoDialogue.js` — ProseMirror plugin for auto-formatting dialogue during writing
- **StoryNetwork Visualization**: New `StoryNetwork.vue` component wired into `StoryBiblePanel.vue` — graph-based character/relationship view
- **Cleanup**: Removed `src/services/debugSnapshot.js`, `src/services/generation/entityGeneration.js`, stale generation context/shaping/pipeline composables, old todo files
- **ResearchPanel Polish**: Focus trap, toast notifications (re-baselined from 2026-06-19)

### Technical Notes Additions
- Dialogue pipeline uses regex-based detection (not ML) — fast, deterministic, no AI dependency
- Voice profiles are plain JS configs — no DB storage needed for phase 1
- `usePromptBuilder` templates support `{{variable}}` interpolation and partial rendering

### Brainstorming — Story Shape Panel (v1.3)
A new Story Shape Panel was designed and committed to the roadmap as **v1.3**:
- **Problem**: Writers need to see narrative shape (tension, emotion, character focus, structure) across scenes
- **Analysis**: Hybrid heuristic + AI analysis of all manuscript scenes
- **Visualization**: 4 interactive charts — TensionCurve, EmotionalArc, CharacterFocusMatrix, NarrativeStructureTimeline
- **Design doc**: `.planning/brainstorming/shape-panel-session.md`
- **Roadmap**: 4 phases from heuristic baseline through full combined view

### Completed Milestones
| Milestone | Status | Completed |
|-----------|--------|-----------|
| v1.0 — AI Pipeline Evaluation & Quality Gates | ✅ | 2026-06-18 |
| v0.5 — Research/RAG System & Infrastructure Hardening | ✅ | 2026-06-21 |
| v1.1 — Writer & Eval Quality Improvements | ✅ | 2026-06-21 |
| v1.2 — UI/UX Polish | ✅ | 2026-06-21 |

### Current Work: v1.3 — Story Shape Panel 🚧
All prior milestones shipped. Now starting v1.3 (4 phases):
1. Heuristic Analyzer & TensionCurveChart
2. AI Narrative Analyzer & NarrativeStructureTimeline
3. EmotionalArcChart & CharacterFocusMatrix
4. Combined view, annotations, zoom, export

### Current Blockers
None.

### Next Actions
Begin **v1.3 Phase 1: Heuristic Analyzer & Tension Curve**:
- Implement heuristic scene analyzer composable
- Build IndexedDB service for analysis results
- Create TensionCurveChart component
- Integrate new panel into workspace system
