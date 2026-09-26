"""
Voice by style numbers (§32). Line-level blind attribution is near chance even
on published novels (AUC 53-55; LaTeCH 2024) and on real speakers (56.5%,
arXiv 2405.10150), so with 6-20 lines per scene it cannot work. Instead:
per-character style profiles from their dialogue, and how far apart the
characters are compared with how much each varies (no model in the measure).

  lines:    speaker-labelled dialogue, extracted once by the model and cached;
            code keeps only lines found verbatim in the prose
  features: words per line, question / exclamation / ellipsis-or-dash rates,
            contractions, first- and second-person rate, hedges, and the
            relative frequency of 25 function words
  score:    mean distance between character centroids (standardised features)
            divided by mean distance of a character's lines to its own centroid

    python -X utf8 tools/judge-bench/voice_style.py extract   # model, cached
    python -X utf8 tools/judge-bench/voice_style.py score     # no model
"""
import json
import os
import re
import sys
from statistics import mean, pstdev

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from voice_attrib import extract, norm  # noqa: E402

PATH = f"{bench.CACHE}/voice-lines.json"
FUNC = ["the", "a", "and", "but", "of", "to", "in", "you", "i", "it", "that", "is", "not", "we", "what",
        "if", "so", "just", "do", "no", "yes", "they", "there", "this", "be"]
HEDGE = {"perhaps", "maybe", "might", "suppose", "rather", "quite", "seems", "think", "fancy", "believe"}


def scenes():
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    cons = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/consensus.json", encoding="utf-8"))}
    masters = json.load(open(f"{bench.MAS}/scenes.json", encoding="utf-8"))["scenes"]
    rows = [(s, pool[s], cons[s]["dims"]["voice"]) for s in cons if cons[s]["dims"]["voice"] in ("problem", "fine")]
    rows.sort(key=lambda r: (r[2] != "problem", r[0]))
    return rows + [(m["id"], m, "master") for m in masters]


def do_extract():
    cache = json.load(open(PATH, encoding="utf-8")) if os.path.exists(PATH) else {}
    for sid, scene, lab in scenes():
        if sid in cache:
            continue
        try:
            cache[sid] = {"label": lab, "lines": extract(scene["prose"])}
        except (json.JSONDecodeError, KeyError) as e:
            cache[sid] = {"label": lab, "lines": [], "error": str(e)[:200]}
        json.dump(cache, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  {sid:22s} {lab:7s} lines={len(cache[sid]['lines'])}", flush=True)


def feats(line):
    words = re.findall(r"[a-z']+", line.lower())
    n = max(1, len(words))
    return [len(words), line.count("?") > 0, line.count("!") > 0,
            bool(re.search(r"\.\.\.|…|—|--", line)), sum("'" in w for w in words) / n,
            sum(w in ("i", "me", "my", "we", "us", "our") for w in words) / n,
            sum(w in ("you", "your", "yours") for w in words) / n,
            sum(w in HEDGE for w in words) / n] + [words.count(f) / n for f in FUNC]


def score_scene(lines, min_per=3):
    by = {}
    for x in lines:
        by.setdefault(norm(x["speaker"]), []).append(feats(x["line"]))
    by = {k: v for k, v in by.items() if len(v) >= min_per}
    if len(by) < 2:
        return None
    allv = [v for vs in by.values() for v in vs]
    cols = list(zip(*allv))
    mu = [mean(c) for c in cols]
    sd = [pstdev(c) or 1.0 for c in cols]
    z = {k: [[(x - m) / s for x, m, s in zip(v, mu, sd)] for v in vs] for k, vs in by.items()}
    cent = {k: [mean(c) for c in zip(*vs)] for k, vs in z.items()}
    dist = lambda a, b: sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5  # noqa: E731
    keys = list(cent)
    between = mean(dist(cent[a], cent[b]) for i, a in enumerate(keys) for b in keys[i + 1:])
    within = mean(dist(v, cent[k]) for k, vs in z.items() for v in vs)
    return between / within if within else None


def do_score():
    import pacing_features as pf
    cache = json.load(open(PATH, encoding="utf-8"))
    out = {}
    for sid, v in cache.items():
        out.setdefault(v["label"], []).append((score_scene(v["lines"]), sid))
    for lab in ("problem", "fine", "master"):
        rows = out.get(lab, [])
        judged = sorted(s for s, _ in rows if s is not None)
        print(f"{lab:7s} judged {len(judged)}/{len(rows)}  scores {[round(s, 2) for s in judged]}")
    P = [s for s, _ in out.get("problem", []) if s is not None]
    F = [s for s, _ in out.get("fine", []) if s is not None]
    M = [s for s, _ in out.get("master", []) if s is not None]
    print(f"AUC fine>problem {pf.auc(F, P):.2f}   AUC master>problem {pf.auc(M, P):.2f}")


if __name__ == "__main__":
    {"extract": do_extract, "score": do_score}[sys.argv[1]]()
