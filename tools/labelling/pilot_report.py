"""
Generate a feasibility report for the 12-scene human-reference pilot.

This reports agreement on the *provided* export files. It does not create labels
and does not prove the raters are human (`--require-human` in agreement.py is a
metadata check). The 12-scene, shortest-scenes pilot is feasibility evidence
only — not gate validation and not "human labels" for the 78-scene reviewer
corpus.

    python tools/labelling/pilot_report.py rater-a.json rater-b.json --out report.md
    python tools/labelling/pilot_report.py a.json b.json --pack reports/live/labelling/human-review-pack.json --json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from agreement import agreement_report, load_label_map, require_human_labels  # noqa: E402
from check_pilot_exports import check_rows, load_pack_scene_ids, load_rows  # noqa: E402

DISCLAIMER = (
    "Feasibility evidence only (12 shortest scenes). Not gate validation and not "
    '"human labels" for the 78-scene reviewer corpus. Rater provenance is a '
    "metadata check, not proof of humanity."
)


def fmt_kappa(value):
    return "n/a" if value is None else f"{value:.3f}"


def dim_table(report):
    lines = [
        "| dimension | n | agree | % agree | kappa | unsure A/B | missing A/B | problem A/B |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, row in report["dimensions"].items():
        lines.append(
            f"| {name} | {row['n']} | {row['agree']} | {row['percentAgreement']:.1f}% | "
            f"{fmt_kappa(row['kappa'])} | {row['unsure']['a']}/{row['unsure']['b']} | "
            f"{row['missing']['a']}/{row['missing']['b']} | {row['problemA']}/{row['problemB']} |"
        )
    o = report["overall"]
    lines.append(
        f"| **overall (Keep/Revise)** | {o['n']} | {o['agree']} | {o['percentAgreement']:.1f}% | "
        f"{fmt_kappa(o['kappa'])} | {o['unsure']['a']}/{o['unsure']['b']} | "
        f"{o['missing']['a']}/{o['missing']['b']} | revise {o['reviseA']}/{o['reviseB']} |"
    )
    return "\n".join(lines)


def disagreements_md(report):
    out = []
    for name, row in list(report["dimensions"].items()) + [("overall", report["overall"])]:
        items = row.get("disagreements") or []
        if not items:
            continue
        out.append(f"### {name}")
        for d in items:
            out.append(f"- `{d['sceneId']}`: A={d['a']} B={d['b']}")
    return "\n".join(out) if out else "_No disagreements._"


def build_report(path_a, path_b, pack_path=None, require_human=False):
    raw_a = load_rows(path_a)
    raw_b = load_rows(path_b)
    err_a, meta_a, ids_a = check_rows(path_a, raw_a)
    err_b, meta_b, ids_b = check_rows(path_b, raw_b)
    preflight_errors = list(err_a) + list(err_b)
    if not preflight_errors and set(ids_a) != set(ids_b):
        preflight_errors.append("scene id sets differ")

    pack_info = None
    if pack_path and not preflight_errors:
        pack_ids, pack_study, pack_rubric = load_pack_scene_ids(pack_path)
        pack_info = {"studyId": pack_study, "rubricVersion": pack_rubric, "scenes": len(pack_ids)}
        if set(ids_a) != pack_ids:
            preflight_errors.append("exports do not match the frozen pack scene ids")

    labels_a = load_label_map(path_a)
    labels_b = load_label_map(path_b)
    provenance_ok = None
    provenance_note = None
    if require_human:
        try:
            pa = require_human_labels(labels_a)
            pb = require_human_labels(labels_b)
            provenance_ok = True
            provenance_note = f"A: {pa['note']}; B: {pb['note']}"
        except Exception as err:
            provenance_ok = False
            provenance_note = str(err)
            preflight_errors.append(f"provenance check failed: {err}")

    agreement = agreement_report(labels_a, labels_b)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": DISCLAIMER,
        "files": {"a": path_a, "b": path_b},
        "pack": pack_info,
        "preflightErrors": preflight_errors,
        "preflightOk": not preflight_errors,
        "meta": {"a": meta_a, "b": meta_b},
        "provenance": {"ok": provenance_ok, "note": provenance_note},
        "agreement": agreement,
    }


def render_markdown(report):
    a = report["meta"]["a"]
    b = report["meta"]["b"]
    status = "PASS (format/preflight)" if report["preflightOk"] else "FAIL (preflight)"
    lines = [
        "# Human-review pilot feasibility report",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Pre-flight: **{status}**",
        f"- File A: `{report['files']['a']}` — {a.get('labeller')!r} / {a.get('pass')!r}",
        f"- File B: `{report['files']['b']}` — {b.get('labeller')!r} / {b.get('pass')!r}",
        f"- Study: `{a.get('studyId')}` rubric `{a.get('rubricVersion')}` pack `{a.get('packHash')}`",
        f"- Overlap: {report['agreement']['overlap']} (only A: {len(report['agreement']['onlyA'])}, only B: {len(report['agreement']['onlyB'])})",
        "",
        f"> {report['disclaimer']}",
        "",
    ]
    if report["provenance"]["note"]:
        lines += [f"**Provenance (metadata):** {report['provenance']['note']}", ""]
    if report["preflightErrors"]:
        lines += ["## Pre-flight errors", ""]
        lines += [f"- {e}" for e in report["preflightErrors"]] + [""]
    lines += ["## Agreement", "", dim_table(report["agreement"]), "", "## Disagreements", "", disagreements_md(report["agreement"]), ""]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate a feasibility report for two pilot exports")
    parser.add_argument("labels_a")
    parser.add_argument("labels_b")
    parser.add_argument("--pack", help="optional frozen pack JSON")
    parser.add_argument("--require-human", action="store_true", help="run metadata provenance check")
    parser.add_argument("--out", help="write markdown report to this path")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of markdown")
    args = parser.parse_args(argv)

    report = build_report(args.labels_a, args.labels_b, pack_path=args.pack, require_human=args.require_human)
    text = json.dumps(report, indent=2) if args.json else render_markdown(report)
    if args.out:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(text + ("\n" if not text.endswith("\n") else ""))
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0 if report["preflightOk"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
