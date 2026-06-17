# Phase 1: Evaluation Framework Definition — Context

## Purpose
Define the Critic agent's evaluation dimensions, scoring rubrics, quality gates, and validation strategy. This phase establishes the contract between Critic output and downstream quality checks.

## Status
- Dimensions defined: 30 rubrics (1–10 scale) across 6 workspace types (Creative/Novel, Legal, Technical, Business, Research)
- Quality gates: `dimensionCoverage` and `scoreDistribution` implemented; `revisionEffectiveness` is a stub
- Coverage gaps documented in `GAPS.md`; dimensions NOT added in Phase 1 (deferred)

## Decisions

### D1: Scoring Scale — Keep 1–10 (Granular)
- **Rationale**: Already implemented; fine granularity needed for tracking subtle improvements across revision cycles
- **Evidence**: `evalDimensions.js` contains 30 dimension definitions with behavioral descriptors at every level
- **Anchors**: Each level has a prose descriptor; dimension-specific lower/upper bounds are enforced where applicable

### D2: Coverage Gaps — Defer All to Future Phases
- **Rationale**: 9 gaps identified vs McKee, Freytag, Campbell, Gardner, Swain; Critic prompts not yet updated to produce these dimensions; adding dimensions without prompt support creates misleading zero-score noise
- **Evidence**: `GAPS.md` lists G1 (subplot integration) through G9 (sensory detail)
- **Action**: GAPS.md serves as prioritization queue for dimension expansion; re-evaluate when Critic prompts are updated

### D3: Gate Failure Action — Warn by Default, Block Only When `strict: true`
- **Rationale**: Gates should surface problems for human review without breaking the writing flow; `strict: true` (per-gate or global) escalates to blocking
- **Evidence**: `evalGateConfig.js` has `strict` option per gate; `evalGates.js` already respects this pattern
- **Impact**: No code changes needed — existing config supports this

### D4: Revision Gate Design — Score Delta + Word Change %
- **Rationale**: Simplest measurable proxy for revision quality; score delta shows improvement, word change % ensures the Revisor actually modified text (not echo)
- **Implementation**: Deferred to Phase 4 alongside UI panels
- **Open Question**: Threshold values for "effective" revision (e.g., delta >= 1 AND change% >= 10%) — refine during Phase 4

### D5: Rubric Format — Dimension-Specific Behavioral Descriptors per Level
- **Rationale**: Generic 1–10 is ambiguous; each level in every dimension needs explicit behavioral criteria
- **Evidence**: Current rubrics in `evalDimensions.js` already use this format (e.g., Continuity level 3: "Some major gaps")
- **Consistency Note**: `rubricGrade` + `rubricDescription` field naming should be unified across `storyDocuments` and `documentPrompts` — tracked but not blocking

### D6: Workspace-Specific Dimensions — Loaded via `dimensionMap`
- **Rationale**: Each workspace type needs tailored dimensions; base Creative set is extended (not replaced) for Novel, overwritten for others
- **Evidence**: `evalDimensions.js` lines 3–5: Legal uses direct check, others use spread
- **Inheritance**: Novel inherits all 5 Creative dimensions plus Novel-specific variants

## Unresolved Items
- **EVAL-03**: "Verify rubric coverage against existing Critic prompts" — pending. Run comparison of Critic prompt `dimensionScores` keys vs `evalDimensions.js` keys per workspace type. Expect mismatches where prompts use legacy dimension names.
- **revisionEffectiveness gate thresholds**: Exact delta/change% thresholds deferred to Phase 4
- **No-gate CLI flag**: Useful for development; not implemented yet

## File References
| File | Role |
|------|------|
| `src/config/evalDimensions.js` | Source of truth for dimensions + rubrics |
| `src/config/evalGateConfig.js` | Gate configuration (enable, strict, suspectScore) |
| `src/services/evalGates.js` | Gate logic; `gateRevisionEffectiveness` is stub |
| `src/config/workspace.js` | Workspace type enum |
| `.planning/codebase/GAPS.md` | Identified coverage gaps |
| `.planning/codebase/ARCHITECTURE.md` | Orchestrator loop context |
| `.planning/phases/phase-1/PLAN.md` | Original phase plan |
| `.planning/phases/phase-1/DIMENSIONS.md` | Pre-CONTEXT dimension documentation |

## Downstream Contracts
- **Phase 2 (Audit)**: Consumes dimension names and expected score ranges from `evalDimensions.js` to validate Critic output consistency
- **Phase 3 (Gates)**: Already integrated — gates read dimensions from evalDimensions.js
- **Phase 4 (UI)**: Needs gate result format (pass/fail/scores per dimension) and delta tracking structure — design during Phase 4
