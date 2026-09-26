"""
Voice by blind attribution (§32). Distinct voices can be told apart without
speaker tags; interchangeable ones cannot.

  1. extract: every dialogue line in order with its speaker; code keeps only
     lines found verbatim (letters and digits) in the prose.
  2. keep speakers with >= 2 lines; need >= 2 such speakers and >= 6 lines,
     else the scene is not judged (like production's MIN_VOICE_LINES).
  3. mask every cast name inside the lines, shuffle (seeded), and ask the
     model to sort the lines into k voices (k = number of speakers).
  4. score = best-mapping accuracy, rescaled against chance for the same group
     sizes (simulated): 0 = no better than chance, 1 = perfect.

    python -X utf8 tools/judge-bench/voice_attrib.py
"""
import itertools
import json
import os
import random
import re
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import alnum, gen  # noqa: E402

LINES_SCHEMA = {"type": "object", "properties": {"lines": {"type": "array", "maxItems": 60, "items": {
    "type": "object", "properties": {"speaker": {"type": "string"}, "line": {"type": "string"}},
    "required": ["speaker", "line"]}}}, "required": ["lines"]}


def extract(prose):
    r = gen("You list the dialogue of a scene of fiction.",
            f"""SCENE:
{prose}

List every line of spoken dialogue in order: the words inside the quotation marks, copied exactly, and who speaks them (the name or description the scene uses; "unknown" if the scene does not make it clear).

Return JSON: {{ "lines": [ {{ "speaker": "...", "line": "..." }} ] }}""", LINES_SCHEMA, 2500)
    body = alnum(prose)
    return [x for x in r.get("lines", []) if isinstance(x.get("line"), str) and len(alnum(x["line"])) >= 6
            and alnum(x["line"]) in body and x.get("speaker", "unknown").strip().lower() != "unknown"]


def norm(sp):
    return re.sub(r"^(the|a|an)\s+", "", sp.strip().lower())


def best_accuracy(truth, pred, k):
    return max(sum(perm[p] == t for t, p in zip(truth, pred) if p < k) for perm in itertools.permutations(range(k))) / len(truth)


def chance(truth, k, sizes, n=400, seed=0):
    rng = random.Random(seed)
    accs = []
    for _ in range(n):
        pred = [i for i, c in enumerate(sizes) for _ in range(c)]
        rng.shuffle(pred)
        accs.append(best_accuracy(truth, pred, k))
    return sum(accs) / n


def judge(scene):
    lines = extract(scene["prose"])
    counts = {}
    for x in lines:
        counts[norm(x["speaker"])] = counts.get(norm(x["speaker"]), 0) + 1
    speakers = sorted(s for s, c in counts.items() if c >= 2)[:4]
    kept = [x for x in lines if norm(x["speaker"]) in speakers]
    if len(speakers) < 2 or len(kept) < 6:
        return {"judged": False, "fail": False, "lines": len(lines), "speakers": len(speakers)}
    names = set()
    for sp in speakers + list(scene["brief"].get("characters") or []):
        names.update(w for w in re.findall(r"[A-ZÀ-Ý][\w'’-]+", sp if sp[:1].isupper() else sp.title()) if len(w) > 2)
    masked = []
    for x in kept:
        t = x["line"]
        for n in names:
            t = re.sub(rf"\b{re.escape(n)}\b", "___", t)
        masked.append(t)
    order = list(range(len(kept)))
    random.Random(scene["id"]).shuffle(order)
    k = len(speakers)
    listing = "\n".join(f"[{i + 1}] \"{masked[j]}\"" for i, j in enumerate(order))
    schema = {"type": "object", "properties": {"voice": {"type": "array", "minItems": len(kept), "maxItems": len(kept),
              "items": {"type": "integer", "minimum": 1, "maximum": k}}}, "required": ["voice"]}
    r = gen("You attribute lines of dialogue to speakers by how they talk.",
            f"""These {len(kept)} lines of dialogue, shuffled, are spoken by {k} different characters. Names inside the lines are hidden as ___.

{listing}

Sort the lines into {k} voices by HOW each is said: word choice, rhythm, sentence length, formality, habits, what the speaker cares about. Give each line a voice number from 1 to {k}, in the order listed. Use every voice at least once.

Return JSON: {{ "voice": [ one number per line ] }}""", schema, 400)
    pred = [v - 1 for v in r.get("voice", [])][:len(kept)]
    if len(pred) != len(kept):
        return {"judged": False, "fail": False, "error": "bad length"}
    truth = [speakers.index(norm(kept[j]["speaker"])) for j in order]
    acc = best_accuracy(truth, pred, k)
    sizes = [pred.count(i) for i in range(k)]
    ch = chance(truth, k, sizes)
    score = (acc - ch) / (1 - ch) if ch < 1 else 0.0
    return {"judged": True, "fail": False, "acc": round(acc, 3), "chance": round(ch, 3), "score": round(score, 3),
            "lines": len(kept), "speakers": k}


def main():
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    cons = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/consensus.json", encoding="utf-8"))}
    masters = json.load(open(f"{bench.MAS}/scenes.json", encoding="utf-8"))["scenes"]
    gate = {v["sceneId"]: v for v in json.load(open(f"{bench.LAB}/gate-verdicts.json", encoding="utf-8"))["verdicts"]}
    rows = [(s, pool[s], cons[s]["dims"]["voice"]) for s in cons if cons[s]["dims"]["voice"] in ("problem", "fine")]
    rows.sort(key=lambda r: (r[2] != "problem", r[0]))
    order = [(s, sc, lab) for s, sc, lab in rows] + [(m["id"], m, "master") for m in masters]
    path = f"{bench.CACHE}/voice-attrib-v1.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for sid, scene, lab in order:
        if sid not in cache:
            try:
                cache[sid] = judge(scene)
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                cache[sid] = {"judged": False, "fail": False, "error": str(e)[:200]}
            cache[sid]["label"] = lab
            if sid in gate:
                cache[sid]["gateVoice"] = gate[sid]["dimensionScores"].get("voice")
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            v = cache[sid]
            print(f"  {sid:22s} {lab:7s} judged={v['judged']} score={v.get('score')} acc={v.get('acc')} chance={v.get('chance')} gate={v.get('gateVoice')}", flush=True)


if __name__ == "__main__":
    main()
