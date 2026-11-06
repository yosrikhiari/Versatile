"""
Two-rater agreement for the human-reference set.

    python tools/labelling/agreement.py labels-a.json labels-b.json
    python tools/labelling/agreement.py labels-a.json labels-b.json --json
    python tools/labelling/agreement.py labels-a.json labels-b.json --require-human

Both files are the labelling page's exported `labels` collections (a JSON list
of documents, or an object with a `docs`/`documents` list). The tool reports,
per dimension and for the overall Keep/Revise decision:

  - overlap, scenes only in one file, and rater provenance
  - percent agreement and Cohen's kappa over scenes both raters scored
  - unsure and missing counts for each rater
  - every disagreement by scene id

`--require-human` refuses model-labelled files. It is a metadata check, not
proof of human identity: it catches `claude-pass1`, `gpt-4o`, etc., and refuses
missing labeller metadata because that cannot be called human.

"Unsure" is a legitimate answer in the frozen rubric, so it is counted and
excluded from the agreement denominator rather than coerced to Problem/Fine.
This is deliberately stricter than treating unsure as "fine".
"""
import argparse
import json
import sys

from compare import DIMS, kappa

AI_PROVENANCE_MARKERS = (
    "claude",
    "gpt",
    "llm",
    "openai",
    "anthropic",
    "gemini",
    "qwen",
    "mistral",
    "llama",
    "model-generated",
)

UNSURE_VALUES = {"unsure", "n/a", "na"}
KEEP_ALIASES = {"keep", "pass"}
REVISE_ALIASES = {"revise", "rewrite"}


def normalize_dimension(value):
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in ("problem", "fine", "unsure") else None


def normalize_overall(value):
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in KEEP_ALIASES:
        return "keep"
    if normalized in REVISE_ALIASES:
        return "revise"
    if normalized in UNSURE_VALUES:
        return "unsure"
    return None


