"""Compare two critic arms over the same 30 scenes.

    python tools/critic-rank-agreement.py [armA] [armB]     # default gpu8b cpu3b

Reads `reports/live/critic-rank-agreement/<arm>/summary.json` for `gpu8b` and
`cpu3b` and answers the question GENERATION-PIPELINE-ANALYSIS §9 puts in front
of A/B run C: can the small CPU critic stand in for the 8B one?

Three things are measured, because the first one turned out not to exist:

1. Rank agreement on the overall score (Spearman rho, Kendall tau). Undefined
   when an arm has no variance -- which is the headline result for qwen3:8b.
2. Decision agreement on pass/fail: raw agreement and Cohen's kappa, which is
   the number that actually gates the preset.
3. Per-dimension agreement, since `pass` is decided by dimension minimums.

No SciPy: the formulas are short and the dependency is not worth it.
"""

import json
import pathlib
import sys
from collections import Counter
from itertools import combinations

ROOT = pathlib.Path("reports/live/critic-rank-agreement")
DIMS = ["continuity", "voice", "emotional_goal", "show_tell", "pacing"]


def load(arm):
    p = ROOT / arm / "summary.json"
    if not p.exists():
        raise SystemExit(f"missing {p} -- run: ARM={arm} npx vitest run --config vitest.live.config.js src/tests/live/criticRankAgreement.live.js")
    s = json.loads(p.read_text(encoding="utf-8"))
    return s, {r["index"]: r for r in s["results"]}


def ranks(xs):
    """Fractional ranks, ties averaged."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    out = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            out[order[k]] = avg
        i = j + 1
    return out


def pearson(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    if da == 0 or db == 0:
        return None
    return num / (da * db)


def spearman(a, b):
    return pearson(ranks(a), ranks(b))


def kendall_tau_b(a, b):
    con = dis = ta = tb = 0
    for i, j in combinations(range(len(a)), 2):
        da, db = a[i] - a[j], b[i] - b[j]
        if da == 0 and db == 0:
            ta += 1
            tb += 1
        elif da == 0:
            ta += 1
        elif db == 0:
            tb += 1
        elif (da > 0) == (db > 0):
            con += 1
        else:
            dis += 1
    denom = ((con + dis + ta) * (con + dis + tb)) ** 0.5
    return (con - dis) / denom if denom else None


def cohen_kappa(a, b):
    n = len(a)
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] / n * cb[k] / n for k in set(ca) | set(cb))
    if pe == 1:
        return None
    return (po - pe) / (1 - pe)


def fmt(v):
    return "undefined (no variance)" if v is None else f"{v:+.3f}"


def main():
    arm_a = sys.argv[1] if len(sys.argv) > 1 else "gpu8b"
    arm_b = sys.argv[2] if len(sys.argv) > 2 else "cpu3b"
    sa, ra = load(arm_a)
    sb, rb = load(arm_b)
    idx = sorted(set(ra) & set(rb))
    print(f"scenes compared: {len(idx)}")
    print(f"  A  {sa['model']:24s} {sa['device']:3s}  {sa['totalMinutes']:>5} min  median {sa['medianSeconds']}s/scene")
    print(f"  B  {sb['model']:24s} {sb['device']:3s}  {sb['totalMinutes']:>5} min  median {sb['medianSeconds']}s/scene")

    for name, s in (("A", sa), ("B", sb)):
        print(f"  {name}: scored {s['scoredScenes']}/{s['scenes']}, unavailable {s['unavailable']}, errors {s['errors']}")

    # --- 1. overall score -------------------------------------------------
    print("\n1. OVERALL SCORE")
    both = [i for i in idx if isinstance(ra[i]["score"], (int, float)) and isinstance(rb[i]["score"], (int, float))]
    xa = [ra[i]["score"] for i in both]
    xb = [rb[i]["score"] for i in both]
    print(f"   A distribution: {dict(sorted(Counter(xa).items()))}")
    print(f"   B distribution: {dict(sorted(Counter(xb).items()))}")
    print(f"   Spearman rho : {fmt(spearman(xa, xb)) if both else 'n/a'}")
    print(f"   Kendall tau-b: {fmt(kendall_tau_b(xa, xb)) if both else 'n/a'}")

    # --- 2. the gate decision --------------------------------------------
    print("\n2. PASS / FAIL DECISION  (this is what the pipeline acts on)")
    pa = [bool(ra[i]["pass"]) for i in idx]
    pb = [bool(rb[i]["pass"]) for i in idx]
    agree = sum(1 for x, y in zip(pa, pb) if x == y)
    print(f"   A passes {sum(pa)}/{len(pa)}   B passes {sum(pb)}/{len(pb)}")
    print(f"   raw agreement: {agree}/{len(idx)} = {agree / len(idx):.1%}")
    print(f"   Cohen kappa  : {fmt(cohen_kappa(pa, pb))}")
    tt = sum(1 for x, y in zip(pa, pb) if x and y)
    tf = sum(1 for x, y in zip(pa, pb) if x and not y)
    ft = sum(1 for x, y in zip(pa, pb) if not x and y)
    ff = sum(1 for x, y in zip(pa, pb) if not x and not y)
    print(f"   both pass {tt} | A pass B fail {tf} | A fail B pass {ft} | both fail {ff}")

    # --- 3. per dimension -------------------------------------------------
    print("\n3. PER DIMENSION")
    print(f"   {'dimension':16s} {'A values':28s} {'B values':28s} {'rho':>10s}")
    for d in DIMS:
        pairs = [
            (ra[i]["dimensionScores"].get(d), rb[i]["dimensionScores"].get(d))
            for i in idx
            if isinstance(ra[i]["dimensionScores"].get(d), (int, float))
            and isinstance(rb[i]["dimensionScores"].get(d), (int, float))
        ]
        if not pairs:
            print(f"   {d:16s} {'-':28s} {'-':28s} {'n/a':>10s}")
            continue
        av = dict(sorted(Counter(p[0] for p in pairs).items()))
        bv = dict(sorted(Counter(p[1] for p in pairs).items()))
        rho = spearman([p[0] for p in pairs], [p[1] for p in pairs])
        print(f"   {d:16s} {str(av):28s} {str(bv):28s} {fmt(rho):>10s}")

    # --- 4. where they disagree ------------------------------------------
    print("\n4. DISAGREEMENTS ON THE GATE")
    n = 0
    for i in idx:
        if bool(ra[i]["pass"]) != bool(rb[i]["pass"]):
            n += 1
            print(f"   #{i:2d} {ra[i]['title'][:34]:34s} A={'PASS' if ra[i]['pass'] else 'FAIL'} ({ra[i]['verdictReason']})")
            print(f"       {'':34s} B={'PASS' if rb[i]['pass'] else 'FAIL'} ({rb[i]['verdictReason']})")
    if not n:
        print("   none")


if __name__ == "__main__":
    main()
