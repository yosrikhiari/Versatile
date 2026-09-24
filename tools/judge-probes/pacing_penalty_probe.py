"""
Does production's repeat_penalty cause the pacing judge's false FILLER flags?

Production (providers/ollama.ts buildOllamaOptions) always sends
repeat_penalty 1.15 over the last 512 tokens, top_p 0.9, min_p 0.05 — sane for
prose, but a label array is the same two words repeated, and a repetition
penalty pushes the model off "ADVANCES" the longer the list runs.

Replicates the production request exactly (/api/generate, same prompt, same
system, same options) and runs it with the penalty (arm "prod") and without
(arm "nopen") over all 30 corpus scenes, clean and padded.

    python tools/judge-probes/pacing_penalty_probe.py <out.json>
"""
import json, re, sys, time, urllib.request, importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("g", os.path.join(HERE, "geval_probe_lib.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

OUT = sys.argv[1]
ARMS = {
    "prod": {"repeat_penalty": 1.15, "repeat_last_n": 512},
    "nopen": {"repeat_penalty": 1.0, "repeat_last_n": 0},
}


def paragraphs(d):
    return [p.strip() for p in re.split(r"\n\s*\n", d) if p.strip()]


def pacing_prompt(paras, brief):
    listing = "\n\n".join(f"[{i + 1}] {p}" for i, p in enumerate(paras))
    return f"""SCENE GOAL: {brief.get('emotionalGoal') or '(not stated)'}
WHAT CHANGES: {brief.get('whatChanges') or brief.get('change') or '(not stated)'}

For EACH numbered paragraph, decide: ADVANCES — it moves the plot, reveals character, or raises tension toward the scene's goal; or FILLER — it could be deleted without losing anything the scene needs.

There are {len(paras)} paragraphs. Return exactly {len(paras)} labels, in order.

{listing}

Return JSON: {{ "labels": [ ... ] }}"""


def call(paras, brief, arm):
    schema = {"type": "object", "properties": {"labels": {"type": "array", "items": {"type": "string", "enum": ["ADVANCES", "FILLER"]}, "minItems": len(paras), "maxItems": len(paras)}}, "required": ["labels"]}
    opts = {"num_predict": 20 * len(paras) + 50, "temperature": 0, "num_ctx": 8192, "top_p": 0.9, "min_p": 0.05, **ARMS[arm]}
    body = {"model": g.MODEL, "system": "You label paragraphs of fiction precisely, one label per paragraph.",
            "prompt": pacing_prompt(paras, brief), "stream": False, "think": False, "format": schema, "keep_alive": "30m", "options": opts}
    req = urllib.request.Request(g.HOST + "/api/generate", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=600))
    labels = json.loads(r["response"])["labels"]
    return [i + 1 for i, l in enumerate(labels) if l == "FILLER"]


rows, t0 = [], time.time()
for idx in sorted(g.corpus):
    s = g.corpus[idx]
    for variant in ["control", "padding"]:
        draft = g.DEFECTS[variant][1](s["draft"], s["storyBible"])
        paras = paragraphs(draft)
        planted = [i + 1 for i, p in enumerate(paras) if p in g.FILLERS]
        for arm in ARMS:
            flagged = call(paras, s["sceneBrief"], arm)
            rows.append({"scene": idx, "variant": variant, "arm": arm, "paras": len(paras), "planted": planted, "flagged": flagged})
            print(idx, variant, arm, len(paras), "planted", planted, "flagged", flagged, flush=True)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w"), indent=1)
print("done", round((time.time() - t0) / 60, 1), "min")
