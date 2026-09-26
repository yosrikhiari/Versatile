"""
Show-tell at the key moment (§32). Counting telling failed (§31: masterpieces
tell more than LLM prose). The reviewers' complaint is telling AT THE MOMENT
THAT MATTERS, so:

  1. locate: given the brief's "what changes", the model quotes the sentences
     where the change happens; code keeps only verbatim quotes.
  2. tempo: how much story time passes in that window (minutes), after
     Underwood's GPT-4 method (r = .68 with human coders; untested at 8B);
     words per story-minute separates a moment played out from one summarised.
  3. shown: is the change shown through action, speech or physical detail, or
     reported/explained? (one yes/no, on the window plus two sentences around)

The masterpieces carry no "what changes"; one line each is written below from
the passages (MASTER_CHANGES), kept out of the shared pool.

    python -X utf8 tools/judge-bench/showtell_moment.py
"""
import json
import os
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import alnum, gen, sentences  # noqa: E402

MASTER_CHANGES = {
    "chekhov-lady-01": "Gurov, idly watching the new lady, is suddenly taken by the thought of an affair with her.",
    "chekhov-family-01": "Zhilin's bad mood turns breakfast sour as he picks on his wife and son.",
    "wharton-frome-01": "Ethan reaches the church and watches Mattie at the dance through the window.",
    "wharton-frome-02": "Walking home, Ethan and Mattie grow close, until the house and the thought of Zeena return.",
    "joyce-eveline-01": "Eveline, about to leave home, weighs her hard life and finds it not wholly undesirable.",
    "joyce-araby-01": "The boy becomes secretly consumed by Mangan's sister, following her every morning.",
    "mansfield-party-01": "Laura, sent to direct the workmen, is charmed by them and forgets her awkward manner.",
    "mansfield-party-02": "News of a workman's death reaches the house and Laura wants the party stopped.",
    "doyle-scandal-01": "Watson passes Holmes's window and sees from his pacing that he is at work again.",
    "doyle-league-01": "Holmes introduces Jabez Wilson and invites him to begin his strange story.",
    "wells-time-01": "The Time Traveller argues his dinner guests into doubting that time is unlike space.",
    "wells-time-02": "The Traveller reaches the dying earth and witnesses the eclipse turn the world black.",
}

QUOTE_SCHEMA = {"type": "object", "properties": {"sentences": {"type": "array", "maxItems": 6,
                "items": {"type": "integer"}}}, "required": ["sentences"]}


def judge(scene):
    change = MASTER_CHANGES.get(scene["id"]) or scene["brief"].get("whatChanges") or ""
    if not change.strip():
        return {"judged": False}
    sents = sentences(scene["prose"])
    listing = "\n".join(f"[{i + 1}] {s}" for i, s in enumerate(sents))
    r = gen("You find the turning point of a scene of fiction.",
            f"""WHAT CHANGES IN THIS SCENE: {change}

{listing}

Which sentences (at most 6, consecutive if possible) are where this change actually happens on the page?

Return JSON: {{ "sentences": [ numbers ] }}""", QUOTE_SCHEMA, 100)
    idx = sorted({i for i in r.get("sentences", []) if isinstance(i, int) and 1 <= i <= len(sents)})
    if not idx:
        return {"judged": False, "error": "no window"}
    lo, hi = idx[0], min(idx[-1], idx[0] + 7)
    window = " ".join(sents[lo - 1:hi])
    words = len(window.split())
    t = gen("You estimate how much time passes in a passage of fiction.",
            f"""PASSAGE: {window}

How much time passes in the story during this passage, from its first event to its last? Think about what actually happens, then give your best estimate in minutes (a few seconds = 0.1; an afternoon = 240; several days = 4000).

Return JSON: {{ "minutes": number }}""",
            {"type": "object", "properties": {"minutes": {"type": "number"}}, "required": ["minutes"]}, 40)
    minutes = t.get("minutes")
    ctx = " ".join(sents[max(0, lo - 3):min(len(sents), hi + 2)])
    s = gen("You judge one narrow question about a passage of fiction.",
            f"""THE CHANGE: {change}
PASSAGE: {ctx}

Is this change SHOWN to the reader, through what characters do, say, or physically experience in the moment, rather than reported or explained by the narrator in summary?

Return JSON: {{ "shown": true or false }}""",
            {"type": "object", "properties": {"shown": {"type": "boolean"}}, "required": ["shown"]}, 20)
    wpm = words / max(0.1, float(minutes)) if isinstance(minutes, (int, float)) else None
    return {"judged": True, "window": [lo, hi], "words": words, "minutes": minutes,
            "wordsPerMinute": round(wpm, 2) if wpm is not None else None, "shown": s.get("shown") is True,
            "fail": False}


def main():
    problem, fine, masters = bench.load("show_tell")
    old = lambda s: s["id"].startswith("salt-corpus")  # noqa: E731
    order = [(s, "master") for s in masters] + [(s, "problem") for s in problem if not old(s)] + \
            [(s, "fine") for s in fine if not old(s)] + [(s, "problem") for s in problem if old(s)] + \
            [(s, "fine") for s in fine if old(s)]
    path = f"{bench.CACHE}/showtell-moment-v1.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for scene, lab in order:
        if scene["id"] in cache:
            continue
        try:
            cache[scene["id"]] = judge(scene)
        except (json.JSONDecodeError, KeyError, ValueError, TypeError) as e:
            cache[scene["id"]] = {"judged": False, "error": str(e)[:200]}
        cache[scene["id"]].update(label=lab, current=not old(scene))
        json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        v = cache[scene["id"]]
        print(f"  {scene['id']:22s} {lab:7s} shown={v.get('shown')} wpm={v.get('wordsPerMinute')} min={v.get('minutes')}", flush=True)


if __name__ == "__main__":
    main()
