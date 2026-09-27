"""
Plan step 5 (§35): the within-scene checker (W4b) on natural contradictions.

ConStory-Bench (arXiv 2603.05890, MIT; GPT-4o's 2,000 stories and the
ConStory-Checker findings, reports/live/constory/gpt4o_1120.csv, fetched with
the user's OK). Stories run about 1,300 words, scene length, so W4b reads each
whole. Labels are an LLM checker's (o4-mini), not human: disagreements are
hand-checked, not trusted.

  positives  English stories with at least one finding in a state category
             (memory, knowledge, appearance, quantity, name, absolute time,
             duration, simultaneity, geography) whose two quotes are both found
             verbatim
  negatives  English stories with no finding in any of the 19 categories
  located    a W4b flag whose two sentences overlap the finding's two quotes

    python -X utf8 tools/judge-bench/constory_within.py [N]
"""
import csv
import json
import os
import random
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import alnum  # noqa: E402
import within_scene as ws  # noqa: E402

csv.field_size_limit(10 ** 9)
SRC = "reports/live/constory/gpt4o_1120.csv"
OUT = f"{bench.CACHE}/constory-within.json"
STATE = ["characterization_memory_contradictions", "characterization_knowledge_contradictions",
         "factual_detail_appearance_mismatches", "factual_detail_quantitative_mismatches",
         "factual_detail_nomenclature_confusions", "timeline_plot_absolute_time_contradictions",
         "timeline_plot_duration_timeline_contradictions", "timeline_plot_simultaneity_contradictions",
         "world_building_geographical_contradictions"]


def flat(v):
    """A quote field can be a string, a list of strings, or a list of objects
    with their own quote field; the first quote is enough to locate it."""
    if isinstance(v, str):
        return v
    if isinstance(v, list) and v:
        return flat(v[0])
    if isinstance(v, dict):
        return flat(v.get("exact_quote") or v.get("quote") or v.get("text") or "")
    return ""


def findings(row, cols):
    out = []
    for c in cols:
        try:
            arr = json.loads(row.get(c) or "[]") or []
        except ValueError:
            arr = []
        for e in arr if isinstance(arr, list) else []:
            if not isinstance(e, dict):
                continue
            q = e.get("exact_quote") or ""
            p = e.get("contradiction_pair") or ""
            q, p = flat(q), flat(p)
            out.append({"category": c, "quote": q, "pair": p})
    return out


def sample(n):
    rows = [r for r in csv.DictReader(open(SRC, encoding="utf-8")) if r["language"] == "en"]
    allcols = [c for c in rows[0] if c.split("_")[0] in ("characterization", "factual", "narrative", "timeline", "world")]
    pos, neg = [], []
    for r in rows:
        story = r["gpt4o1120_story"]
        body = alnum(story)
        st = [f for f in findings(r, STATE) if len(alnum(f["quote"])) > 10 and len(alnum(f["pair"])) > 10
              and alnum(f["quote"])[:60] in body and alnum(f["pair"])[:60] in body]
        if st:
            pos.append((r["id"], story, st))
        elif not findings(r, allcols):
            neg.append((r["id"], story, []))
    rng = random.Random(20260926)
    return rng.sample(pos, min(n, len(pos))), rng.sample(neg, min(n, len(neg))), len(pos), len(neg)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    pos, neg, npos, nneg = sample(n)
    print(f"pool: {npos} stories with a state finding, {nneg} with no finding; sampled {len(pos)} + {len(neg)}")
    cache = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    for kind, items in (("pos", pos), ("neg", neg)):
        for sid, story, fs in items:
            key = f"{kind}-{sid}"
            if key in cache:
                continue
            scene = {"id": key, "prose": story}
            try:
                v = ws.w4(scene)
                ev = [e for e in v["evidence"] if ws.confirm_pair_v2(e["earlier"], e["later"])]
            except (json.JSONDecodeError, KeyError) as e:
                v, ev = {"error": str(e)[:200]}, []

            def hit(e):
                a, b = alnum(e["earlier"]), alnum(e["later"])
                return any((alnum(f["quote"])[:40] in a + b) or (alnum(f["pair"])[:40] in a + b) for f in fs)
            cache[key] = {"kind": kind, "flagged": bool(ev), "located": any(hit(e) for e in ev),
                          "evidence": ev, "findings": fs, "error": v.get("error")}
            json.dump(cache, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {key:10s} flagged={cache[key]['flagged']} located={cache[key]['located']}", flush=True)
    P = [v for v in cache.values() if v["kind"] == "pos"]
    N = [v for v in cache.values() if v["kind"] == "neg"]
    for name, k in (("flagged", "flagged"), ("located", "located")):
        a, b = sum(v[k] for v in P), sum(v[k] for v in N)
        print(f"{name}: positives {a}/{len(P)} {bench.wilson(a, len(P))}; negatives {b}/{len(N)} {bench.wilson(b, len(N))}")


if __name__ == "__main__":
    main()
