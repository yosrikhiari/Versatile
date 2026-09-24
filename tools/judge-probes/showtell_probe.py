"""
Show/tell by paragraph, re-tested under JUDGE_SAMPLING.

§19 rejected per-paragraph DRAMATISED/REPORTED labels: 84-88% of clean
paragraphs came back REPORTED. That probe ran through /api/chat with default
sampling, before §20 found that a repeat penalty drags label lists toward the
less-repeated label. Here the request replicates production (/api/generate,
repeat_penalty 1) over 30 scenes: clean, told_faithful (the telling defect that
keeps plot facts) and padding (filler, which should NOT read as telling).

    python tools/judge-probes/showtell_probe.py reports/live/judge-probes/showtell.json
"""
import json, re, sys, time, urllib.request, importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("g", os.path.join(HERE, "geval_probe_lib.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
OUT = sys.argv[1]
FAITHFUL = json.load(open("reports/live/judge-probes/told-faithful.json", encoding="utf-8"))


def told_faithful(prose, idx):
    sums, k, out = FAITHFUL.get(str(idx)) or [], 0, []
    for i, p in enumerate(re.split(r"\n\s*\n", prose)):
        if i % 2 == 0 and len(p) > 200 and k < len(sums):
            out.append(sums[k]); k += 1
        else:
            out.append(p)
    return "\n\n".join(out), set(sums)


def paragraphs(d):
    return [p.strip() for p in re.split(r"\n\s*\n", d) if p.strip()]


def call(paras):
    listing = "\n\n".join(f"[{i + 1}] {p}" for i, p in enumerate(paras))
    prompt = f"""For EACH numbered paragraph, decide: DRAMATISED — the moment is enacted through action, speech, or concrete sensory detail; or REPORTED — it summarises what happened or tells us what someone felt instead of enacting it.

There are {len(paras)} paragraphs. Return exactly {len(paras)} labels, in order.

{listing}

Return JSON: {{ "labels": [ ... ] }}"""
    schema = {"type": "object", "properties": {"labels": {"type": "array", "items": {"type": "string", "enum": ["DRAMATISED", "REPORTED"]}, "minItems": len(paras), "maxItems": len(paras)}}, "required": ["labels"]}
    body = {"model": g.MODEL, "system": "You label paragraphs of fiction precisely, one label per paragraph.", "prompt": prompt,
            "stream": False, "think": False, "format": schema, "keep_alive": "30m",
            "options": {"num_predict": 20 * len(paras) + 50, "temperature": 0, "num_ctx": 8192, "top_p": 0.9, "min_p": 0.05, "repeat_penalty": 1}}
    req = urllib.request.Request(g.HOST + "/api/generate", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    labels = json.loads(json.load(urllib.request.urlopen(req, timeout=600))["response"])["labels"]
    return [i + 1 for i, l in enumerate(labels) if l == "REPORTED"]


rows, t0 = [], time.time()
for idx in sorted(g.corpus):
    s = g.corpus[idx]
    variants = {"control": (s["draft"], set()), "told_faithful": told_faithful(s["draft"], idx),
                "padding": (g.DEFECTS["padding"][1](s["draft"], s["storyBible"]), set(g.FILLERS))}
    for v, (draft, planted_set) in variants.items():
        paras = paragraphs(draft)
        planted = [i + 1 for i, p in enumerate(paras) if p in planted_set]
        rep = call(paras)
        rows.append({"scene": idx, "variant": v, "paras": len(paras), "planted": planted, "reported": rep})
        print(idx, v, len(paras), "planted", planted, "reported", rep, flush=True)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w"), indent=1)
print("done", round((time.time() - t0) / 60, 1), "min")
