"""
Stage 2 of the focused gate: every failing dimension must prove itself.

Stage 1 is the focused score already measured (geval.json: integer + expected
score per scene/variant/dimension). For each dimension that FAILS stage 1, ask
the judge for the one verbatim passage that shows a problem of THAT dimension,
with the other dimensions named as not-this. Code then checks:
  - the quote is really in the draft (else: overturned, the fail had no evidence)
  - for defect variants: does the quote land inside the planted defect?

Questions: does verification (a) cut the halo — off-target fails on broken
scenes, (b) cut false fails on clean scenes, (c) keep the on-target fails,
and (d) point at the actual planted passage?
"""
import json, re, sys, time, urllib.request, importlib.util

SP = sys.argv[1]
spec = importlib.util.spec_from_file_location("g", SP + "/geval_probe_lib.py")
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

stage1 = json.load(open(SP + "/geval.json"))["rows"]
OUT = SP + "/verify.json"

DEFINITION = {
    "continuity": "a statement that contradicts the STORY BIBLE or the established facts (who is alive or dead, what happened, who owes what)",
    "voice": "dialogue where different characters sound like the same person, or a character speaks against how the bible describes them",
    "show_tell": "a passage that REPORTS or summarises what happened or what someone felt, instead of dramatising it in action, speech and sensory detail",
    "pacing": "material that advances neither plot, character nor tension — filler, description that goes nowhere, a beat that drags",
    "emotional_goal": "a passage that works against, or fails to deliver, the emotional goal stated in the brief",
}

# the planted text, per defect, to test whether the quote points at it
MARKERS = {
    "voice_flatten": ["We should keep moving"],
    "told_not_shown": g.SUMMARIES,
    "padding": g.FILLERS,
    "contradiction": ["had been dead for two years"],
}


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("—", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def found(quote, draft):
    q = norm(quote).strip(' ."\'')
    if len(q) < 12:
        return False
    d = norm(draft)
    if q in d:
        return True
    # tolerate an elided middle ("... ") — every fragment must be present
    parts = [p.strip(' ."\'') for p in re.split(r"\.\.\.|…", q) if len(p.strip()) >= 12]
    return bool(parts) and all(p in d for p in parts)


def on_marker(quote, defect):
    q = norm(quote)
    for m in MARKERS.get(defect, []):
        m = norm(m)
        # overlap of a decent chunk either way
        if m[:40] in q or q[:40] in m or any(w in q for w in [m[i:i + 30] for i in range(0, max(1, len(m) - 30), 10)]):
            return True
    return False


SCHEMA = {"type": "object", "properties": {"quote": {"type": "string"}, "why": {"type": "string"}}, "required": ["quote", "why"]}


def verify(dim, s, draft):
    others = "\n".join(f"- {d}: {DEFINITION[d]}" for d in g.DIMS if d != dim)
    prompt = f"""A reviewer marked this scene LOW on ONE aspect: {dim}.

A {dim} problem means: {DEFINITION[dim]}.

These are OTHER aspects. A passage whose problem is one of these does NOT count as a {dim} problem:
{others}

Your job: find the single passage of the DRAFT TEXT that most clearly shows a {dim} problem, and copy it EXACTLY, word for word (one to three sentences).
If no passage shows a {dim} problem specifically, return an empty quote "". An empty quote is a correct answer when the problem is really a different aspect.

{g.scene_block(s, draft)}

Return JSON: {{ "quote": "exact words from the draft, or empty", "why": "one sentence" }}"""
    body = {"model": g.MODEL, "stream": False, "think": False, "format": SCHEMA, "keep_alive": "30m",
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 400},
            "messages": [{"role": "system", "content": f"You verify a story editor's verdict on {dim}. You quote exactly, and you refuse to blame {dim} for a problem that belongs to another aspect."},
                         {"role": "user", "content": prompt}]}
    req = urllib.request.Request(g.HOST + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=600))
    return json.loads(r["message"]["content"])


rows, t0 = [], time.time()
for r in stage1:
    fail_int = r["score"] < 7
    fail_ev = r["ev"] is not None and r["ev"] < 7
    if not (fail_int or fail_ev):
        continue
    s = g.corpus[r["scene"]]
    draft = g.DEFECTS[r["defect"]][1](s["draft"], s["storyBible"])
    v = verify(r["dim"], s, draft)
    q = v.get("quote", "") or ""
    row = {**{k: r[k] for k in ("scene", "defect", "target", "dim", "score", "ev")}, "fail_int": fail_int, "fail_ev": fail_ev,
           "quote": q, "why": v.get("why", ""), "quoteFound": found(q, draft) if q else False,
           "onPlanted": on_marker(q, r["defect"]) if q and r["defect"] != "control" else None}
    rows.append(row)
    print(r["scene"], r["defect"], r["dim"], r["score"], round(r["ev"], 2), "| found" if row["quoteFound"] else "| EMPTY" if not q else "| NOT-IN-DRAFT",
          "| planted" if row["onPlanted"] else "", "|", q[:90].replace("\n", " "), flush=True)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("done", round((time.time() - t0) / 60, 1), "min", len(rows), "verifications")
