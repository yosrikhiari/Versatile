"""
Pre-flight check for two human-review export files.

Validates shape/provenance and overlap before running agreement.py. This is a
format and consistency check, not proof that the raters are human.

    python tools/labelling/check_pilot_exports.py rater-a.json rater-b.json
    python tools/labelling/check_pilot_exports.py a.json b.json --pack reports/live/labelling/human-review-pack.json
"""

import argparse
import json
import sys

REQUIRED_ROW_FIELDS = (
    "sceneId",
    "overall",
    "dims",
    "labeller",
    "studyId",
    "rubricVersion",
    "packHash",
    "pass",
)
REQUIRED_DIMS = ("continuity", "voice", "show_tell", "pacing", "emotional_goal")
FORBIDDEN_ROW_FIELDS = {
    "critic",
    "critique",
    "verdict",
    "gate",
    "gated",
    "score",
    "scores",
    "majorIssues",
    "majorIssueCount",
    "issues",
    "passed",
}
EXPECTED_SCENES = 12


def load_rows(path):
    with open(path, encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    if isinstance(payload, dict):
        rows = payload.get("labels") or payload.get("docs") or payload.get("documents")
        if isinstance(rows, list):
            return rows
        rows = [value for value in payload.values() if isinstance(value, dict)]
        if rows:
            return rows
    if isinstance(payload, list):
        return payload
    raise ValueError(f"{path}: expected a JSON array of label rows")


def check_rows(path, rows, expected_scenes=EXPECTED_SCENES):
    errors = []
    if not rows:
        return [f"{path}: no rows"]
    if len(rows) != expected_scenes:
        errors.append(f"{path}: expected {expected_scenes} rows, got {len(rows)}")

    meta = {}
    scene_ids = []
    for i, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            errors.append(f"{path}: row {i} is not an object")
            continue
        for field in REQUIRED_ROW_FIELDS:
            if field not in row or row[field] in (None, ""):
                errors.append(f"{path}: row {i} missing {field}")
        present_forbidden = sorted(FORBIDDEN_ROW_FIELDS & set(row.keys()))
        if present_forbidden:
            errors.append(f"{path}: row {i} contains forbidden field(s): {', '.join(present_forbidden)}")
        dims = row.get("dims")
        if not isinstance(dims, dict):
            errors.append(f"{path}: row {i} dims must be an object")
        else:
            missing_dims = [d for d in REQUIRED_DIMS if d not in dims]
            if missing_dims:
                errors.append(f"{path}: row {i} missing dims: {', '.join(missing_dims)}")
        scene_id = row.get("sceneId")
        if isinstance(scene_id, str):
            scene_ids.append(scene_id)
        for field in ("studyId", "rubricVersion", "packHash", "labeller", "pass"):
            value = row.get(field)
            if value in (None, ""):
                continue
            if field not in meta:
                meta[field] = value
            elif meta[field] != value:
                errors.append(
                    f"{path}: inconsistent {field} (saw {meta[field]!r} and {value!r})"
                )

    if len(set(scene_ids)) != len(scene_ids):
        errors.append(f"{path}: duplicate sceneId values")
    return errors, meta, scene_ids


def load_pack_scene_ids(path):
    with open(path, encoding="utf-8-sig") as handle:
        pack = json.load(handle)
    scenes = pack.get("scenes") if isinstance(pack, dict) else None
    if not isinstance(scenes, list):
        raise ValueError(f"{path}: pack has no scenes list")
    ids = [s.get("sceneId") for s in scenes if isinstance(s, dict)]
    if any(not isinstance(i, str) or not i for i in ids):
        raise ValueError(f"{path}: pack scenes must have sceneId")
    return set(ids), pack.get("studyId"), pack.get("rubricVersion")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Pre-flight check for two pilot export files")
    parser.add_argument("labels_a", help="first rater's export JSON")
    parser.add_argument("labels_b", help="second rater's export JSON")
    parser.add_argument("--pack", help="optional frozen pack JSON to verify scene ids/study")
    parser.add_argument("--scenes", type=int, default=EXPECTED_SCENES, help="expected scene count")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args(argv)

    report = {"ok": True, "errors": [], "warnings": [], "files": {}}
    try:
        rows_a = load_rows(args.labels_a)
        rows_b = load_rows(args.labels_b)
    except Exception as err:
        report["ok"] = False
        report["errors"].append(str(err))
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1

    for path, rows, key in ((args.labels_a, rows_a, "a"), (args.labels_b, rows_b, "b")):
        errors, meta, scene_ids = check_rows(path, rows, expected_scenes=args.scenes)
        report["files"][key] = {"path": path, "rows": len(rows), "meta": meta, "sceneIds": scene_ids}
        report["errors"].extend(errors)

    if not report["errors"]:
        meta_a = report["files"]["a"]["meta"]
        meta_b = report["files"]["b"]["meta"]
        for field in ("studyId", "rubricVersion", "packHash"):
            if meta_a.get(field) and meta_b.get(field) and meta_a[field] != meta_b[field]:
                report["errors"].append(f"files differ on {field}: {meta_a[field]!r} vs {meta_b[field]!r}")
        set_a = set(report["files"]["a"]["sceneIds"])
        set_b = set(report["files"]["b"]["sceneIds"])
        overlap = set_a & set_b
        only_a = sorted(set_a - set_b)
        only_b = sorted(set_b - set_a)
        report["overlap"] = len(overlap)
        report["onlyA"] = only_a
        report["onlyB"] = only_b
        if only_a or only_b or len(overlap) != args.scenes:
            report["errors"].append(
                f"scene overlap {len(overlap)} (only A: {len(only_a)}, only B: {len(only_b)}, expected {args.scenes})"
            )

        if args.pack:
            try:
                pack_ids, pack_study, pack_rubric = load_pack_scene_ids(args.pack)
                if set_a != pack_ids or set_b != pack_ids:
                    report["errors"].append("scene ids do not match the frozen pack")
                if pack_study and meta_a.get("studyId") and meta_a["studyId"] != pack_study:
                    report["errors"].append(f"studyId does not match pack ({pack_study!r})")
                if pack_rubric and meta_a.get("rubricVersion") and meta_a["rubricVersion"] != pack_rubric:
                    report["errors"].append(f"rubricVersion does not match pack ({pack_rubric!r})")
            except Exception as err:
                report["errors"].append(str(err))

    report["ok"] = not report["errors"]
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        if report["ok"]:
            a = report["files"]["a"]["meta"]
            b = report["files"]["b"]["meta"]
            print(
                f"OK: {args.scenes} scenes, overlap {report['overlap']}, "
                f"study {a.get('studyId')!r} rubric {a.get('rubricVersion')!r}\n"
                f"  A: {a.get('labeller')!r} pass {a.get('pass')!r}\n"
                f"  B: {b.get('labeller')!r} pass {b.get('pass')!r}\n"
                f"Next: python tools/labelling/agreement.py {args.labels_a} {args.labels_b} --require-human"
            )
        else:
            for err in report["errors"]:
                print(f"FAIL: {err}", file=sys.stderr)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
