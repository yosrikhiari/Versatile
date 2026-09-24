"""
Repair in place instead of rewriting the scene (§25 probe).

The gate now names exactly what is wrong — filler paragraphs by number, the
contradicting sentence by quote — but sceneGate answers any failure by writing
the whole scene again. Here, on all 30 corpus scenes:

  pacing: padded variant -> forward labels (+ reversed confirm if >= 2) -> cut
          the CONFIRMED filler paragraphs (code, no model call) -> re-judge.
          Did it pass? Were the cut paragraphs the planted ones?
  continuity: contradiction variant -> isolated check -> rewrite only the
          flagged sentence -> re-check. Did it pass? Is the rest untouched?

Production request shapes (/api/generate, repeat_penalty 1).

    python tools/judge-probes/repair_probe.py reports/live/judge-probes/repair.json
"""
import json, os, sys, time, urllib.request, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv
sys.argv = [argv[0], "unused"]
pv = {"__file__": os.path.join(HERE, "pacing_penalty_probe.py")}
exec(open(os.path.join(HERE, "pacing_penalty_probe.py"), encoding="utf-8").read().split("rows, t0 = [], time.time()")[0], pv)
cv = {"__file__": os.path.join(HERE, "continuity_probe.py")}
exec(open(os.path.join(HERE, "continuity_probe.py"), encoding="utf-8").read().split("rows, t0 = [], time.time()")[0], cv)
sys.argv = argv
g, paragraphs, pcall = pv["g"], pv["paragraphs"], pv["call"]
cjudge = cv["judge"]
OUT = argv[1]


def gen(system, prompt, schema, num_predict=300):
    body = {"model": g.MODEL, "system": system, "prompt": prompt, "stream": False, "think": False, "format": schema, "keep_alive": "30m",
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": num_predict, "top_p": 0.9, "min_p": 0.05, "repeat_penalty": 1}}
    req = urllib.request.Request(g.HOST + "/api/generate", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.loads(json.load(urllib.request.urlopen(req, timeout=600))["response"])


def confirm(sentence, fact):
    r = gen("You decide whether two statements about a story contradict each other.",
            f"""STATEMENT A (an established fact): {fact}
STATEMENT B (from a new scene): {sentence}

Can A and B both be true in the same story? A statement that repeats, paraphrases, adds detail to, or agrees with the other CAN be true alongside it. Answer false only if believing B means A must be false.

Return JSON: {{ "bothCanBeTrue": true or false }}""",
            {"type": "object", "properties": {"bothCanBeTrue": {"type": "boolean"}}, "required": ["bothCanBeTrue"]}, 30)
    return r.get("bothCanBeTrue") is True


def contradictions(bible, draft):
    _, verified, _ = cjudge(bible, draft)
    return [c for c in verified if not confirm(c["sentence"], c["fact"])]


def pacing_verdict(paras, brief):
    fwd = pcall(paras, brief, "nopen")
    if len(fwd) < 2:
        return fwd, [], False
    rev = sorted(len(paras) + 1 - i for i in pcall(list(reversed(paras)), brief, "nopen"))
    confirmed = [i for i in fwd if i in rev]
    return fwd, confirmed, len(confirmed) >= 1


def rewrite_sentence(sentence, fact, draft):
    r = gen("You are a careful line editor for fiction.",
            f"""This sentence from a scene contradicts an established fact of the story.

FACT: {fact}
SENTENCE: {sentence}

Rewrite ONLY this sentence so it no longer contradicts the fact. Keep its place in the scene, its voice and length; change as little as possible. If the sentence cannot be saved, return an empty string to delete it.

Return JSON: {{ "sentence": "the rewritten sentence, or empty" }}""",
            {"type": "object", "properties": {"sentence": {"type": "string"}}, "required": ["sentence"]}, 200)
    return r.get("sentence", "")


rows, t0 = [], time.time()
for idx in sorted(g.corpus):
    s = g.corpus[idx]
    # ---- pacing
    padded = g.DEFECTS["padding"][1](s["draft"], s["storyBible"])
    paras = paragraphs(padded)
    planted = {i + 1 for i, p in enumerate(paras) if p in g.FILLERS}
    fwd, confirmed, failing = pacing_verdict(paras, s["sceneBrief"])
    row = {"scene": idx, "pacing": {"failed": failing, "flagged": fwd, "cut": confirmed, "planted": sorted(planted)}}
    if failing:
        kept = [p for i, p in enumerate(paras) if i + 1 not in confirmed]
        fwd2, conf2, fail2 = pacing_verdict(kept, s["sceneBrief"])
        row["pacing"].update({
            "cutPlanted": len(set(confirmed) & planted), "cutReal": len(set(confirmed) - planted),
            "plantedLeft": len(planted - set(confirmed)), "passesAfter": not fail2, "flaggedAfter": fwd2,
        })
    # ---- continuity
    contra = g.DEFECTS["contradiction"][1](s["draft"], s["storyBible"])
    found = contradictions(s["storyBible"], contra)
    row["continuity"] = {"found": len(found)}
    if found:
        repaired = contra
        for c in found:
            new = rewrite_sentence(c["sentence"], c["fact"], contra)
            # the flagged sentence is a verified exact quote, so replace it where it is
            repaired = repaired.replace(c["sentence"], new, 1) if c["sentence"] in repaired else repaired
        after = contradictions(s["storyBible"], repaired)
        changed = sum(1 for a, b in zip(contra.split(), repaired.split()) if a != b)
        row["continuity"].update({"passesAfter": not after, "remaining": [a["sentence"][:80] for a in after],
                                  "rewrites": [(c["sentence"][:70]) for c in found],
                                  "charsBefore": len(contra), "charsAfter": len(repaired),
                                  "stillSaysDead": "dead for two years" in repaired})
    rows.append(row)
    print(idx, json.dumps(row)[:300], flush=True)
    json.dump({"rows": rows}, open(OUT, "w"), indent=1)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w"), indent=1)
print("done", round((time.time() - t0) / 60, 1), "min")
