"""
Input isolation: each dimension's judge sees only the evidence that dimension
depends on, so a flaw of one kind cannot leak into another dimension's score.

  voice      -> dialogue lines only (+ the bible's character descriptions)
  show_tell  -> numbered paragraphs, one label each: DRAMATISED / REPORTED
  pacing     -> numbered paragraphs + the brief, one label each: ADVANCES / FILLER

Measured as a response matrix: for every (defect, instrument) the change
against the same scene's clean version. The ideal is a diagonal — each
instrument moves on its own defect and nothing else.
"""
import json, math, re, sys, time, urllib.request, importlib.util

SP = sys.argv[1]
spec = importlib.util.spec_from_file_location("g", SP + "/geval_probe_lib.py")
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

DLG = re.compile(r'[“"]([^“”"]{2,})[”"]')


def paragraphs(draft):
    return [p.strip() for p in re.split(r"\n\s*\n", draft) if p.strip()]


def chat(system, prompt, schema, logprobs=False, num_predict=600):
    body = {"model": g.MODEL, "stream": False, "think": False, "format": schema, "keep_alive": "30m",
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": num_predict},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
    if logprobs:
        body.update({"logprobs": True, "top_logprobs": 10})
    req = urllib.request.Request(g.HOST + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=600))


def expected_digit(r):
    for t in r.get("logprobs") or []:
        if t["token"].strip()[:1].isdigit():
            dist = {}
            for alt in t.get("top_logprobs", []):
                a = alt["token"].strip()
                if a.isdigit() and 1 <= int(a) <= 10:
                    dist[int(a)] = dist.get(int(a), 0) + math.exp(alt["logprob"])
            z = sum(dist.values())
            return sum(k * v for k, v in dist.items()) / z if z else None
    return None


VOICE_SCHEMA = {"type": "object", "properties": {"score": {"type": "integer", "minimum": 1, "maximum": 10}}, "required": ["score"]}


def voice(s, draft):
    lines = [m.group(1).strip() for m in DLG.finditer(draft)]
    if len(lines) < 2:
        return None, {"lines": len(lines)}
    listing = "\n".join(f"{i + 1}. \"{l}\"" for i, l in enumerate(lines))
    rub = "\n".join(f"  {k} = {v}" for k, v in g.RUBRIC["voice"].items())
    prompt = f"""Below are ONLY the lines of dialogue from a scene, in order, with the narration removed.
Characters present: {', '.join(s['sceneBrief']['charactersPresent'])}

CHARACTER DESCRIPTIONS:
{s['storyBible']}

DIALOGUE:
{listing}

Judge VOICE only: do these lines sound like different, specific people, as the descriptions suggest — or could any character have said any line?

SCALE:
{rub}

Return JSON: {{ "score": number }}"""
    r = chat("You judge dialogue voice from dialogue alone, and you are willing to mark it low.", prompt, VOICE_SCHEMA, logprobs=True, num_predict=20)
    distinct = len({re.sub(r'\W+', ' ', l.lower()).strip() for l in lines}) / len(lines)
    return expected_digit(r), {"lines": len(lines), "distinctRatio": round(distinct, 3), "int": json.loads(r["message"]["content"])["score"]}


def labels_call(kind, s, draft):
    paras = paragraphs(draft)
    listing = "\n\n".join(f"[{i + 1}] {p}" for i, p in enumerate(paras))
    b = s["sceneBrief"]
    if kind == "show_tell":
        opts, bad = ["DRAMATISED", "REPORTED"], "REPORTED"
        ask = ("For EACH numbered paragraph, decide: DRAMATISED — the moment is enacted through action, speech, concrete sensory detail; "
               "or REPORTED — it summarises what happened or tells us what someone felt instead of enacting it.")
        ctx = ""
    else:
        opts, bad = ["ADVANCES", "FILLER"], "FILLER"
        ask = ("For EACH numbered paragraph, decide: ADVANCES — it moves the plot, reveals character, or raises tension toward the scene's goal; "
               "or FILLER — it could be deleted without losing anything the scene needs.")
        ctx = f"SCENE GOAL: {b['emotionalGoal']}\nWHAT CHANGES: {b.get('whatChanges', '')}\n\n"
    schema = {"type": "object", "properties": {"labels": {"type": "array", "items": {"type": "string", "enum": opts}, "minItems": len(paras), "maxItems": len(paras)}}, "required": ["labels"]}
    prompt = f"""{ctx}{ask}

There are {len(paras)} paragraphs. Return exactly {len(paras)} labels, in order.

{listing}

Return JSON: {{ "labels": [ ... ] }}"""
    r = chat("You label paragraphs of fiction precisely, one label per paragraph.", prompt, schema, num_predict=20 * len(paras) + 50)
    labs = json.loads(r["message"]["content"])["labels"]
    frac = sum(1 for l in labs if l == bad) / max(1, len(labs))
    return frac, {"paras": len(paras), "labels": len(labs), "bad": [i + 1 for i, l in enumerate(labs) if l == bad]}


rows, t0 = [], time.time()
for idx in g.SCENES:
    s = g.corpus[idx]
    for dname, (target, fn) in g.DEFECTS.items():
        draft = fn(s["draft"], s["storyBible"])
        v, vinfo = voice(s, draft)
        st_, sinfo = labels_call("show_tell", s, draft)
        pc, pinfo = labels_call("pacing", s, draft)
        row = {"scene": idx, "defect": dname, "target": target, "voice": v, "voiceInfo": vinfo,
               "show_tell_reported": st_, "stInfo": sinfo, "pacing_filler": pc, "pcInfo": pinfo}
        rows.append(row)
        print(idx, dname, "voice", None if v is None else round(v, 2), vinfo, "| reported", round(st_, 2), sinfo["bad"], "| filler", round(pc, 2), pinfo["bad"], flush=True)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(SP + "/isolate.json", "w", encoding="utf-8"), indent=1)
print("done", round((time.time() - t0) / 60, 1), "min")
