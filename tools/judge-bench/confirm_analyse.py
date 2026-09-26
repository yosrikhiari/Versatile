"""
Score the confirmers on the development pairs (§32): recall at zero false
alarms, and the threshold that achieves it, for C1/C2 (probabilities) and C0
(boolean). Labels come from confirm-dev-candidates.json.

    python -X utf8 tools/judge-bench/confirm_analyse.py
"""
import json
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
import pacing_features as pf  # noqa: E402

dev = json.load(open(f"{bench.CACHE}/confirm-dev-candidates.json", encoding="utf-8"))
var = json.load(open(f"{bench.CACHE}/confirm-variants.json", encoding="utf-8"))
rows = []
for key, rec in dev.items():
    for i, p in enumerate(rec["pairs"]):
        k = f"{key}#{i}"
        if p.get("label") is None or k not in var or "c3" not in var[k]:
            continue
        rows.append((p["label"], var[k], k, rec["kind"]))
P = [r for r in rows if r[0]]
N = [r for r in rows if not r[0]]
print(f"pairs scored: {len(P)} contradictions, {len(N)} not")
c0tp = sum(r[1]["c0"] for r in P)
c0fp = sum(r[1]["c0"] for r in N)
print(f"C0 yes/no:            caught {c0tp}/{len(P)}  false alarms {c0fp}/{len(N)}")
for c in ("c1", "c2", "c3", "c4"):
    pos = [r[1][c] for r in P]
    neg = [r[1][c] for r in N]
    top_neg = max(neg) if neg else 0
    at0 = sum(p > top_neg for p in pos)
    at1 = sorted(neg)[-2] if len(neg) > 1 else 0
    print(f"{c.upper()} P(contradicts): AUC {pf.auc(pos, neg):.2f}; zero false alarms needs > {top_neg:.3f} -> caught {at0}/{len(P)}; "
          f"one false alarm (> {at1:.3f}) -> caught {sum(p > at1 for p in pos)}/{len(P)}; at 0.5: caught {sum(p >= .5 for p in pos)}, FA {sum(n >= .5 for n in neg)}")
    print("   positives:", sorted(float(f"{x:.2g}") for x in pos))
    print("   top negatives:", sorted(float(f"{x:.2g}") for x in neg)[-6:])
for label, v, k, kind in sorted(rows, key=lambda r: -r[1]["c3"])[:25]:
    print(f"  {'POS' if label else 'neg'} {k:34s} c0={v['c0']!s:5s} c1={v["c1"]:.2g} c2={v["c2"]:.2g} c3={v["c3"]:.2g} c4={v["c4"]:.2g}")
