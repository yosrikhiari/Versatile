"""
Re-grade the §14 contradiction probe with a checker that can see.

§14 wrote 4 scenes x 3 repeats twice — with the ESTABLISHED FACTS ledger in the
writer's prompt and without — and graded them with `checkContradictions`:
+0.67 contradictions/scene WITH the ledger, p = 0.25. That checker was later
shown to miss what the §20 isolated checker catches (planted contradiction 8/30
for the whole-scene judge vs 29/30 isolated, 0/30 clean).

Same 24 saved scenes, same ledger (facts from chapters before the scene), now
graded by the isolated continuity checker with code-verified quotes.

    python tools/judge-probes/rejudge_contradictions.py
"""
import json, os, itertools, importlib.util
from statistics import mean

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("c", os.path.join(HERE, "continuity_probe.py"))
src = open(os.path.join(HERE, "continuity_probe.py"), encoding="utf-8").read().split("rows, t0 = [], time.time()")[0]
ns = {"__file__": os.path.join(HERE, "continuity_probe.py"), "__name__": "lib"}
import sys
argv = sys.argv; sys.argv = [argv[0], "unused"]; exec(src, ns); sys.argv = argv
judge = ns["judge"]

ROOT = "reports/live/contradiction-probe"
plan = json.load(open("reports/live/the-salt-road-run5-qwen/plan.json", encoding="utf-8"))


def facts_before(ch):
    return [f"Ch{e['chapterNumber']}: {f}" for e in plan["spine"] if e and e["chapterNumber"] < ch for f in (e.get("keyFacts") or [])]


rows = []
for arm in ["facts", "nofacts"]:
    summary = json.load(open(f"{ROOT}/{arm}/summary.json", encoding="utf-8"))
    for r in summary["results"]:
        prose = open(f"{ROOT}/{arm}/{r['index']}-r{r['repeat']}.prose.txt", encoding="utf-8").read()
        ledger = "\n".join(facts_before(r["chapterNumber"]))
        claimed, verified, shown = judge(ledger, prose)
        rows.append({"arm": arm, "scene": r["index"], "rep": r["repeat"], "old": r["contradictions"], "new": len(verified),
                     "shown": shown, "verified": verified, "words": r["words"]})
        print(arm, r["index"], r["repeat"], "old", r["contradictions"], "new", len(verified), [v["sentence"][:70] for v in verified], flush=True)

json.dump(rows, open("reports/live/judge-probes/rejudge-contradictions.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

scenes = sorted({r["scene"] for r in rows})
diffs = []
for s in scenes:
    f = mean(r["new"] for r in rows if r["scene"] == s and r["arm"] == "facts")
    n = mean(r["new"] for r in rows if r["scene"] == s and r["arm"] == "nofacts")
    diffs.append(f - n)
    print(f"scene {s}: with ledger {f:.2f}  without {n:.2f}  diff {f - n:+.2f}")
obs = mean(diffs)
# exact paired permutation (sign flips) over scene means
flips = [mean(d * s for d, s in zip(diffs, signs)) for signs in itertools.product([1, -1], repeat=len(diffs))]
p = sum(abs(x) >= abs(obs) - 1e-12 for x in flips) / len(flips)
print(f"mean diff (with - without) {obs:+.2f} contradictions/scene, exact two-sided p = {p:.3f} (floor {2 / len(flips):.3f})")
print("totals: with", sum(r["new"] for r in rows if r["arm"] == "facts"), "without", sum(r["new"] for r in rows if r["arm"] == "nofacts"),
      "| old judge: with", sum(r["old"] for r in rows if r["arm"] == "facts"), "without", sum(r["old"] for r in rows if r["arm"] == "nofacts"))
