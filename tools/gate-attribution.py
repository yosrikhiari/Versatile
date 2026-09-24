"""
Compare two gateSensitivity runs on what the verdict SAYS, not only pass/fail.

    python tools/gate-attribution.py reports/live/gate-sensitivity-focused-whole-scene \
                                     reports/live/gate-sensitivity-focused

For each run, first repeat only:
  caught       defect variants that fail the gate
  named        ...whose failing dimensions include the target dimension
  leak         non-target dimensions pushed below the floor on defect variants,
               beyond what the same scene's clean version already failed —
               the halo, where one flaw drags other dimensions down
  clean fails  clean scenes that fail
and a response matrix: mean change of each dimension against the clean
version, per defect. The ideal is a diagonal.
"""
import json
import sys

DIMS = ["continuity", "voice", "emotional_goal", "show_tell", "pacing"]
DEFECTS = ["voice_flatten", "told_not_shown", "told_faithful", "padding", "contradiction"]
FLOOR = 7


def load(path):
    d = json.load(open(f"{path}/summary.json", encoding="utf-8"))
    return {(r["index"], r["defect"]): r for r in d["results"] if r["repeat"] == 1}, d


def failing(r):
    return {k for k, v in (r["dimensionScores"] or {}).items() if isinstance(v, (int, float)) and v < FLOOR}


def report(path, parity=None):
    rows, meta = load(path)
    scenes = sorted({k[0] for k in rows})
    label = ""
    if parity is not None:
        # odd scenes chose the thresholds (§20), even scenes test them
        scenes = [s for s in scenes if s % 2 == parity]
        label = "  [odd: thresholds chosen here]" if parity == 1 else "  [even: held out]"
    print(f"\n## {path}  ({meta.get('totalMinutes')} min, {meta.get('errors')} errors){label}")
    clean_fail = sum(1 for s in scenes if rows[(s, "control")]["pass"] is False)
    caught = named = leak = n = 0
    for s in scenes:
        base = failing(rows[(s, "control")])
        for df in DEFECTS:
            r = rows.get((s, df))
            if not r:
                continue
            n += 1
            f = failing(r)
            caught += r["pass"] is False
            named += r["targetDimension"] in f
            leak += len((f - base) - {r["targetDimension"]})
    print(f"  caught {caught}/{n} · named the target {named}/{n} · leaked into other dims {leak} · clean fails {clean_fail}/{len(scenes)}")
    for df in DEFECTS:
        rs = [rows[(s, df)] for s in scenes if (s, df) in rows]
        if not rs:
            continue
        nj = sum(1 for r in rs if r["dimensionScores"].get(r["targetDimension"]) is None and r["dimensionScores"])
        guard = sum(1 for r in rs if not r["dimensionScores"])
        print(f"    {df:16s} n={len(rs):2d}  caught {sum(r['pass'] is False for r in rs):2d}  named {sum(r['targetDimension'] in failing(r) for r in rs):2d}"
              f"  target not judgeable {nj}  stopped by repetition guard {guard}")
    print(f"  {'':16s}" + "".join(f"{d[:10]:>11s}" for d in DIMS))
    for df in DEFECTS:
        cells = []
        for d in DIMS:
            deltas = []
            for s in scenes:
                if (s, df) not in rows:
                    continue
                a, b = rows[(s, df)]["dimensionScores"].get(d), rows[(s, "control")]["dimensionScores"].get(d)
                if isinstance(a, (int, float)) and isinstance(b, (int, float)):
                    deltas.append(a - b)
            cells.append(f"{sum(deltas) / len(deltas):+.2f}" if deltas else "   n/a")
        print(f"  {df:16s}" + "".join(f"{c:>11s}" for c in cells))
    return rows


split = "--split" in sys.argv
for p in [a for a in sys.argv[1:] if not a.startswith("--")]:
    if split:
        report(p, 1)
        report(p, 0)
    else:
        report(p)
