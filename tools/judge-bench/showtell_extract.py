"""
Show-tell candidate: extract, then check (§31).

The production show_tell judge scores LLM house style high and Chekhov 3/10
(§30), and caught 0/28 of the reviewers' problems (§29): it is a taste
question asked of a small model. Research (§27) says small models extract
reliably and judge taste unreliably. So:

  1. extract: numbered sentences; the model lists the ones that NAME or
     EXPLAIN a feeling or thought, or SUMMARISE an important moment,
     instead of letting the reader see it.
  2. check each: is that feeling or moment ALSO shown nearby (the two
     sentences either side) by action, gesture, dialogue or concrete
     detail? Only "no" counts.
  3. score: unshown-telling sentences per 100 sentences. The pass mark is
     chosen on the odd half of the bench and tested on the even half and
     the masterpieces.

    python tools/judge-bench/showtell_extract.py
"""
import json
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import gen, sentences  # noqa: E402


def extract(sents):
    listing = "\n".join(f"[{i + 1}] {s}" for i, s in enumerate(sents))
    schema = {"type": "object", "properties": {"tells": {"type": "array", "items": {"type": "integer"},
                                                         "maxItems": 40}}, "required": ["tells"]}
    r = gen("You are a line editor who marks telling in fiction.",
            f"""Below are the numbered sentences of one scene.

List the sentences that TELL the reader something instead of letting them see it:
- a sentence that names or explains a feeling or state of mind ("she felt the strain", "fear gripped him", "the weight of it pressed on her chest", "something told him this was everything")
- a sentence that reports a realisation or thought as a summary ("she realized she was being tested", "he knew it was over")
- a sentence that summarises an important moment the scene could have played out ("they argued for an hour and settled nothing")
Do NOT list sentences of action, speech, gesture or concrete sensory detail, even if they carry emotion. Do NOT list brief transitions.

{listing}

Return JSON: {{ "tells": [ sentence numbers ] }}""", schema, 600)
    return sorted({i for i in r.get("tells", []) if isinstance(i, int) and 1 <= i <= len(sents)})


def shown_nearby(sents, i):
    lo, hi = max(0, i - 3), min(len(sents), i + 2)
    context = "\n".join(("-> " if k == i - 1 else "   ") + sents[k] for k in range(lo, hi))
    r = gen("You judge one narrow question about a passage of fiction.",
            f"""In this passage, the marked sentence (->) tells the reader something.

{context}

Is what it tells ALSO shown in the other sentences here, through action, gesture, dialogue or concrete detail, so a reader would get it even without the marked sentence?

Return JSON: {{ "shown": true or false }}""",
            {"type": "object", "properties": {"shown": {"type": "boolean"}}, "required": ["shown"]}, 30)
    return r.get("shown") is True


def judge(scene):
    try:
        sents = sentences(scene["prose"])
        tells = extract(sents)
        unshown = [i for i in tells if not shown_nearby(sents, i)]
        rate = 100 * len(unshown) / max(1, len(sents))
        return {"fail": False, "rate": round(rate, 2), "unshown": unshown, "tells": tells, "sentences": len(sents)}
    except (json.JSONDecodeError, KeyError) as e:
        return {"fail": False, "rate": None, "error": str(e)[:200]}


def score_at(threshold):
    """Re-score the cached verdicts at a pass mark: fail when the unshown-telling
    rate is at or above it. Cached calls are reused, so this is free."""
    def j(scene):
        v = judge(scene)
        v["fail"] = v.get("rate") is not None and v["rate"] >= threshold
        return v
    return j


if __name__ == "__main__" and len(sys.argv) == 1:
    # First pass computes and caches every scene's rate (fail is recomputed below).
    bench.run("showtell-extract-v1", "show_tell", judge)


def run_ordered():
    """Most informative first (§31): the masterpieces (a candidate that fails
    them is out), then current-pipeline scenes, then the old salt-corpus, where
    the labels are confounded with the source. Shares the bench cache."""
    import os
    problem, fine, masters = bench.load("show_tell")
    path = f"{bench.CACHE}/showtell-extract-v1.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    old = lambda s: s["id"].startswith("salt-corpus")  # noqa: E731
    order = masters + [s for s in problem + fine if not old(s)] + [s for s in problem + fine if old(s)]
    for s in order:
        if s["id"] not in cache:
            cache[s["id"]] = judge(s)
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {s['id']:22s} rate={cache[s['id']].get('rate')}", flush=True)


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "ordered":
    run_ordered()
