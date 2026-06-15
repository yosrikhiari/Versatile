# Requirements — AI Pipeline Evaluation & Quality Gates

## v1 Requirements

### Evaluation Audit
- [ ] **EVAL-01**: Map every dimension the Critic agent currently evaluates (plot, character, pacing, etc.)
- [ ] **EVAL-02**: Define scoring rubrics for each dimension (what does 1-10 mean?)
- [ ] **EVAL-03**: Verify rubric coverage against common fiction writing quality frameworks
- [ ] **EVAL-04**: Audit Critic output against rubrics for consistency (same input → same scores)
- [ ] **EVAL-05**: Measure Revisor response quality — does revision actually address Critic feedback?

### Automated Quality Gates
- [ ] **GATE-01**: Automated check that Critic covers all defined dimensions in every evaluation
- [ ] **GATE-02**: Automated check that Critic scores are within expected distributions (no degenerate outputs)
- [ ] **GATE-03**: Automated check that Revisor's revision addresses key Critic issues
- [ ] **GATE-04**: Test suite for AI pipeline evaluation (unit tests for eval logic, not AI calls)

### Feedback Loop
- [ ] **LOOP-01**: Surface dimension-level scores in the pipeline output (not just aggregate)
- [ ] **LOOP-02**: Track score deltas before/after revision cycle
- [ ] **LOOP-03**: Visual indicator when a dimension degrades after revision

## v2 Requirements (Deferred)
- Author Voice consistency scoring (depends on Phase 2 integration)
- Automated regression tests comparing against golden datasets
- User-configurable evaluation dimensions

## Out of Scope
- Adding new AI provider connectors
- Changing the underlying generation logic in Director/Writer
- Backend/API changes or database migration
- UI redesign or new workspace types
