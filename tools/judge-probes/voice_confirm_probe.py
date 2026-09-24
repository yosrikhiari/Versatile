"""
Voice: must a failure be reproduced before it counts?

The isolated voice judge (dialogue only, temperature 0.3 like production)
scored clean scene 10 at 7 in one run and 5 in another on identical dialogue.
Pacing already only fails when a second, reversed pass confirms (§21). Here:
per scene, three voice calls on the dialogue in order and one on it reversed,
for clean and flattened dialogue. Question: does "fail only if the forward
AND the reversed pass are both under 7" keep flattened dialogue failing and
stop borderline clean scenes from failing?

    python tools/judge-probes/voice_confirm_probe.py reports/live/judge-probes/voice-confirm.json
"""
import json, re, sys, time, urllib.request, importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("g", os.path.join(HERE, "geval_probe_lib.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
OUT = sys.argv[1]
DLG = re.compile(r'[“"]([^“”"]{2,})[”"]')
RUB = "\n".join(f"  {k} = {v}" for k, v in g.RUBRIC["voice"].items())
SCHEMA = {"type": "object", "properties": {"score": {"type": "number"}, "issue": {"type": "string"}}, "required": ["score"]}


def voice(lines, s):
    listing = "\n".join(f'{i + 1}. "{l}"' for i, l in enumerate(lines))
    prompt = f"""Below are ONLY the lines of dialogue from a scene, in order, with the narration removed.
Characters present: {', '.join(s['sceneBrief']['charactersPresent'])}

CHARACTER DESCRIPTIONS:
{s['storyBible']}

DIALOGUE:
{listing}

Judge VOICE only: do these lines sound like different, specific people, as the descriptions suggest — or could any character have said any line?

SCORING SCALE — use these anchors and nothing else:
voice:
{RUB}

Return JSON: {{ "score": number, "issue": "one sentence, or omit if none" }}"""
    body = {"model": g.MODEL, "system": "You judge dialogue voice from dialogue alone, and you are willing to mark it low.", "prompt": prompt,
            "stream": False, "think": False, "format": SCHEMA, "keep_alive": "30m",
            "options": {"num_predict": 300, "temperature": 0.3, "num_ctx": 8192, "top_p": 0.9, "min_p": 0.05, "repeat_penalty": 1}}
    req = urllib.request.Request(g.HOST + "/api/generate", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.loads(json.load(urllib.request.urlopen(req, timeout=600))["response"])["score"]


rows, t0 = [], time.time()
for idx in sorted(g.corpus):
    s = g.corpus[idx]
    for v in ["control", "voice_flatten"]:
        draft = g.DEFECTS[v][1](s["draft"], s["storyBible"])
        lines = [m.group(1).strip() for m in DLG.finditer(draft)]
        if len(lines) < 6:
            continue
        fwd = [voice(lines, s) for _ in range(3)]
        rev = voice(list(reversed(lines)), s)
        rows.append({"scene": idx, "variant": v, "lines": len(lines), "fwd": fwd, "rev": rev})
        print(idx, v, len(lines), "fwd", fwd, "rev", rev, flush=True)
        json.dump({"rows": rows}, open(OUT, "w"), indent=1)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w"), indent=1)
print("done", round((time.time() - t0) / 60, 1), "min")
