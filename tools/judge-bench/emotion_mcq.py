"""
Emotional goal as a multiple-choice question (§35, plan step 3).

Today's emotional_goal judge is a near-constant 1-10 score (§29) that failed
8 current scenes the reviewers passed (§31). The research note (§27): judge
what a reader would feel, not how well a goal was "met". So:

  question  "What will a reader most likely feel at the end of this scene?"
  options   the scene's own emotional goal + 3 goals from scenes of OTHER
            stories (one book's goals overlap too much to be wrong answers),
            seeded shuffle, letters A-D
  score     the model's probability for the right letter, read from
            log-probabilities (a constrained JSON letter is not the model's
            most likely answer, §33)

Bench: reviewer consensus emotional_goal labels + the 12 masterpieces.

    python -X utf8 tools/judge-bench/emotion_mcq.py
"""
import json
import os
import random
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from confirm_variants import letter_probs_n  # noqa: E402

PATH = f"{bench.CACHE}/emotion-mcq-v1.json"


def story(sid):
    return sid.rsplit("-", 1)[0] if not sid.startswith(("salt", "pool")) else sid.rsplit("-", 1)[0]


def options_for(scene, all_scenes):
    rng = random.Random(scene["id"])
    own = scene["brief"]["emotionalGoal"].strip()
    others = [s["brief"]["emotionalGoal"].strip() for s in all_scenes
              if story(s["id"]) != story(scene["id"]) and s["brief"].get("emotionalGoal")]
    others = [o for o in dict.fromkeys(others) if o.lower() != own.lower()]
    opts = rng.sample(others, 3) + [own]
    rng.shuffle(opts)
    return opts, opts.index(own)


def judge(scene, all_scenes):
    opts, right = options_for(scene, all_scenes)
    letters = "ABCD"
    listing = "\n".join(f"{letters[i]}) {o}" for i, o in enumerate(opts))
    p = letter_probs_n("You are an attentive reader of fiction.",
                     f"""SCENE:
{scene['prose']}

What will a reader most likely feel by the end of this scene?
{listing}

Answer with one letter only.""")
    return {"p": round(p.get(letters[right], 0.0), 4), "right": letters[right], "probs": p, "options": opts}


def main():
    problem, fine, masters = bench.load("emotional_goal")
    pool = json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]
    everyone = pool + masters
    cache = json.load(open(PATH, encoding="utf-8")) if os.path.exists(PATH) else {}
    rows = [(s, "problem") for s in problem] + [(s, "fine") for s in fine] + [(s, "master") for s in masters]
    for s, lab in rows:
        if s["id"] in cache:
            continue
        if not s["brief"].get("emotionalGoal"):
            continue
        cache[s["id"]] = {**judge(s, everyone), "label": lab, "current": not s["id"].startswith("salt")}
        json.dump(cache, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  {s['id']:22s} {lab:7s} P(right)={cache[s['id']]['p']}", flush=True)


if __name__ == "__main__" and not sys.argv[1:]:
    main()


# ---- v2: wrong answers about the SAME scene (§35) ---------------------------
# v1 drew distractors from "other stories" by id prefix, but gate-*, repair-run
# and graph-repair-run are all Salt Road books: a Nesrin scene's wrong answers
# were other Nesrin goals, often just as true. Drawing from genuinely other
# stories is no better: "Ines discovers the body" is wrong by its names, so the
# question tests names, not feeling. v2 writes the wrong answers for the same
# scene, from its brief alone (never the prose), with a different feeling.
PATH2 = f"{bench.CACHE}/emotion-mcq-v2.json"
ALT = f"{bench.CACHE}/emotion-alternatives.json"


def alternatives(scene, cache):
    from continuity_claims import gen
    if scene["id"] not in cache:
        b = scene["brief"]
        r = gen("You write alternative emotional goals for a scene of fiction.",
                f"""SCENE BRIEF
Title: {b.get('title', '')}
Characters: {', '.join(b.get('characters') or [])}
Intended emotional effect: {b['emotionalGoal']}

Write 3 alternative emotional effects a scene with the same characters and situation could aim for INSTEAD. Each must be a clearly different feeling from the intended one and from each other (for example hope, grief, amusement, relief, anger, tenderness, awe, dread), phrased the same way and about the same length, naming the same characters.

Return JSON: {{ "alternatives": ["...", "...", "..."] }}""",
                {"type": "object", "properties": {"alternatives": {"type": "array", "minItems": 3, "maxItems": 3,
                 "items": {"type": "string"}}}, "required": ["alternatives"]}, 300)
        cache[scene["id"]] = [a for a in r.get("alternatives", []) if isinstance(a, str)][:3]
        json.dump(cache, open(ALT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return cache[scene["id"]]


def judge_v2(scene, alt_cache):
    own = scene["brief"]["emotionalGoal"].strip()
    alts = alternatives(scene, alt_cache)
    if len(alts) < 3:
        return None
    opts = alts + [own]
    random.Random(scene["id"]).shuffle(opts)
    right = opts.index(own)
    letters = "ABCD"
    listing = "\n".join(f"{letters[i]}) {o}" for i, o in enumerate(opts))
    p = letter_probs_n("You are an attentive reader of fiction.",
                       f"""SCENE:
{scene['prose']}

What will a reader most likely feel by the end of this scene?
{listing}

Answer with one letter only.""")
    return {"p": round(p.get(letters[right], 0.0), 4), "right": letters[right], "probs": p, "options": opts}


def main_v2():
    problem, fine, masters = bench.load("emotional_goal")
    cache = json.load(open(PATH2, encoding="utf-8")) if os.path.exists(PATH2) else {}
    alt = json.load(open(ALT, encoding="utf-8")) if os.path.exists(ALT) else {}
    rows = [(s, "master") for s in masters] + [(s, "problem") for s in problem] + [(s, "fine") for s in fine]
    for s, lab in rows:
        if s["id"] in cache or not s["brief"].get("emotionalGoal"):
            continue
        v = judge_v2(s, alt)
        if v is None:
            continue
        cache[s["id"]] = {**v, "label": lab, "current": not s["id"].startswith("salt")}
        json.dump(cache, open(PATH2, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  {s['id']:22s} {lab:7s} P(right)={cache[s['id']]['p']}", flush=True)


if __name__ == "__main__" and sys.argv[1:] == ["v2"]:
    main_v2()
