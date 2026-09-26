"""
Who gets blamed for a planted defect, under the current gate (§34).

Since §31 only continuity and voice fail a scene; show_tell, pacing and
emotional_goal are advisory (reported, not failing). So "names the wrong
dimension" has two costs, measured separately:

  wrong FAIL   a GATING dimension (continuity, voice) under the floor that is
               not the defect's target and was not already under it on the
               clean scene -- the scene fails, or is repaired, for the wrong
               reason
  wrong WARN   the same for an advisory dimension -- the author is told the
               wrong thing, nothing is rewritten

per defect, next to: target flagged (target dimension under the floor) and
scene failed.

    python tools/gate-blame.py reports/live/gate-sensitivity-focused-30-s34 [older run ...]
"""
import json
import sys
from collections import Counter

FLOOR = 7
GATING = {"continuity", "voice"}
TARGET = {"voice_flatten": "voice", "told_not_shown": "show_tell", "told_faithful": "show_tell",
          "padding": "pacing", "contradiction": "continuity"}


def low(r):
    return {k for k, v in (r.get("dimensionScores") or {}).items() if isinstance(v, (int, float)) and v < FLOOR}


def report(path):
    d = json.load(open(f"{path}/summary.json", encoding="utf-8"))
    rows = {(r["index"], r["defect"]): r for r in d["results"] if r["repeat"] == 1}
    print(f"\n## {path}")
    clean = [r for (i, df), r in rows.items() if df == "control"]
    print(f"  clean scenes failing the gate: {sum(r.get('pass') is False for r in clean)}/{len(clean)}"
          f"   (gating dims under floor: {Counter(x for r in clean for x in low(r) & GATING)})")
    print(f"  {'defect':15s} {'n':>3s} {'target flagged':>15s} {'scene failed':>13s} {'wrong FAIL':>11s} {'wrong WARN':>11s}  wrong dims")
    for df, tgt in TARGET.items():
        n = flagged = failed = wf = ww = 0
        which = Counter()
        for (i, d2), r in rows.items():
            if d2 != df:
                continue
            base = rows.get((i, "control"))
            if not base or r.get("error"):
                continue
            n += 1
            lo = low(r)
            flagged += tgt in lo
            failed += r.get("pass") is False
            extra = lo - low(base) - {tgt}
            wf += bool(extra & GATING)
            ww += bool(extra - GATING)
            which.update(extra)
        print(f"  {df:15s} {n:3d} {flagged:>15d} {failed:>13d} {wf:>11d} {ww:>11d}  {dict(which)}")


for p in sys.argv[1:]:
    report(p)
