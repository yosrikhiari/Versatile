"""
Pacing by two votes: forward order and reversed order, filler only if both agree.

Borderline paragraphs flipped under small formatting changes (§19: 0 flags via
/api/chat, 3 via /api/generate on the same clean scene) while planted filler
did not. Asking twice with the paragraphs reversed — which also cancels any
drift down the list — and keeping only the agreement is DeepSeek-GRM-style
voting at k=2.

Production request shape (/api/generate, repeat_penalty 1). 30 scenes x
{control, padding, told_faithful}.

    python tools/judge-probes/pacing_vote_probe.py reports/live/judge-probes/pacing-vote.json
"""
import json, re, sys, time, urllib.request, importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("p", os.path.join(HERE, "pacing_penalty_probe.py"))
# reuse prompt + request from the penalty probe without running it
src = open(os.path.join(HERE, "pacing_penalty_probe.py"), encoding="utf-8").read().split("rows, t0 = [], time.time()")[0]
ns = {"__file__": os.path.join(HERE, "pacing_penalty_probe.py")}
sys_argv = sys.argv
sys.argv = [sys.argv[0], "unused"]
exec(src, ns)
sys.argv = sys_argv
g, paragraphs, call = ns["g"], ns["paragraphs"], ns["call"]
FAITHFUL = json.load(open("reports/live/judge-probes/told-faithful.json", encoding="utf-8"))
OUT = sys.argv[1]


def told_faithful(prose, idx):
    sums, k, out = FAITHFUL.get(str(idx)) or [], 0, []
    for i, p in enumerate(re.split(r"\n\s*\n", prose)):
        if i % 2 == 0 and len(p) > 200 and k < len(sums):
            out.append(sums[k]); k += 1
        else:
            out.append(p)
    return "\n\n".join(out)


def call_retry(paras, brief):
    # one retry: an empty response once aborted a 30-scene run at scene 13
    try:
        return call(paras, brief, "nopen")
    except (json.JSONDecodeError, KeyError):
        time.sleep(3)
        return call(paras, brief, "nopen")


# resumable: rows are saved after every scene, and a rerun skips what exists
rows = json.load(open(OUT))["rows"] if os.path.exists(OUT) else []
done = {(r["scene"], r["variant"]) for r in rows}
t0 = time.time()
for idx in sorted(g.corpus):
    s = g.corpus[idx]
    for v in ["control", "padding", "told_faithful"]:
        if (idx, v) in done:
            continue
        draft = told_faithful(s["draft"], idx) if v == "told_faithful" else g.DEFECTS[v][1](s["draft"], s["storyBible"])
        paras = paragraphs(draft)
        fwd = call_retry(paras, s["sceneBrief"])
        rev_raw = call_retry(list(reversed(paras)), s["sceneBrief"])
        rev = sorted(len(paras) + 1 - i for i in rev_raw)
        both = sorted(set(fwd) & set(rev))
        planted = [i + 1 for i, p in enumerate(paras) if p in g.FILLERS]
        rows.append({"scene": idx, "variant": v, "paras": len(paras), "planted": planted, "fwd": fwd, "rev": rev, "both": both})
        print(idx, v, "planted", planted, "fwd", fwd, "rev", rev, "both", both, flush=True)
        json.dump({"rows": rows}, open(OUT, "w"), indent=1)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w"), indent=1)
print("done", round((time.time() - t0) / 60, 1), "min")
