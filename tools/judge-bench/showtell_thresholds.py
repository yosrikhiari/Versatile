"""
Pick the show-tell pass mark on the odd half, test it on the even half and the
masterpieces (§31). Reads the cached rates from showtell_extract.py; no model
calls.

    python tools/judge-bench/showtell_thresholds.py
"""
import json
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402

cache = json.load(open(f"{bench.CACHE}/showtell-extract-v1.json", encoding="utf-8"))
problem, fine, masters = bench.load("show_tell")


def rate(s):
    return cache.get(s["id"], {}).get("rate")


def half(xs, keep):
    return [s for s in xs if s["order"] % 2 == keep and rate(s) is not None]


def score(t, prob, fin, mas):
    return (sum(rate(s) >= t for s in prob), len(prob),
            sum(rate(s) >= t for s in fin), len(fin),
            sum(rate(s) >= t for s in mas), len(mas))


print("rates  problem:", sorted(round(rate(s), 1) for s in problem if rate(s) is not None))
print("rates  fine:   ", sorted(round(rate(s), 1) for s in fine if rate(s) is not None))
print("rates  masters:", sorted(round(rate(s), 1) for s in masters if rate(s) is not None))

# Choose on odd: best (caught - alarms), must fail no masterpiece... masterpieces
# are the held-out control, so they are NOT used to choose.
cands = sorted({rate(s) for s in problem + fine if rate(s) is not None and rate(s) > 0})
best = None
for t in cands:
    c, nc, a, na, _, _ = score(t, half(problem, 1), half(fine, 1), [])
    j = c / max(1, nc) - a / max(1, na)  # Youden's J on the training half
    if best is None or j > best[0]:
        best = (j, t)
print(f"\nchosen on odd half: fail at rate >= {best[1]:.2f} (J={best[0]:.2f})")
for name, keep in (("odd (train)", 1), ("even (test)", 0)):
    c, nc, a, na, _, _ = score(best[1], half(problem, keep), half(fine, keep), [])
    print(f"  {name:12s} caught {c}/{nc}  false alarms {a}/{na}")
_, _, _, _, m, nm = score(best[1], [], [], [s for s in masters if rate(s) is not None])
print(f"  masterpieces failed {m}/{nm}")
