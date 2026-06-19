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
- **revisionEffectiveness gate thresholds**: Exact delta/change% thresholds deferred to Phase 4
- **No-gate CLI flag**: Useful for development; not implemented yet

## Resolved Items

### EVAL-03: Dimension Key Cross-Reference — RESOLVED (False Positive)

Ran a full diff of `dimensionScores` keys in `documentPrompts.js` critic prompts vs `evalDimensions.js` config definitions. **All keys match perfectly** for all 6 workspace types:

| Workspace | Prompt Keys | Config Keys | Status |
|-----------|-------------|-------------|--------|
| creative | continuity, voice, emotional_goal, show_tell, pacing | continuity, voice, emotional_goal, show_tell, pacing | ✅ Match |
| novel | continuity, voice, emotional_goal, show_tell, pacing | continuity, voice, emotional_goal, show_tell, pacing | ✅ Match |
| legal | clarity, ambiguity, liability, missing_provision | clarity, ambiguity, liability, missing_provision | ✅ Match |
| technical | architecture, interface, security, validation | architecture, interface, security, validation | ✅ Match |
| business | viability, financial, assumptions, kpi_clarity | viability, financial, assumptions, kpi_clarity | ✅ Match |
| research | rigor, methodology, citations, reproducibility | rigor, methodology, citations, reproducibility | ✅ Match |

**Root cause of review concern**: The reviewer flagged EVAL-03 based on a comment in GAPS.md ("Critic prompts not yet updated to produce these dimensions" — referring to *deferred* gap dimensions, not the existing 5). The 30 core dimensions and their prompt keys were already aligned.

**Real gap surfaced**: 10 of 16 workspace types (screenplay, invoice, presentation, email, documentation, pressRelease, grant, meeting, caseStudy, general) have no custom critic prompts or dimension definitions. They fall through to `DOCUMENT_PROMPTS.creative` / `CREATIVE_DIMENSIONS` fallback — documented in GAPS.md.

### D7: Per-Dimension Scoring Interface Design

**Data flow sketch** — how per-dimension scores travel from Critic to storage to UI:

```
Critic (LLM)                  Frontend                   Storage
───────────                   ────────                   ───────
dimensionScores: {     →      EvalPanel.vue        →    Dexie scene record
  continuity: 7,              reads & displays           stores dimensionScores
  voice: 8,                   per-dimension score        in JSON blob
  emotional_goal: 6,          bars + labels
  show_tell: 9,
  pacing: 5
}
```

**Critic response format change**:
- **Before**: Critic returns `{ score: 7, pass: true, issues: [...] }` — single aggregate 1-10
- **After**: Critic returns same shape PLUS `dimensionScores: Record<string, number>` — per-dimension scores that match `evalDimensions.js` keys for the workspace type
- The aggregate `score` continues to be the mean of `dimensionScores` values for backward compatibility
- The `pass` field remains derived from issues (no major issues, ≤2 minor)

**Pipeline changes needed**:
1. **Critic prompt**: Already includes `dimensionScores` JSON shape in the output spec (`documentPrompts.js` lines 92, 119, 152, 185, 218) — keys verified matching `evalDimensions.js`
2. **useStoryCritic.js**: After parsing the LLM response, validate `dimensionScores` keys exist for the workspace type and extract them alongside `score`
3. **Dexie scene model**: Add `dimensionScores` to the scene schema (already stored as part of the scene object in `src/services/noteStorageService.js` via the general `update` method)
4. **EvalPanel.vue**: Currently reads `scene.score` — add `scene.dimensionScores` reading with per-dimension bars
5. **EvalDashboard.vue**: Already processes `scene.dimensionScores` at line 212 — confirm the aggregation logic works when scores are present
6. **Gate logic** (`evalGates.js`): `gateDimensionCoverage` can now check that at least N of the expected dimensions have scores — no stub logic needed

**Backward compatibility**: If `dimensionScores` is absent (old scenes), fall back to the single `score` as the only dimension value with label "Overall". The UI should handle both old and new formats transparently.

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
