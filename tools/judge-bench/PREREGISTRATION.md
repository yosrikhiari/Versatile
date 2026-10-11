# P0-A judge calibration — pre-registration record (Task 7, final)

Date: 2026-10-11.

**No consensus entry has been analyzed as of this commit.**

This record freezes the calibration inputs before any run, per design-spec
§2 "Held-out split (pre-registered before adjudication)" and §3
"Pre-registration commit (condition 4)". No production behavior changes.
No calibration run. No data analysis (consensus data is absent from this tree).

- Pre-registration HEAD: `5f5c72a7`
  (`5f5c72a78ada420adc5b888ea3ffcd7d3033cbf7`,
  `feat(p0a): calibrate.mjs wired to report builder (no judge-path changes)`).
- Design spec: `docs/superpowers/specs/2026-10-11-p0a-label-derivation-design.md`
  at spec commit `ea1cf552`
  (`ea1cf55246df0c7ee89e2dcf5ed0b8cd9fab84b7`,
  `docs: P0-A label-derivation design spec (Approach A, SS1-3 approved with conditions)`),
  amended by `11fe6c08`
  (`11fe6c08f25c313157b537ddce43f3b905f8de85`,
  `docs: spec amendment - SHA-256 parity held-out split (replaces pool-order)`).
- Code commits so far, each verified with `git log --oneline` at HEAD `5f5c72a7`:
  - `2c93e376` `feat(p0a): deriveLabel maps v1 Keep/Revise + dimension marks to pass/revise/rewrite`
    (+ fixture `src/tests/unit/fixtures/p0a-calibration-sample.json`, `src/tests/unit/labelDerivation.test.js`).
  - `b0b93618` `feat(p0a): word-boundary keyword scan with Polish-nationality guard`.
  - `7c43bfbe` `test(p0a): pin sentence-initial Polish miss + negated-phrase flagging`.
  - `f370f45d` `feat(p0a): weighted kappa, Wilson CI, per-class agreement for calibration report`
    (`src/evaluation/judgeMetrics.ts`, `src/tests/unit/judgeMetricsWeighted.test.js`).
  - `085db6dd` `feat(p0a): SHA-256 held-out split (SET-A detects, SET-B validates) + shadow-label definition`.
  - `84a89ed6` `feat(p0a): pure calibration-report builder (dual arms, split shadow, seeded sample, schema gate)`.
  - `5f5c72a7` `feat(p0a): calibrate.mjs wired to report builder (no judge-path changes)`
    (`tools/judge-bench/calibrate.mjs` only; no judge-path changes).
  - Supporting fix/docs: `bdc0dd90` `fix(p0a): declare sceneLabels table on VersatileTables (typecheck clean)`;
    `11fe6c08` + `ea1cf552` (spec/amendment above);
    `46db816b` `docs: P0-A research base merged + verified, critic audit, calibration plan update`;
    `415a2600` `feat(labels): P0-A judge calibration - frontend label store, UI, harness`;
    `8e3219b0` `feat(labels): P0-A judge calibration - SceneLabel entity, CRUD API, migration`.

## 1. Frozen mapping (`deriveLabel`)

Reference: `src/evaluation/labelDerivation.ts` at HEAD `5f5c72a7`
(mapping introduced in `2c93e376`; header comment restates spec §1).
`deriveLabel` semantics in one paragraph: overall Keep maps to pass regardless
of dimension marks (a kept scene with a minor Problem note is still a pass —
the reviewer judged it shippable); overall Revise with Problem on continuity or
voice maps to rewrite with trigger continuity-only / voice-only / both (a
structural break on a load-bearing dimension means rebuild, not touch-up);
overall Revise with no Problem on continuity or voice maps to revise (problems
confined to show_tell/pacing/emotional_goal or notes only are fixable in
place); Unsure dimensions are excluded from the mapping and a Revise scene
whose only signals are Unsure maps to revise flagged low-confidence; reporting
flags `keepWithProblem` (Keep scenes carrying Problem on continuity or voice,
counted separately) and `missingLoadBearing` (absent continuity/voice key maps
to revise, flagged, never silently mapped from partial data).

