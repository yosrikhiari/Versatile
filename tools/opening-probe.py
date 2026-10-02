"""Paired analysis of the opening probe (issue #66).

    python tools/opening-probe.py

The probe itself (src/tests/live/openingProbe.live.js) and the writer
parameter its "openings" arm needs exist at commit e44c8883 only: the block
made reuse worse and was reverted (GENERATION-PIPELINE-ANALYSIS §49).
Check that commit out to re-run it.

Reads reports/live/opening-probe/{none,openings}/summary.json. For each test
scene: the share of its repeats whose opening reuses an image from an earlier
scene, in each arm. The paired difference is tested with an exact sign-flip
permutation over the scenes (6 scenes -> 64 assignments, two-sided floor
2/64 = 0.031). Writes reports/live/opening-probe/analysis.json.
"""
import itertools
import json
import os
import statistics

ROOT = os.path.join("reports", "live", "opening-probe")


def load(arm):
    with open(os.path.join(ROOT, arm, "summary.json"), encoding="utf-8") as f:
        return json.load(f)


def per_scene(summary, key):
    out = {}
    for r in summary["results"]:
        if r.get("error"):
            continue
        out.setdefault(r["index"], []).append(r[key])
    return out


def exact_p(diffs):
    observed = abs(sum(diffs))
    hits = 0
    total = 0
    for signs in itertools.product((1, -1), repeat=len(diffs)):
        total += 1
        if abs(sum(s * d for s, d in zip(signs, diffs))) >= observed - 1e-12:
            hits += 1
    return hits / total


def main():
    none, openings = load("none"), load("openings")
    a, b = per_scene(none, "reusesAny"), per_scene(openings, "reusesAny")
    scenes = sorted(set(a) & set(b))
    rows = []
    for s in scenes:
        ra = sum(a[s]) / len(a[s])
        rb = sum(b[s]) / len(b[s])
        rows.append({"scene": s, "none": ra, "openings": rb, "diff": rb - ra})
    diffs = [r["diff"] for r in rows]

    def mean_of(summary, key):
        vals = [r[key] for r in summary["results"] if not r.get("error")]
        return statistics.mean(vals) if vals else None

    result = {
        "scenes": rows,
        "reusing": {
            "none": f"{none['reusing']}/{none['total']}",
            "openings": f"{openings['reusing']}/{openings['total']}",
        },
        "meanPairedDiff": statistics.mean(diffs),
        "scenesBetter": sum(d < 0 for d in diffs),
        "scenesWorse": sum(d > 0 for d in diffs),
        "exactP": exact_p(diffs),
        "longestRunWithShown": {
            "none": mean_of(none, "longestRunWithShown"),
            "openings": mean_of(openings, "longestRunWithShown"),
            "maxOpenings": max(r["longestRunWithShown"] for r in openings["results"]),
        },
        "guardWouldDrop": {
            "none": sum(r["guardWouldDrop"] for r in none["results"]),
            "openings": sum(r["guardWouldDrop"] for r in openings["results"]),
        },
        "words": {"none": mean_of(none, "words"), "openings": mean_of(openings, "words")},
        "minutes": {"none": none["minutes"], "openings": openings["minutes"]},
        "errors": {"none": none["errors"], "openings": openings["errors"]},
    }
    with open(os.path.join(ROOT, "analysis.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    for r in rows:
        print(f"scene {r['scene']:2}  none {r['none']:.2f}  openings {r['openings']:.2f}  diff {r['diff']:+.2f}")
    print(json.dumps({k: v for k, v in result.items() if k != "scenes"}, indent=2))


if __name__ == "__main__":
    main()
