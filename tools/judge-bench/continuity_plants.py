"""
Held-out check for the facts-only continuity candidate (§31): planted
contradictions the candidate was never tuned on.

The candidate was debugged on the reviewers' 9 facts-type problems, so its
score there is optimistic. Here one sentence that contradicts a story fact --
mostly by taking something for granted, in varied wording -- is added to the
end of the third paragraph of 12 scenes both reviewers marked continuity-fine.
Two plants name nobody from the facts, to measure the name filter's blind spot.

    python -X utf8 tools/judge-bench/continuity_plants.py
"""
import json
import os
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import VERSION, judge_facts  # noqa: E402

# (scene, planted sentence, fact it contradicts, names a fact-name?)
PLANTS = [
    ("repair-run-05", "Nesrin counted the three quiet days since they left, days in which not one of the workers had so much as fallen ill.",
     "A worker dies mysteriously during their third day of travel", True),
    ("salt-corpus-03", "Nesrin had not spoken to Halim since the morning they buried him at the oasis.",
     "Halim is alive and leading a caravan", True),
    ("gate-off-run-06", "Nesrin remembered how the tax-farmer had waved her through without asking for a single grain of salt.",
     "Nesrin paid the tax-farmer with the last of the coast salt but was met with a ledger and a demand", True),
    ("pool-orbit-08", "Adaeze had never touched the old transmitter; it had been dead since before she came aboard.",
     "Adaeze has reactivated the old transmitter", True),
    ("pool-orchard-07", "Lucie had cried for a week after she was told about the sale of the orchard.",
     "Lucie has not been informed of the sale", True),
    ("salt-corpus-01", "She pressed the ring into her palm, the only thing left of Halim after the sandstorm took him.",
     "Halim is alive and leading a caravan", True),
    ("gate-on-run-04", "Nesrin had never been accused of anything in her life, and the whole market square knew her as honest.",
     "She has been accused of smuggling fake goods in the market square", True),
    ("salt-corpus-11", "She had never owed anyone a single coin, and Halim knew it.",
     "Nesrin learns she must travel the Salt Road to repay her debt", True),
    ("repair-run-06", "Nesrin had refused the debt outright and never meant to leave the village at all.",
     "Nesrin accepts the debt and departs", True),
    ("pool-orbit-06", "With the doubled oxygen rations, Adaeze could finally sleep through the night.",
     "Oxygen rations have been reduced across the station", True),
    ("gate-on-run-06", "The grave by the well was the only place the man who ruled the Salt Road could not reach her now, and she visited it often.",
     "Halim is still alive and in control of the Salt Road", False),
    ("pool-harbour-07", "The container papers bore someone else's signature; she had never signed anything for that yard.",
     "Ines signed off on a container that never held a body", False),
]


def planted(scene, sentence):
    paras = scene["prose"].split("\n\n")
    k = min(2, len(paras) - 1)
    paras[k] = paras[k].rstrip() + " " + sentence
    return {**scene, "prose": "\n\n".join(paras)}


def main():
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    path = f"{bench.CACHE}/continuity-plants-{VERSION}.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for sid, sentence, fact, named in PLANTS:
        key = f"{sid}|{sentence[:30]}"
        if key not in cache:
            v = judge_facts(planted(pool[sid], sentence))
            v["hitPlant"] = any(sentence[:40] in e["sentence"] or e["sentence"][:40] in sentence for e in v["evidence"])
            cache[key] = v
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        v = cache[key]
        print(f"  {sid:18s} named={named!s:5s} fail={v['fail']!s:5s} onPlant={v['hitPlant']}", flush=True)
    for named in (True, False):
        rows = [cache[f"{s}|{t[:30]}"] for s, t, _, n in PLANTS if n == named]
        k = sum(r["hitPlant"] for r in rows)
        lo, hi = bench.wilson(k, len(rows))
        print(f"\ncontinuity-plants-{VERSION} (plant names a fact-name={named}): caught {k}/{len(rows)}  [{lo:.0f}-{hi:.0f}%]")


if __name__ == "__main__":
    main()