## 2. Frozen keyword lists (14 + 14, verbatim from spec `ea1cf552` lines 80-86)

Spec §2 "Mapping-review detection (pre-registered)": a note contradicts the
derived label when it matches the frozen list below AND a human confirms the
hit (the scan proposes, a human disposes). Matching semantics: word-boundary
(`\b(?:...)\b`), case-insensitive for both lists except `polish`, which is
lowercase-only (case-sensitive `\bpolish\b`) so the Polish nationality
(always capitalized) is not flagged while the mid-sentence verb is.

- Rebuild-class, 14 phrases (contradicts derived-revise): rewrite, rewritten,
  rebuild, rebuilt, rebuilding, "start over", "starting over", "from scratch",
  "fundamentally broken", "structurally broken", "needs rebuilding",
  "tear down", "throw out", "throw away".
- Fix-in-place, 14 phrases (contradicts derived-rewrite): "touch up",
  "small fix", "minor fix", "minor edit", "one edit", "single edit",
  "quick fix", polish, tighten, trim, tweak, copyedit, "copy-edit",
  "line edit".

Code location (lists NOT pasted twice — see code):
`src/evaluation/labelDerivation.ts` at HEAD `5f5c72a7`: `REBUILD_PHRASES`
(verbatim 14, matched by case-insensitive `REBUILD_RE`), `FIX_PHRASES_CASELESS`
(verbatim 13, matched by case-insensitive `FIX_RE`), and `POLISH_VERB_RE`
(`/\bpolish\b/`, case-sensitive, deliberately split out of the caseless list
per the nationality guard); `detectMappingReview` applies rebuild-class to
derived-revise and fix-in-place to derived-rewrite, never to derived-pass;
rejected hits are logged with reason by the human step.

## 3. 15% rule + SET-A / SET-B split

15% rule (pre-registered hypothesis, likely undercount): if mapping-review
cases (confirmed hits + unflagged-sample-projected misses) exceed 15% of
Revise scenes, the mapping rule is revised as v1.1 — never a v1 rubric edit —
and any v1.1 must be validated on scenes that did not motivate the change.
The 15% trigger is treated as a likely undercount because of the
unflagged-note backstop: a human reads a random sample of ~10 notes the scan
did NOT flag and reports the contradiction rate alongside the trigger count.
The 80% adjudication figure in spec §2 is likewise an unvalidated hypothesis
with Wilson 95% CIs, explicitly not a pass/fail gate.

Split method (spec §2 as amended by `11fe6c08`, replacing pool-order parity):
before any adjudication, Revise-labeled scenes only (pass scenes need no
mapping validation) are split by SHA-256 hex digest of `sceneId`, parity of
the first byte (first two hex chars parsed as a byte): even → SET-A, odd →
SET-B. SET-A is the detection set (the 15% trigger is evaluated here; it may
motivate a v1.1); SET-B is the validation set (a v1.1 is tested here; these
scenes never motivate changes). Code reference (implementation, not pasted
here): `splitHeldOut` in `src/evaluation/labelDerivation.ts` at HEAD
`5f5c72a7` (dependency-free sync SHA-256, fixture-pinned against sha256sum
vectors); deterministic blind-control sampling via `sampleUnflagged`
(seeded mulberry32, default seed 20261011, k=10) in the same file; schema gate
`fromConsensusEntry` in the same file.

## 4. Shadow definition (Option 3, pass/not-pass only)

