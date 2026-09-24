"""
Build the `told_faithful` fixture: a show-tell defect that is NOT also filler.

The original `told_not_shown` injection replaces every other long paragraph
with a content-free sentence ("The business of the hour was transacted without
incident worth recording here."). That is telling, but it is also filler and
it guts the emotional beat, so a judge that blames pacing or emotional_goal is
not wrong — the fixture breaks three dimensions at once (§20).

Here each replaced paragraph becomes ONE plain sentence that keeps its plot
facts and states the feeling outright: pure telling, nothing lost to the plot.
Generated once with qwen3:8b at temperature 0 and cached, so the fixture is
fixed text from then on, like the others.

    python tools/judge-probes/make_told_faithful.py
    -> reports/live/judge-probes/told-faithful.json  {index: [summary, ...]}
"""
import json, re, urllib.request

HOST, MODEL = "http://localhost:11434", "qwen3:8b"
corpus = json.load(open("reports/live/critic-rank-agreement/corpus.json", encoding="utf-8"))
OUT = "reports/live/judge-probes/told-faithful.json"


def targets(draft):
    # the same paragraphs `told_not_shown` replaces: even index, over 200 chars
    paras = re.split(r"\n\s*\n", draft)
    return [p for i, p in enumerate(paras) if i % 2 == 0 and len(p) > 200]


out = {}
for c in corpus:
    ps = targets(c["draft"])
    if not ps:
        continue
    listing = "\n\n".join(f"[{i + 1}] {p}" for i, p in enumerate(ps))
    schema = {"type": "object", "properties": {"summaries": {"type": "array", "items": {"type": "string"}, "minItems": len(ps), "maxItems": len(ps)}}, "required": ["summaries"]}
    prompt = f"""Rewrite EACH numbered paragraph as ONE plain sentence of summary.
Keep every plot fact: who does what, what is learned, what changes. State any feeling outright ("she was afraid").
No imagery, no sensory detail, no dialogue, no quotation marks. Report it; do not dramatise it.

{listing}

Return JSON: {{ "summaries": [ exactly {len(ps)} sentences, in order ] }}"""
    body = {"model": MODEL, "stream": False, "think": False, "format": schema, "keep_alive": "30m",
            "system": "You turn dramatised fiction into flat, faithful summary.", "prompt": prompt,
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 120 * len(ps) + 100, "repeat_penalty": 1}}
    req = urllib.request.Request(HOST + "/api/generate", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    sums = json.loads(json.load(urllib.request.urlopen(req, timeout=600))["response"])["summaries"]
    out[c["index"]] = [s.replace('"', "").replace("“", "").replace("”", "").strip() for s in sums]
    print(c["index"], len(ps), "->", out[c["index"]][0][:110], flush=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("wrote", OUT, len(out), "scenes")