def _extract_rows(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        rows = payload.get("docs") or payload.get("documents")
        if isinstance(rows, list):
            return rows
        return [value for value in payload.values() if isinstance(value, dict)]
    raise ValueError("labels file must contain a list or a docs/documents list")


def load_label_map(path):
    """Load sceneId -> label body, rejecting duplicates instead of overwriting."""
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    out = {}
    for row in _extract_rows(payload):
        if not isinstance(row, dict):
            continue
        body = row.get("data", row)
        if not isinstance(body, dict):
            continue
        scene_id = body.get("sceneId") or row.get("id")
        if not scene_id:
            raise ValueError(f"{path}: a label has no sceneId")
        if scene_id in out:
            raise ValueError(f"{path}: duplicate sceneId {scene_id!r}")
        out[scene_id] = body
    return out


def _labeller_names(label_map):
    names = set()
    for body in label_map.values():
        name = body.get("labeller") or body.get("reviewerName")
        if isinstance(name, str) and name.strip():
            names.add(name.strip())
    return sorted(names)


def detect_provenance(label_map):
    names = _labeller_names(label_map)
    ai_names = [
        name
        for name in names
        if any(marker in name.lower() for marker in AI_PROVENANCE_MARKERS)
    ]
    if not names:
        note = "labeller metadata is missing; provenance is unknown, not human"
    elif ai_names:
        note = "AI/model labellers detected; these are not human ratings"
    else:
        note = "no AI/model labeller names detected; metadata check only, not proof of humanity"
    return {
        "labellers": names,
        "aiLabellers": ai_names,
        "isHuman": bool(names) and not ai_names,
        "note": note,
    }


def require_human_labels(label_map):
    provenance = detect_provenance(label_map)
    if not provenance["isHuman"]:
        raise ValueError(f"human labels required: {provenance['note']}")
    return provenance


def _percent(agree, n):
    return None if n == 0 else round(100.0 * agree / n, 2)


def _kappa_or_none(pairs):
    value = kappa(pairs)
    # JSON has no NaN; an undefined kappa is reported as null, not 0.
    return None if value != value else round(value, 4)


def _binary_block(rows):
    n = len(rows)
    agree = sum(1 for row in rows if row["a"] == row["b"])
    pairs = [(row["a"] == "problem", row["b"] == "problem") for row in rows]
    return {
        "n": n,
        "agree": agree,
        "percentAgreement": _percent(agree, n),
        "kappa": _kappa_or_none(pairs),
    }


def _overall_binary(row, value):
    return "problem" if value == "revise" else "fine"


def agreement_report(labels_a, labels_b, dims=None):
    dims = list(dims or DIMS)
    overlap_ids = sorted(set(labels_a) & set(labels_b))
    only_a = sorted(set(labels_a) - set(labels_b))
    only_b = sorted(set(labels_b) - set(labels_a))

    dimensions = {}
    for dim in dims:
        rows = []
        unsure = {"a": 0, "b": 0}
        missing = {"a": 0, "b": 0}
        invalid = {"a": 0, "b": 0}
        for scene_id in overlap_ids:
            a_raw = (labels_a[scene_id].get("dims") or {}).get(dim)
            b_raw = (labels_b[scene_id].get("dims") or {}).get(dim)
            a_value = normalize_dimension(a_raw)
            b_value = normalize_dimension(b_raw)
            if a_raw is None:
                missing["a"] += 1
            elif a_value is None:
                invalid["a"] += 1
            elif a_value == "unsure":
                unsure["a"] += 1
            if b_raw is None:
                missing["b"] += 1
            elif b_value is None:
                invalid["b"] += 1
            elif b_value == "unsure":
                unsure["b"] += 1
            if a_value in ("problem", "fine") and b_value in ("problem", "fine"):
                rows.append({"sceneId": scene_id, "a": a_value, "b": b_value})
        block = _binary_block(rows)
        block["unsure"] = unsure
        block["missing"] = missing
        block["invalid"] = invalid
        block["problemA"] = sum(1 for row in rows if row["a"] == "problem")
        block["problemB"] = sum(1 for row in rows if row["b"] == "problem")
        block["disagreements"] = [
            {"sceneId": row["sceneId"], "a": row["a"], "b": row["b"]}
            for row in rows
            if row["a"] != row["b"]
        ]
        dimensions[dim] = block

    overall_rows = []
    overall_unsure = {"a": 0, "b": 0}
    overall_missing = {"a": 0, "b": 0}
    for scene_id in overlap_ids:
        a_value = normalize_overall(labels_a[scene_id].get("overall"))
        b_value = normalize_overall(labels_b[scene_id].get("overall"))
        if a_value is None:
            overall_missing["a"] += 1
        elif a_value == "unsure":
            overall_unsure["a"] += 1
        if b_value is None:
            overall_missing["b"] += 1
        elif b_value == "unsure":
            overall_unsure["b"] += 1
        if a_value in ("keep", "revise") and b_value in ("keep", "revise"):
            overall_rows.append(
                {
                    "sceneId": scene_id,
                    "a": _overall_binary(None, a_value),
                    "b": _overall_binary(None, b_value),
                }
            )
    overall = _binary_block(overall_rows)
    overall["unsure"] = overall_unsure
    overall["missing"] = overall_missing
    overall["reviseA"] = sum(1 for row in overall_rows if row["a"] == "problem")
    overall["reviseB"] = sum(1 for row in overall_rows if row["b"] == "problem")
    overall["disagreements"] = [
        {"sceneId": row["sceneId"], "a": row["a"], "b": row["b"]}
        for row in overall_rows
        if row["a"] != row["b"]
    ]

    provenance_a = detect_provenance(labels_a)
    provenance_b = detect_provenance(labels_b)
    provenance = {
        "a": provenance_a,
        "b": provenance_b,
        "isHuman": provenance_a["isHuman"] and provenance_b["isHuman"],
        "note": "both raters pass the metadata check"
        if provenance_a["isHuman"] and provenance_b["isHuman"]
        else "at least one rater is AI/model-labelled or missing labeller metadata",
    }

    return {
        "overlap": len(overlap_ids),
        "onlyA": only_a,
        "onlyB": only_b,
        "provenance": provenance,
        "dimensions": dimensions,
        "overall": overall,
    }


def _print_block(name, block):
    kappa_text = "n/a" if block["kappa"] is None else f"{block['kappa']:.2f}"
    percent_text = (
        "n/a" if block["percentAgreement"] is None else f"{block['percentAgreement']:.1f}%"
    )
    print(
        f"  {name:15s} n={block['n']:2d}  agree={block['agree']:2d} ({percent_text})  "
        f"kappa={kappa_text}  unsure A/B={block['unsure']['a']}/{block['unsure']['b']}  "
        f"missing A/B={block['missing']['a']}/{block['missing']['b']}"
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("labels_a", help="first rater's labels JSON")
    parser.add_argument("labels_b", help="second rater's labels JSON")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument(
        "--require-human",
        action="store_true",
        help="refuse files whose labeller metadata is AI/model or missing",
    )
    args = parser.parse_args(argv)

    labels_a = load_label_map(args.labels_a)
    labels_b = load_label_map(args.labels_b)
    if args.require_human:
        require_human_labels(labels_a)
        require_human_labels(labels_b)

    report = agreement_report(labels_a, labels_b)
    if args.json:
        print(json.dumps(report, indent=2, allow_nan=False, ensure_ascii=False))
        return 0

    print(f"file A: {args.labels_a}")
    print(f"file B: {args.labels_b}")
    print(f"overlap: {report['overlap']} scenes (only A: {len(report['onlyA'])}, only B: {len(report['onlyB'])})")
    print(
        "provenance A: "
        + (", ".join(report["provenance"]["a"]["labellers"]) or "(missing)")
        + f" — {report['provenance']['a']['note']}"
    )
    print(
        "provenance B: "
        + (", ".join(report["provenance"]["b"]["labellers"]) or "(missing)")
        + f" — {report['provenance']['b']['note']}"
    )
    print("\nPer dimension (binary problem/fine, unsure excluded):")
    for dim in DIMS:
        _print_block(dim, report["dimensions"][dim])
    print("\nOverall (Keep/Revise; pass -> keep, rewrite -> revise):")
    _print_block("overall", report["overall"])

    any_disagreements = False
    for dim in DIMS:
        disagreements = report["dimensions"][dim]["disagreements"]
        if not disagreements:
            continue
        if not any_disagreements:
            print("\nDisagreements:")
            any_disagreements = True
        for row in disagreements:
            print(f"  {dim:15s} {row['sceneId']}: A={row['a']} B={row['b']}")
    for row in report["overall"]["disagreements"]:
        if not any_disagreements:
            print("\nDisagreements:")
            any_disagreements = True
        print(f"  overall         {row['sceneId']}: A={row['a']} B={row['b']}")
    if not any_disagreements:
        print("\nNo disagreements on the binary comparisons.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
