"""Paired analysis of the anchor probe (issue #107).

    python tools/anchor-probe.py

Reads reports/live/anchor-probe/{planned,dropped}/summary.json. For each test
scene: the share of its repeats whose opening reuses an image from an earlier
scene's opening, with the planned anchor and with it removed. The paired
difference is tested with an exact sign-flip permutation over the scenes
(6 scenes -> 64 assignments, two-sided floor 2/64 = 0.031). Writes
reports/live/anchor-probe/analysis.json.
"""
import itertools
import json
import os
import statistics

ROOT = os.path.join("reports", "live", "anchor-probe")


def load(arm):
    with open(os.path.join(ROOT, arm, "summary.json"), encoding="utf-8") as f:
        return json.load(f)


def per_scene(summary, key):
    out = {}
    for r in summary["results"]:
        if r.get("error"):
            continue
        out.setdefault(r["index"], []).append(1 if r[key] else 0)
    return out


def exact_p(diffs):
    observed = abs(sum(diffs))
    hits = total = 0
    for signs in itertools.product((1, -1), repeat=len(diffs)):
        total += 1
        if abs(sum(s * d for s, d in zip(signs, diffs))) >= observed - 1e-12:
            hits += 1
    return hits / total


def paired(planned, dropped, key):
    a, b = per_scene(planned, key), per_scene(dropped, key)
    rows = []
    for s in sorted(set(a) & set(b)):
        pa, pb = sum(a[s]) / len(a[s]), sum(b[s]) / len(b[s])
        rows.append({"scene": s, "planned": pa, "dropped": pb, "diff": pb - pa})
    diffs = [r["diff"] for r in rows]
    return {
        "rows": rows,
        "meanPairedDiff": statistics.mean(diffs) if diffs else None,
        "scenesBetter": sum(d < 0 for d in diffs),
        "scenesWorse": sum(d > 0 for d in diffs),
        "exactP": exact_p(diffs) if diffs else None,
    }


def main():
    planned, dropped = load("planned"), load("dropped")

    def count(s, key):
        return f"{sum(1 for r in s['results'] if r[key])}/{s['total']}"

    def mean_words(s):
        vals = [r["words"] for r in s["results"] if not r.get("error")]
        return statistics.mean(vals) if vals else None

    result = {
        "targets": planned["targets"],
        "reusesAny": {"planned": count(planned, "reusesAny"), "dropped": count(dropped, "reusesAny")},
        "usesAnchor": {"planned": count(planned, "usesAnchor"), "dropped": count(dropped, "usesAnchor")},
        "usesRepeatedPair": {
            "planned": count(planned, "usesRepeatedPair"),
            "dropped": count(dropped, "usesRepeatedPair"),
        },
        "pairedReuse": paired(planned, dropped, "reusesAny"),
        "pairedRepeatedPair": paired(planned, dropped, "usesRepeatedPair"),
        "words": {"planned": mean_words(planned), "dropped": mean_words(dropped)},
        "minutes": {"planned": planned["minutes"], "dropped": dropped["minutes"]},
        "errors": {"planned": planned["errors"], "dropped": dropped["errors"]},
    }
    with open(os.path.join(ROOT, "analysis.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    for r in result["pairedReuse"]["rows"]:
        print(f"scene {r['scene']:2}  reuse planned {r['planned']:.2f}  dropped {r['dropped']:.2f}  diff {r['diff']:+.2f}")
    print(json.dumps({k: v for k, v in result.items() if not k.startswith("paired")}, indent=2))
    for k in ("pairedReuse", "pairedRepeatedPair"):
        p = result[k]
        print(k, {x: p[x] for x in ("meanPairedDiff", "scenesBetter", "scenesWorse", "exactP")})


if __name__ == "__main__":
    main()
