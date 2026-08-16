# Cross-Chapter Continuity Hardening

## Goal
Add a deterministic cross-chapter seam-continuity check to the consistency engine (the project's hard QA gate) and promote the real-generation validation into a permanent, runnable integration test — closing the gap where narrative seams pass the LLM critic but still break.

## Tasks
- [ ] T1: In `src/services/generation/deterministicContradictions.ts`, add `checkSeamContinuity(digests, entityStates)` that flags adjacent scenes where the cast drops (no shared present character between consecutive scenes while characters are still alive) or a location jump with no travel established. Export it from `runDeterministicContradictionChecks`. → Verify: new rule appears in the returned array for a seeded seam break.
- [ ] T2: Wire `checkSeamContinuity` into the real path — confirm `ConsistencyService.maybeRunIncrementalConsistency` (chapter-boundary check) feeds it digests with `charactersPresent`/`location`. If the digest shape lacks those, extend the digest passed at `useVolumeStoryGenerator.ts:2841`. → Verify: an injected seam break in a real run is surfaced by the service.
- [ ] T3: Self-test the new rule in `scripts/validate-100-chapter.mjs` (add a seeded seam break + a consistent seam) so the harness asserts 1 detected / 0 false-positive. → Verify: harness green, rule fires on the seeded case.
- [ ] T4: Add unit test `src/tests/unit/deterministicSeam.test.js` (carried cast passes, cast-drop flagged, location jump flagged). → Verify: `npx vitest run deterministicSeam`.
- [ ] T5: Promote the real-generation script into a documented integration test: keep `scripts/generate-novel-and-analyze.mjs`, add an `npm run validate:novel` script entry, and assert seam-linked >= N/Total + W8/W11/deterministic verdicts. → Verify: `npm run validate:novel` exits 0 against local Ollama.
- [ ] T6: Run `npx tsc --noEmit` and full `npx vitest run`; update `CONSISTENCY_LEDGER.md` + `PIPELINE_VALIDATION_REPORT.md` (new rule, new test count). → Verify: tsc clean, 2753+ green.

## Out of scope (documented residuals, not implemented now)
- W8 provider-side idempotency tokens (needs provider support).
- W8 orchestrator-level stable request-id threading (larger refactor).

## Done When
- `checkSeamContinuity` is live in the hard gate and runs at chapter boundaries.
- Harness + unit test prove it fires on a break and stays silent on a consistent arc.
- `npm run validate:novel` is a permanent, Ollama-backed integration check.
- tsc clean, full suite green, docs updated.
