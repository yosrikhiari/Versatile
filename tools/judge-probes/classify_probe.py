"""
Stage 3: attribute each distinct flagged passage to ONE aspect (or none).

Stage 2 showed the judge localises the flaw correctly but blames it on
whichever dimension it is asked about (halo). So stop asking five
dimension-shaped questions about one passage: dedupe the quoted passages per
scene variant and ask a single multiple-choice question per passage, reading
the probabilities over the six letters.
"""
import json, math, re, sys, time, urllib.request, importlib.util

SP = sys.argv[1]
spec = importlib.util.spec_from_file_location("g", SP + "/geval_probe_lib.py")
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
vspec = importlib.util.spec_from_file_location("v", SP + "/verify_lib.py")
v = importlib.util.module_from_spec(vspec); vspec.loader.exec_module(v)

stage2 = json.load(open(SP + "/verify.json", encoding="utf-8"))["rows"]
LETTERS = ["A", "B", "C", "D", "E", "F"]
OPTIONS = [(d, v.DEFINITION[d]) for d in g.DIMS] + [("none", "nothing is wrong with this passage in context — it is acceptable prose")]


def key(q):
    return v.norm(q)[:60]


# unique passages per (scene, defect), remembering which dims quoted them
groups = {}
for r in stage2:
    if not r["quote"]:
        continue
    k = (r["scene"], r["defect"], key(r["quote"]))
    groups.setdefault(k, {"scene": r["scene"], "defect": r["defect"], "target": r["target"], "quote": r["quote"], "askedBy": [], "onPlanted": r["onPlanted"]})
    groups[k]["askedBy"].append(r["dim"])

SCHEMA = {"type": "object", "properties": {"answer": {"type": "string", "enum": LETTERS}}, "required": ["answer"]}


def classify(s, draft, quote):
    opts = "\n".join(f"{L}) {name}: {desc}" for L, (name, desc) in zip(LETTERS, OPTIONS))
    prompt = f"""Below is a scene, and one PASSAGE from it that a reviewer flagged.

PASSAGE:
\"\"\"{quote}\"\"\"

Read the passage in the context of the whole scene. What is wrong with it? Choose the ONE option that fits best:
{opts}

{g.scene_block(s, draft)}

Return JSON: {{ "answer": "one letter" }}"""
    body = {"model": g.MODEL, "stream": False, "think": False, "format": SCHEMA, "keep_alive": "30m",
            "logprobs": True, "top_logprobs": 10,
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 20},
            "messages": [{"role": "system", "content": "You are a story editor. You diagnose one flagged passage precisely, and you say when a flagged passage is actually fine."},
                         {"role": "user", "content": prompt}]}
    req = urllib.request.Request(g.HOST + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=600))
    ans = json.loads(r["message"]["content"])["answer"]
    dist = {}
    for t in r.get("logprobs") or []:
        if t["token"].strip() in LETTERS:
            for alt in t.get("top_logprobs", []):
                a = alt["token"].strip()
                if a in LETTERS:
                    dist[a] = dist.get(a, 0) + math.exp(alt["logprob"])
            break
    z = sum(dist.values()) or 1
    dist = {OPTIONS[LETTERS.index(k)][0]: round(p / z, 3) for k, p in dist.items()}
    return OPTIONS[LETTERS.index(ans)][0], dist


rows, t0 = [], time.time()
for k, grp in groups.items():
    s = g.corpus[grp["scene"]]
    draft = g.DEFECTS[grp["defect"]][1](s["draft"], s["storyBible"])
    label, dist = classify(s, draft, grp["quote"])
    row = {**grp, "label": label, "dist": dist}
    rows.append(row)
    print(grp["scene"], grp["defect"], "asked by", grp["askedBy"], "->", label, dist, "| planted" if grp["onPlanted"] else "", "|", grp["quote"][:70].replace("\n", " "), flush=True)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(SP + "/classify.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("done", round((time.time() - t0) / 60, 1), "min", len(rows), "passages")
