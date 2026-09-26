"""
The continuity confirmer's development set (§32): every (sentence, fact) pair
that reaches the confirming step, from plant set A, the reviewers' 9
facts-type problems, and the 29 reviewer-fine scenes with facts. Labels:
plant pair = contradiction; any other pair in a clean scene = not; pairs from
the 9 reviewer scenes are labelled by hand (LABELS below). Set B
(continuity_plants_b.py) is kept out of this entirely.

    python -X utf8 tools/judge-bench/confirm_dev.py harvest
"""
import json
import os
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import against_facts, extract, names_in, sentences  # noqa: E402

PATH = f"{bench.CACHE}/confirm-dev-candidates.json"
REVIEWER = ['salt-corpus-09', 'salt-corpus-25', 'salt-corpus-14', 'salt-corpus-07', 'salt-corpus-20',
            'salt-corpus-22', 'salt-corpus-08', 'salt-corpus-30', 'pool-orchard-06']


# Hand labels for the reviewer scenes' pairs (2026-09-25), applied to the cache:
# contradictions -- 09#0 "given her before he died", 14#0 "since the day Halim
# died", 20#0 "left Halim's body", orchard-06#0 "I didn't sell anything"
# (dialogue; a lie is possible, the reviewers flagged it); left out as doubtful
# -- 07#0 (the facts do not say whom the debt is owed to); every other pair: no.
HAND_LABELS = {"pos": ["salt-corpus-09#0", "salt-corpus-14#0", "salt-corpus-20#0", "pool-orchard-06#0"],
               "skip": ["salt-corpus-07#0"]}


def candidates(scene):
    facts = scene["facts"]
    names = names_in(facts)
    sents = [s for s in sentences(scene["prose"]) if any(n in s for n in names)]
    if not sents:
        return []
    claims = extract(sents)
    if not claims:
        return []
    out, seen = [], set()
    for h in against_facts(claims, facts):
        s = sents[claims[h["claim"] - 1]["s"] - 1]
        fact = next((f for f in facts if h["fact"][:25].lower() in f.lower() or f[:25].lower() in h["fact"].lower()), h["fact"])
        if (s, fact) in seen:
            continue
        seen.add((s, fact))
        out.append({"sentence": s, "fact": fact, "claim": claims[h["claim"] - 1]["claim"]})
    return out


def harvest():
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    plants = json.load(open("reports/live/plants/scenes.json", encoding="utf-8"))["scenes"]
    cons = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/consensus.json", encoding="utf-8"))}
    fine = [s for s, r in cons.items() if r["dims"]["continuity"] == "fine" and pool[s]["facts"]]
    jobs = [(p["id"], p, "plant") for p in plants] + [(s, pool[s], "reviewer") for s in REVIEWER] + \
           [(s, pool[s], "fine") for s in fine]
    cache = json.load(open(PATH, encoding="utf-8")) if os.path.exists(PATH) else {}
    for key, scene, kind in jobs:
        if key in cache:
            continue
        try:
            cands = candidates(scene)
        except Exception as e:  # noqa: BLE001 -- recorded, not fatal
            cache[key] = {"kind": kind, "error": str(e)[:200], "pairs": []}
        else:
            for c in cands:
                if kind == "plant":
                    c["label"] = scene["plant"]["sentence"][:30] in c["sentence"]
                elif kind == "fine":
                    c["label"] = False
                else:
                    c["label"] = None  # by hand: see HAND_LABELS
            cache[key] = {"kind": kind, "pairs": cands}
        json.dump(cache, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  {key:32s} {kind:8s} pairs={len(cache[key]['pairs'])}", flush=True)


if __name__ == "__main__" and sys.argv[1:] == ["harvest"]:
    harvest()
