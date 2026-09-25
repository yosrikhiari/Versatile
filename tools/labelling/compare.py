"""
Your labels against the gate's verdicts (§28).

    python tools/labelling/compare.py [labels.json] [relabels.json]

labels.json / relabels.json: the labelling page's `labels` and `relabels`
collections, exported as a JSON list of documents (Claude writes these with
the artifact data tool). gate-verdicts.json: src/tests/live/gateOnPool.live.js.

A dimension counts as a gate "fail" when its score is under the floor (7).
"Unsure" labels and dimensions the gate did not judge (e.g. voice with too
little dialogue) are left out of that dimension's numbers, and counted.

Per dimension it reports, with Wilson 95% intervals:
  - sensitivity: of the scenes YOU marked Problem, how many the gate failed
  - false-alarm rate: of the scenes you marked Fine, how many the gate failed
  - Cohen's kappa between you and the gate
and, when relabels exist, your own first-vs-second-pass kappa: the ceiling.
"""
import json
import sys
from math import sqrt

DIR = "reports/live/labelling"
DIMS = ["continuity", "voice", "show_tell", "pacing", "emotional_goal"]
FLOOR = 7
GATE_PATH = None  # override for tests


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (100 * (c - h) / d, 100 * (c + h) / d)


def kappa(pairs):
    """Cohen's kappa for binary pairs [(a, b)], a/b True = problem."""
    n = len(pairs)
    if n == 0:
        return float("nan")
    po = sum(a == b for a, b in pairs) / n
    pa = sum(a for a, _ in pairs) / n
    pb = sum(b for _, b in pairs) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    return float("nan") if pe == 1 else (po - pe) / (1 - pe)


def load_labels(path):
    rows = json.load(open(path, encoding="utf-8"))
    if isinstance(rows, dict):
        rows = rows.get("docs") or rows.get("documents") or list(rows.values())
    out = {}
    for r in rows:
        body = r.get("data", r) if isinstance(r, dict) else r
        sid = body.get("sceneId") or r.get("id")
        if sid:
            out[sid] = body
    return out


def main():
    labels = load_labels(sys.argv[1] if len(sys.argv) > 1 else f"{DIR}/labels.json")
    gate = {v["sceneId"]: v for v in json.load(open(GATE_PATH or f"{DIR}/gate-verdicts.json", encoding="utf-8"))["verdicts"]}
    print(f"labelled scenes: {len(labels)}   gate verdicts: {len(gate)}")

    for dim in DIMS:
        pairs, unsure, notjudged = [], 0, 0
        for sid, lab in labels.items():
            h = (lab.get("dims") or {}).get(dim)
            g = gate.get(sid, {}).get("dimensionScores", {}).get(dim)
            if h not in ("problem", "fine"):
                unsure += 1
                continue
            if not isinstance(g, (int, float)):
                notjudged += 1
                continue
            pairs.append((h == "problem", g < FLOOR))
        prob = [g for h, g in pairs if h]
        fine = [g for h, g in pairs if not h]
        sens = (sum(prob), len(prob))
        fa = (sum(fine), len(fine))
        lo_s, hi_s = wilson(*sens)
        lo_f, hi_f = wilson(*fa)
        print(f"\n{dim}  (n={len(pairs)}, unsure/n-a {unsure}, gate did not judge {notjudged})")
        print(f"  you: problem {len(prob)}, fine {len(fine)}")
        print(f"  sensitivity  {sens[0]}/{sens[1]}  [{lo_s:.0f}-{hi_s:.0f}%]")
        print(f"  false alarms {fa[0]}/{fa[1]}  [{lo_f:.0f}-{hi_f:.0f}%]")
        print(f"  kappa you-vs-gate {kappa(pairs):.2f}")

    # overall: your Keep/Revise vs the gate's pass
    pairs = [(lab.get("overall") == "revise", gate[sid]["pass"] is False)
             for sid, lab in labels.items() if sid in gate and lab.get("overall") in ("keep", "revise")]
    print(f"\noverall (revise vs gate fail): n={len(pairs)} kappa {kappa(pairs):.2f}, "
          f"agree {sum(a == b for a, b in pairs)}/{len(pairs)}")

    rel_path = sys.argv[2] if len(sys.argv) > 2 else f"{DIR}/relabels.json"
    try:
        relabels = load_labels(rel_path)
    except FileNotFoundError:
        relabels = {}
    if relabels:
        print("\nyour own consistency (first vs re-label pass): the ceiling for the gate")
        for dim in DIMS:
            pairs = []
            for sid, r in relabels.items():
                a = (labels.get(sid, {}).get("dims") or {}).get(dim)
                b = (r.get("dims") or {}).get(dim)
                if a in ("problem", "fine") and b in ("problem", "fine"):
                    pairs.append((a == "problem", b == "problem"))
            print(f"  {dim:15s} n={len(pairs):2d} kappa {kappa(pairs):.2f}")


if __name__ == "__main__":
    main()
