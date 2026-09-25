"""
The judge bench (§31): score any candidate judge on the two tests that matter.

  1. Generated scenes (reports/live/labelling): catch what BOTH independent
     reviewer passes marked Problem, stay quiet on what both marked Fine.
     Scenes the reviewers disagreed on are left out.
  2. Masterpieces (reports/live/masterpieces): pass them. A judge that fails
     Chekhov is measuring style, not quality (§30).

A candidate is a function judge(scene) -> {"fail": bool, "evidence": [...]},
where `scene` has the pool shape (brief, facts, prose). Results are cached per
(candidate, scene) under reports/live/judge-bench/, so re-scoring is free and
an interrupted run resumes.
"""
import json
import os
import sys
from math import sqrt

LAB = "reports/live/labelling"
MAS = "reports/live/masterpieces"
CACHE = "reports/live/judge-bench"


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (100 * (c - h) / d, 100 * (c + h) / d)


def load(dim):
    pool = {s["id"]: s for s in json.load(open(f"{LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    cons = {r["sceneId"]: r for r in json.load(open(f"{LAB}/claude-labels/consensus.json", encoding="utf-8"))}
    problem = [pool[s] for s, r in cons.items() if r["dims"][dim] == "problem"]
    fine = [pool[s] for s, r in cons.items() if r["dims"][dim] == "fine"]
    masters = json.load(open(f"{MAS}/scenes.json", encoding="utf-8"))["scenes"]
    return problem, fine, masters


def run(name, dim, judge, split=None):
    """split: None (all) | 'odd' | 'even' -- by the scene's pool order, so a
    threshold can be chosen on one half and tested on the other."""
    problem, fine, masters = load(dim)
    if split:
        keep = 1 if split == "odd" else 0
        problem = [s for s in problem if s["order"] % 2 == keep]
        fine = [s for s in fine if s["order"] % 2 == keep]
    os.makedirs(CACHE, exist_ok=True)
    path = f"{CACHE}/{name}.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}

    def verdict(scene):
        if scene["id"] not in cache:
            cache[scene["id"]] = judge(scene)
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  [{name}] {scene['id']:22s} fail={cache[scene['id']]['fail']}", flush=True)
        return cache[scene["id"]]

    caught = sum(verdict(s)["fail"] for s in problem)
    alarms = sum(verdict(s)["fail"] for s in fine)
    mfail = sum(verdict(s)["fail"] for s in masters)
    c, a, m = wilson(caught, len(problem)), wilson(alarms, len(fine)), wilson(mfail, len(masters))
    print(f"\n{name} [{dim}{', ' + split if split else ''}]")
    print(f"  reviewer problems caught  {caught}/{len(problem)}  [{c[0]:.0f}-{c[1]:.0f}%]")
    print(f"  false alarms on fine      {alarms}/{len(fine)}  [{a[0]:.0f}-{a[1]:.0f}%]")
    print(f"  masterpieces failed       {mfail}/{len(masters)}  [{m[0]:.0f}-{m[1]:.0f}%]")
    return {"caught": (caught, len(problem)), "alarms": (alarms, len(fine)), "masterpieces": (mfail, len(masters))}


if __name__ == "__main__":
    print(__doc__)
    sys.exit(0)
