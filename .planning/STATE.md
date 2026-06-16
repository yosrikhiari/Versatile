# STATE.md — Project Memory

## Project Reference

**Project**: Versatile — AI-powered fiction writing assistant
**Core Value**: Multi-agent generation pipeline (Director → Writer → Critic → Revisor) that helps writers produce, evaluate, and iteratively improve fiction
**Milestone**: AI Pipeline Evaluation & Quality Gates
**Current Focus**: Phase 1 — Evaluation Framework Definition

## Current Position

**Phase**: 1 — Evaluation Framework Definition
**Plan**: TBD
**Status**: Not started
**Progress**: [□□□□□□□□□□] 0%

## Performance Metrics

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Requirements mapped | 12/12 | 12 | ✓ Full coverage |
| Phases defined | 4 | 4 | Fine granularity |
| UI phases identified | 1 | — | Phase 4 flagged |

## Accumulated Context

### Decisions
- Milestone scope strictly limited to Critic/Revisor evaluation pipeline — no Director/Writer changes
- All work is frontend-only (Vue 3 / client-side) — no backend
- Phase ordering follows natural dependency chain: define → audit → automate → surface

### Requirements Coverage

| Req ID | Description | Phase | Status |
|--------|-------------|-------|--------|
| EVAL-01 | Map Critic evaluation dimensions | 1 | Pending |
| EVAL-02 | Define scoring rubrics per dimension | 1 | Pending |
| EVAL-03 | Verify rubric coverage against frameworks | 1 | Pending |
| EVAL-04 | Audit Critic output consistency | 2 | Pending |
| EVAL-05 | Measure Revisor response quality | 2 | Pending |
| GATE-01 | Auto-check Critic dimension coverage | 3 | Pending |
| GATE-02 | Auto-check score distributions | 3 | Pending |
| GATE-03 | Auto-check Revisor addresses issues | 3 | Pending |
| GATE-04 | Test suite for eval logic | 3 | Pending |
| LOOP-01 | Surface dimension-level scores | 4 | Pending |
| LOOP-02 | Track score deltas | 4 | Pending |
| LOOP-03 | Visual indicator for degradation | 4 | Pending |

### Blockers
None — milestone is ready to start.

### Technical Notes
- Existing source: `useStoryCritic` and `useStoryRevisor` composables in `src/composables/`
- Test framework: Vitest (72 existing tests, none covering eval)
- AI providers: raw `fetch()` calls (no SDKs) in `src/services/providers/`
- Data model: Dexie.js/IndexedDB for all structured data

### Pending Todos

| Todo | Area | Created |
|------|------|---------|
| Handle 1M+ character documents without browser crash | general | 2026-06-16 |

## Session Continuity

### Last Session
- Not applicable (new milestone)

### Current Blockers
None

### Next Actions
1. Approve ROADMAP.md
2. Execute `/gsd-plan-phase 1` to create execution plan for Phase 1
3. Phase 1: Map Critic evaluation dimensions and define rubrics
