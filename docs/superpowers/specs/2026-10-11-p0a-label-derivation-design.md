# P0-A label-derivation design — v1 labels to pass/revise/rewrite (Approach A)

Date: 2026-10-11. Status: **draft for review — no production changes, no calibration run until approved.**
Related: `docs/LABELLING-RUBRIC.md` v1 (frozen 2026-09-25, unchanged by this doc),
roadmap `#research-evidence-base` (S1–S16), roadmap §10 P0-A row.

## Background and decision

The frozen v1 rubric labels each scene Problem/Fine/Unsure per dimension plus an
overall Keep/Revise; 78 scenes are labeled (12 human + Claude reviewer passes,
`reports/live/labelling/claude-labels/consensus.json`). The judge needs a
pass/revise/rewrite comparison. Three approaches were considered (re-label with
1–10 scores; derive analytically; hybrid). **Approach A adopted 2026-10-11:**
keep v1 labels untouched, derive the three-way label in the harness, and
validate the derivation with a small blind adjudication exercise. Rationale:
the labeled corpus + consensus pipeline + gate-bench results are the most
validated assets; re-labeling trades proven data for cleaner schema.

## §1 — Derivation mapping (approved)

Input per scene: per-dimension Problem/Fine/Unsure + overall Keep/Revise +
reviewer note (from `consensus.json`).

- **pass** ← overall Keep, regardless of dimension marks. A kept scene with a
  minor Problem note is still a pass: the reviewer judged it shippable.
- **rewrite** ← overall Revise AND Problem on continuity or voice. A structural
  break on a load-bearing dimension means rebuild, not touch-up.
- **revise** ← overall Revise AND no Problem on continuity or voice. Problems
  confined to show_tell/pacing/emotional_goal or notes only: fixable in place.
- Unsure dimensions are excluded from the mapping (matches v1 agreement
  accounting). A Revise scene whose only signals are Unsure maps to revise and
  is flagged low-confidence.

Two reporting requirements (approved addition):

1. **Keep-with-Problem count.** Keep scenes carrying a Problem mark on
   continuity or voice are counted and reported separately — the exact point
   where a human pass diverges from the two-gate policy.
2. **Dual reporting.** Every judge-agreement number is reported twice: against
   the full 78-scene reviewer consensus AND against the 12-scene human-only
   subset. The 12-scene numbers are **descriptive only, with Wilson CIs, and
   carry no pass/fail claims** (n = 12 cannot support them).

Override handling: the mapping is computed, not reviewer-assigned, so override
takes the form of reviewer notes. When a note contradicts the derived label
(detection defined in §2), the harness surfaces it as a mapping-review case:
counted and reported, never silently auto-resolved.

## §2 — Derived-split validation exercise (approved with conditions)

Goal: test whether the revise/rewrite split — a harness computation, not a
human judgment — tracks human rebuild-vs-fix judgment.

**Adjudicators (condition 1).** Two humans, neither the original note author,
never Claude and never the model that produced the labels. Names: **[TBD —
to be supplied at review; the exercise does not start until both are named].**

**Blind protocol.** Each adjudicator receives scene text + reviewer note with
all dimension marks redacted, and answers one binary question per scene:
"Does this scene need rebuilding, or would targeted fixes suffice?" —
answered blind to the derived label. The two adjudicators work independently;
their inter-adjudicator agreement is reported as the exercise's own ceiling.

**Two-sided sample.** Derived-rewrite scenes (expect 8–15, whatever the mapping
yields) PLUS a blind control sample of derived-revise scenes of equal count
(same N as the derived-rewrite set, drawn at random), so both false rewrites (derived-rewrite judged fixable) and missed
rewrites (derived-revise judged rebuild).

**Intervals, not gates (condition: 80% as hypothesis).** Every rate reported
with Wilson 95% CI. The 80% figure is recorded as an **unvalidated hypothesis**,
explicitly not a pass/fail gate; n is stated as too small for a powered claim.

**Stratification.** Derived-rewrite results split by trigger:
continuity-only, voice-only, both.

**Mapping-review detection (pre-registered).** A note contradicts the derived
label when it matches the frozen keyword list below AND a human confirms the
hit (the scan proposes, a human disposes):

- Rebuild-class (contradicts derived-revise): rewrite, rewritten, rebuild,
  rebuilt, rebuilding, "start over", "starting over", "from scratch",
  "fundamentally broken", "structurally broken", "needs rebuilding",
  "tear down", "throw out", "throw away".
- Fix-in-place (contradicts derived-rewrite): "touch up", "small fix",
  "minor fix", "minor edit", "one edit", "single edit", "quick fix", polish,
  tighten, trim, tweak, copyedit, "copy-edit", "line edit".

Matching is case-insensitive substring on the note text. The full hit list is
human-reviewed; hits the human rejects are logged as rejected with reason.

**Unflagged-note sample (condition 3).** A human reads a random sample of ~10
notes the scan did NOT flag and reports how many contradict the derived
label. This estimates the scan's miss rate. **The 15% trigger below is
therefore treated as a likely undercount**, and the unflagged-sample
contradiction rate is reported alongside it.

**15% trigger (pre-registered hypothesis).** If mapping-review cases
(confirmed hits + unflagged-sample-projected misses) exceed 15% of Revise
scenes, the mapping rule is revised as v1.1 — never a v1 rubric edit.
**Any v1.1 mapping must be validated on scenes that did not motivate the
change** (see held-out split below).

**Held-out split (pre-registered before adjudication).** Before any
adjudication begins, Revise-labeled scenes are split into SET-A
(mapping-validation: even pool-order indices) and SET-B (held-out: odd pool
indices). The 15% trigger is evaluated on SET-A only; v1.1 validation uses
SET-B scenes exclusively.

## §3 — Harness integration and gate (approved with conditions)

`tools/judge-bench/calibrate.mjs` consumes derived three-way labels from
`consensus.json` via the §1 mapping and reports: the Keep-with-Problem count,
dual human-only/reviewer-consensus numbers (human-only descriptive only), the
mapping-review hit list with human dispositions, and the unflagged-sample
result.

**Option 3 shadow scope (condition).** The Option 3 shadow comparison is
limited to the **pass/not-pass boundary**, because v1 labels carry no advisory
scores — no advisory-mean/min/max comparison is computable from v1 data. The
shadow arm definition:

- **Whole-scene-score-derived label:** derived from the judge's overall
  self-reported `score` field with the same 7/5 cutoffs: score ≥ 7 → pass;
  5–6 → revise; < 5 → rewrite; null/unavailable score → excluded from the
  comparison (never defaulted — defaulting is the saturation bug
  `criticVerdict.ts` exists to route around).
- Compared against the authoritative (Option 2, continuity+voice-derived)
  label at pass vs not-pass only.

**Pre-registration commit (condition 4).** Before anything runs, one commit
freezes: this mapping (§1), the keyword list (§2), the 15% rule, the SET-A /
SET-B scene split, and the whole-scene-score-derived label definition (§3).
The run references the commit hash in its report.

**Gate.** No production behavior changes and no calibration run until §2 and
§3 (this document) are approved.

## Out of scope (explicit non-goals)

- Any edit to `LABELLING-RUBRIC.md` v1 or to the 78 labeled scenes.
- Any change to `deriveVerdict`, the gate, or critic prompts.
- The calibration run itself (separate approval after this design).
- Consensus/disagreement-resolution workflow (next design after this one,
  per the agreed order: audit → rubric → harness → consensus).
