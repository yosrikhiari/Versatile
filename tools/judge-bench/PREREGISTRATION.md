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

## Amendment 2 — execution safety and judge-label semantics (2026-11-05)

This amendment is recorded before any P0-A calibration run. It corrects the
previous runner's silent defaults and metric wiring. It does **not** authorize
a run; the required label shape is not currently present in the checked-in
consensus artifact.

- `calibrate.mjs` is a dry run by default. A live run requires `--run`,
  `--approved`, and two distinct names via `--adjudicator-a` and
  `--adjudicator-b`. The script rejects consensus entries without distinct
  `passA` and `passB` records before importing the critic or making a model
  call.
- The primary binary gate comparison is `judge.pass` vs. reviewer A's frozen
  `Keep` / `Revise` decision. It is not `overall !== "pass"` (the original
  labels are `Keep` / `Revise`), and reviewer agreement is computed from the
  separate pass A/B labels only.
- The judge's three-way class used in the report builder is mapped as follows:
  gate pass → `pass`; gate failure with continuity or voice below the configured
  floor (or a major issue of either type) → `rewrite`; other gate failure →
  `revise`. Unavailable/malformed judge results are excluded, never converted
  to score zero or a passing verdict. If any scene has no usable verdict or
  changes focused/combined mode across repeats, the run aborts before writing a
  calibration report instead of silently changing the denominator. This is a
  harness mapping, not a new production gate.
- Focused and combined score arms remain separate: the runner records the
  available mode's score and leaves the other arm null. It no longer copies a
  single score into both arms.
- Mapping-review candidates and the unflagged-note sample are restricted to
  SET-A Revise scenes. SET-B IDs are reserved for validation and are not
  inspected to motivate a mapping change. The scanner's hits remain candidates
  for human disposition; it does not itself assert the 15% trigger.
- The old 80% / 10% thresholds are not emitted as pass/fail acceptance checks;
  the design spec labels 80% an unvalidated hypothesis. The runner also no
  longer claims to measure response verbosity from an issue count.

**Run status remains blocked:** the local consensus file inspected during the
code review contains merged `sceneId`, `dims`, and `overall` fields, not the
required `passA` / `passB` records. No calibration run was performed. The run
still requires the adjudication exercise and explicit approval specified in
the design; recording adjudicator names at the CLI is an audit affordance, not
proof that the exercise was performed.

## Amendment 3 — evidence snapshot and reviewer-agreement tooling (2026-11-05)

Recorded before any P0-A calibration run. This amendment adds repository-level
evidence provenance and a two-rater agreement utility. It does **not** authorize
or perform a run, and it does not create human labels.

- `tools/judge-bench/evidence-register.json` is the curated claim register:
  21 claims (10 active, 2 blocked, 2 exploratory, 2 historical, 1 invalid,
  1 retracted, 3 superseded) and 5 corpora, each with a `labelSource` and
  status. The 78-scene corpus is recorded as `claude-reviewer`, not human.
  `human-pilot-12` is `incomplete`; its current `main-12.json` is a Claude read.
- `tools/judge-bench/evidence-snapshot.json` freezes that register and whole-file
  SHA-256 fingerprints of 8 gate sources and 4 prompt sources. On 2026-11-05 the
  combined gate hash is
  `a63f16bafa3f9aaae9e8d69ea9ffa351e2ea202176183caf6bb2be4cd51d1f45`
  and the prompt hash is
  `fbbbbfaa933ba97657125c41a2711c6aa80025dfd22da348e10c31993375c91a`.
  `npm run evidence:check` fails on source, prompt or register drift and runs
  in the CI lint job; `vite-node@6.0.0` is pinned in `devDependencies` so the
  step does not rely on an on-demand `npx` install. Line endings and a BOM are
  normalized before hashing so a Windows checkout and a Linux CI checkout
  agree. `generatedAt` and git metadata are recorded for context but ignored by
  the drift check.
- `tools/labelling/agreement.py` (11 unittest cases in `test_agreement.py`)
  reports two-rater overlap, percent agreement, Cohen's kappa, unsure/missing/
  invalid counts and disagreements for each dimension and for the overall
  Keep/Revise decision. `--require-human` refuses files whose labeller metadata
  is AI/model or missing; this is a metadata check, not proof of identity.
- Dry run on the two existing Claude passes (78-scene overlap): continuity
  kappa .75 (n=66), voice .66 (n=46; 30/32 unsure), show_tell .68 (n=77),
  pacing .85 (n=76), emotional_goal .89 (n=57), overall Keep/Revise .59
  (n=78; 82.0% raw agreement). These are same-model agreement statistics.
  They are **not** the preregistered human calibration and must not be entered
  as `passA` / `passB` human labels.
- Run status remains blocked: no separate human `passA` / `passB` records exist,
  no calibration run was performed, and the two named human adjudicators
  required by Amendment 2 have not been recorded. The merged `consensus.json`
  remains unusable for the preregistered comparison.
