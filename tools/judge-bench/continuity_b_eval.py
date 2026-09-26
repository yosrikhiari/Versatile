"""
Held-out test of the confirmers on set B (§32), end to end through the claims
path (extract -> match -> confirm). Compares today's confirmer (C0) with the
union chosen on the dev pairs: flag when C0 says yes OR C2 >= 0.5 OR C3 >= 0.5
(each had 0/145 false alarms on dev alone; together 9/14 vs C0's 7/14).
A plant counts as caught only when a flagged pair's sentence is the plant.

    python -X utf8 tools/judge-bench/continuity_b_eval.py
"""
import json
import os
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from confirm_dev import candidates  # noqa: E402
from confirm_variants import IMPL, SENT, c2, c3  # noqa: E402
from continuity_claims import confirm_fact  # noqa: E402

OUT = f"{bench.CACHE}/continuity-b-eval.json"


def main():
    scenes = json.load(open("reports/live/plants-b/scenes.json", encoding="utf-8"))["scenes"]
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    impl = json.load(open(IMPL, encoding="utf-8")) if os.path.exists(IMPL) else {}
    sc = json.load(open(SENT, encoding="utf-8")) if os.path.exists(SENT) else {}
    for s in scenes:
        if s["id"] in out:
            continue
        pairs = []
        for p in candidates(s):
            v0 = confirm_fact(p["fact"], p["claim"], p["sentence"])
            v2 = c2(p["fact"], p["claim"], p["sentence"], impl)
            v3 = c3(p["fact"], p["sentence"], sc)
            pairs.append({**p, "c0": v0, "c2": v2, "c3": v3, "onPlant": s["plant"]["sentence"][:30] in p["sentence"]})
        out[s["id"]] = {"contradicts": s["plant"]["contradicts"], "pairs": pairs}
        json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  {s['id']:34s} pairs={len(pairs)}", flush=True)
    union = lambda p: p["c0"] or p["c2"] >= .5 or p["c3"] >= .5  # noqa: E731
    for name, rule in (("C0", lambda p: p["c0"]), ("union", union)):
        caught = sum(any(rule(p) and p["onPlant"] for p in v["pairs"]) for v in out.values() if v["contradicts"])
        plant_fa = sum(any(rule(p) and p["onPlant"] for p in v["pairs"]) for v in out.values() if not v["contradicts"])
        other_fa = sum(any(rule(p) and not p["onPlant"] for p in v["pairs"]) for v in out.values())
        npos = sum(v["contradicts"] for v in out.values())
        lo, hi = bench.wilson(caught, npos)
        print(f"{name:6s} contradictions caught {caught}/{npos} [{lo:.0f}-{hi:.0f}%]; hard negatives flagged "
              f"{plant_fa}/{len(out) - npos}; scenes flagged elsewhere {other_fa}/{len(out)}")
    matched = sum(any(p["onPlant"] for p in v["pairs"]) for v in out.values() if v["contradicts"])
    print(f"plants that reached the confirmer at all: {matched}/{sum(v['contradicts'] for v in out.values())}")


if __name__ == "__main__":
    main()
