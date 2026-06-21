# Requirements — AI Pipeline Evaluation & Quality Gates

## v1 Requirements

### Evaluation Audit
- [x] **EVAL-01**: Map every dimension the Critic agent currently evaluates (plot, character, pacing, etc.) — implemented in `evalDimensions.js` (21 dimensions across 5 workspace types)
- [x] **EVAL-02**: Define scoring rubrics for each dimension (what does 1-10 mean?) — implemented with descriptive scoring per dimension
- [x] **EVAL-03**: Verify rubric coverage against common fiction writing quality frameworks — documented in `GAPS.md` (G1–G9 against McKee, Freytag, Campbell, Gardner, Swain)
- [x] **EVAL-04**: Audit Critic output against rubrics for consistency (same input → same scores) — `CONSISTENCY-AUDIT.md` with variance stats (mock-based)
- [x] **EVAL-05**: Measure Revisor response quality — does revision actually address Critic feedback? — `REVISOR-AUDIT.md` with short-circuit correctness, word-count analysis

### Automated Quality Gates
- [x] **GATE-01**: Automated check that Critic covers all defined dimensions in every evaluation — `gateDimensionCoverage()` implemented
- [x] **GATE-02**: Automated check that Critic scores are within expected distributions (no degenerate outputs) — `gateScoreDistribution()` implemented
- [x] **GATE-03**: Automated check that Revisor's revision addresses key Critic issues — `gateRevisionEffectiveness()` implemented
- [x] **GATE-04**: Test suite for AI pipeline evaluation (unit tests for eval logic, not AI calls) — 74 gate tests across 4 files, 163 total eval tests

### Feedback Loop
- [x] **LOOP-01**: Surface dimension-level scores in the pipeline output (not just aggregate) — per-dimension scores in EvalPanel component
- [x] **LOOP-02**: Track score deltas before/after revision cycle — `computeDegradation()` in `degradation.js`
- [x] **LOOP-03**: Visual indicator when a dimension degrades after revision — color-coded badges (green/yellow/red) in EvalPanel

## v2 Requirements (Deferred)
- Author Voice consistency scoring (depends on Phase 2 integration)
- Automated regression tests comparing against golden datasets
- User-configurable evaluation dimensions

## Out of Scope
- Adding new AI provider connectors
- Changing the underlying generation logic in Director/Writer
- Backend/API changes or database migration
- UI redesign or new workspace types

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EVAL-01 | Phase 1 | Complete | `evalDimensions.js` — 21 dims across 5 workspace types |
| EVAL-02 | Phase 1 | Complete | Per-dimension 1–10 descriptive scoring |
| EVAL-03 | Phase 1 | Complete | `GAPS.md` — 9 gaps documented |
| EVAL-04 | Phase 2 | Complete | `CONSISTENCY-AUDIT.md` — mock-based variance stats |
| EVAL-05 | Phase 2 | Complete | `REVISOR-AUDIT.md` — word-count, short-circuit analysis |
| GATE-01 | Phase 3 | Complete | `gateDimensionCoverage()` |
| GATE-02 | Phase 3 | Complete | `gateScoreDistribution()` |
| GATE-03 | Phase 3 | Complete | `gateRevisionEffectiveness()` |
| GATE-04 | Phase 3 | Complete | 74 gate tests, 163 total eval tests |
| LOOP-01 | Phase 4 | Complete | Per-dimension scores in EvalPanel |
| LOOP-02 | Phase 4 | Complete | `computeDegradation()` |
| LOOP-03 | Phase 4 | Complete | Color-coded degradation badges |
