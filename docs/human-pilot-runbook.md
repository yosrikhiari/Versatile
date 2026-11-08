# Human-reference pilot runbook (12-scene, local-only)

This makes the **blocked** human-reference pilot actionable. It does **not** create labels, does **not** fabricate evidence, and does **not** run the pilot.

## Status / constraints
- **Human labels currently:** 0 real labels. `reports/live/human-review-e2e/*` (if present locally) are **synthetic** and must not be reported as human evidence.
- **Pilot scope:** frozen 12-scene pack, blinded (no critic/score/gate shown to raters), same device/local-only workflow, anonymous rater IDs.
- **Consent:** required before scenes; record only consent version + timestamp (per product/privacy constraints).
- **Blocked downstream until real data exists:** stratified/book-level holdout, prospective gate validation, judge comparison, writer-value study.

## Prerequisites (human/operator)
1. Two **independent human raters** (not the model, not synthetic).
2. Access to the app’s local human-review workspace (`/study` flow / Dexie v58 tables as implemented) on the same device/profile used for the study, or the agreed export path.
3. The frozen pack JSON (local, may be gitignored): typically `reports/live/labelling/human-review-pack.json` (`gate-human-pilot-v1`), or a path you choose.
4. If the pack does not exist, generate it from **real, approved source scenes** using the project tool (do not fabricate scenes/labels):

```bash
python tools/labelling/build_study_pack.py --scenes <real-scenes-source> --out reports/live/labelling/human-review-pack.json --study-id gate-human-pilot-v1 --title "Human reference pilot (12 scenes)"
```

> Verify `--help` and the expected `--scenes` format in your checkout: `python tools/labelling/build_study_pack.py --help`. Use only real source material.

## Run the pilot (human steps)
1. Import/open the frozen pack in the local review workspace.
2. Confirm consent is recorded (version + timestamp) before labeling.
3. Rater A completes all 12 scenes (blinded). Export JSON as `<rater-a>.json`.
4. Rater B completes all 12 scenes independently (blinded, anonymous ID). Export JSON as `<rater-b>.json`.
5. Do **not** edit labels to “improve agreement”. Exports must reflect real human judgments.

## Validate exports (operator)
```bash
python tools/labelling/check_pilot_exports.py <rater-a>.json <rater-b>.json --pack reports/live/labelling/human-review-pack.json
# Optional machine-readable:
python tools/labelling/check_pilot_exports.py <rater-a>.json <rater-b>.json --pack reports/live/labelling/human-review-pack.json --json
```

Fix only structural/export issues (wrong file, missing scenes, mismatched pack). **Never fabricate or alter judgments.**

## Generate feasibility/agreement report (only after real human exports)
```bash
python tools/labelling/pilot_report.py <rater-a>.json <rater-b>.json --require-human --pack reports/live/labelling/human-review-pack.json --out reports/live/labelling/pilot-feasibility-report.md
```

Review the report for provenance/limitations. Treat synthetic or unverifiable exports as invalid for human-evidence claims.

## Evidence rules
- Report `human labels: 0` until two real, validated exports exist.
- Keep raw exports; do not overwrite with “cleaned” labels.
- Any claim based on this pilot must cite: pack id/hash (if available), rater anonymity approach, consent record presence, export validation result, and agreement/limitations.