Whole-scene score = the eval record's top-level `score` field (focused path:
mean of judged dimensions; combined path: model self-report). Cutoffs,
shared for both arms: score ≥ 7 → pass; 5–6 → revise; < 5 → rewrite;
null/unavailable/non-finite score → `excluded` from the comparison, never
defaulted (defaulting is the saturation bug `criticVerdict.ts` exists to route
around). Compared against the authoritative (Option 2, continuity+voice-derived)
label at pass vs not-pass only, because v1 labels carry no advisory scores
(no advisory-mean/min/max comparison is computable from v1 data). Focused vs
combined arms are never pooled: each arm excludes its own nulls independently
and reports its own n / matches / agreement / Wilson 95% CI / excluded count.
Code reference: `wholeSceneScoreLabel` and the split-shadow report builder in
`src/evaluation/labelDerivation.ts` at HEAD `5f5c72a7`; metrics
(`weightedKappa` / `wilsonCI` / `perClassAgreement`) imported from
`src/evaluation/judgeMetrics.ts` (introduced in `f370f45d`), never
reimplemented; harness wiring in `tools/judge-bench/calibrate.mjs` at
`5f5c72a7`. Metrics surfaces: dual reviewer-consensus + descriptive-only
human-only arms, Keep-with-Problem count, mapping-review hit list with human
dispositions, unflagged-sample result, and rewrite-by-trigger stratification
(continuity-only / voice-only / both).

## 5. Known limits (carry-forward, no additions made)

- Word-boundary matching misses inflections: rewrites, rewriting, rebuilds,
  polishes/polished/polishing, and phrasal-verb inflections (tears down,
  threw out/away) do not match the frozen phrases.
- Sentence-initial capitalized verb miss: "Polish the transitions" does not
  flag under the lowercase-only `\bpolish\b` guard (pinned by test in
  `7c43bfbe`); accepted miss, covered by the unflagged-note backstop sample
  plus human disposal.
- The `overall` consensus field name is VERIFY-AGAINST-DATA when real data
  appears: real `consensus.json` is absent from this tree, so the
  `fromConsensusEntry` schema gate enforces presence loudly rather than
  defaulting.
- n=40 below S1's 50–100 minimum: the derived-split validation exercise is
  exploratory; human-only numbers are descriptive only with Wilson CIs and
  carry no pass/fail claims.

## 6. Gate restatement

The calibration run is NOT started. Gate conditions (spec §2–§3) remain open:
two named human adjudicators (neither the original note author, never Claude,
never the model that produced the labels) must be supplied and recorded, plus
explicit run approval. The real `consensus.json` must be confirmed reachable
first — expected path `reports/live/labelling/claude-labels/consensus.json`,
which is absent from this tree (verified `Test-Path` False at HEAD
`5f5c72a7`). This commit freezes mapping, keyword lists, the 15% rule, the
SET-A/SET-B split, and the shadow definition only; the run references this
record's commit hash when it is eventually approved.

## Amendment 1 — consensus/disagreement (date 2026-10-11)

User-directed extension: primary C + bounded B. No calibration run. No data
analysis (consensus data absent from this tree).

- Choice: C-primary + bounded-B. The judge is reported against EACH reviewer
  pass separately (judge-vs-passA and judge-vs-passB, each weightedKappa + n
  under `passes: { A, B? }`); B is absent when no passB entries exist.
- Agreed-only arm: derived three-way labels that agree across passes;
  labeled `optimistic: true`, never headline. The report carries NO `headline`
  field selecting an arm.
- Adjudicated arm: scenes with human-adjudicated entries resolving three-way
  disagreements; count reported (`adjudicated: { n, count, ... }`).
  Adjudication itself is future human work — the builder accepts adjudicated
  entries; blindness (to judge output, to pass source) is a recorded process
  constraint, not code.
- Adjudication scope = three-way-label disagreements only, blind to judge
  output and pass source; adjudicators = named humans TBD (never Claude / never
  the label model). Adjudicator names TBD; real consensus.json absent.
- 12-human subset descriptive-only (already in base record — restate pointer):
  see §5 / `dual.humanOnly.descriptiveOnly` (n below powered minimum, Wilson
  95% CIs, no pass/fail claims).
- No merge rule found in-tree: all consumers load consensus.json pre-merged;
  cite `tools/judge-bench/bench.py:37`
  (`cons = {r["sceneId"]: r for r in json.load(open(...consensus.json...))}`).
