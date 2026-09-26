"""
Contradictions inside one scene (§32). Two designs on the same bench.

  W1 (one pass, quoted): numbered sentences in; the model lists pairs where a
     LATER sentence cannot be true given an EARLIER one, as the scene tells it;
     code checks both numbers exist and are in order; each pair is confirmed
     with only those two sentences and the text between them.
  W2 (running state): the scene in chunks of 3 paragraphs; a short state list
     (alive/dead, present/absent, open/closed, known/unknown, where) is carried
     forward; each chunk is checked against the state so far, quoted, then
     confirmed the same way.

Bench: the 8 reviewer scene-internal problems (positives), continuity-fine
scenes (false alarms), the 12 masterpieces (false alarms).

    python -X utf8 tools/judge-bench/within_scene.py w1|w2
"""
import json
import os
import re
import sys

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import gen, sentences  # noqa: E402

POSITIVES = ["pool-harbour-08", "salt-corpus-06", "gate-off-run-02", "pool-orchard-03",
             "salt-corpus-05", "salt-corpus-28", "gate-off-run-03", "repair-run-03"]

RULES = """Things may change during a scene: a man can die, a door can be opened. But once the scene has told something, a later sentence cannot quietly undo it: the dead do not blink, cough or act; a closed laptop has no glowing screen; a place "no one had visited in days" has nobody asleep in it; someone who "hadn't known" cannot have expected it. Memories, dreams, lies, guesses, figures of speech and a character's mistaken belief are NOT contradictions."""

PAIRS_SCHEMA = {"type": "object", "properties": {"pairs": {"type": "array", "maxItems": 8, "items": {
    "type": "object", "properties": {"earlier": {"type": "integer"}, "later": {"type": "integer"},
                                     "why": {"type": "string"}},
    "required": ["earlier", "later", "why"]}}}, "required": ["pairs"]}


def confirm_pair(sents, a, b):
    between = sents[a:b - 1]
    gap = (" [...] ".join([between[0], between[-1]]) if len(between) > 2 else " ".join(between)) if between else ""
    r = gen("You check one scene of fiction for a contradiction between two of its sentences.",
            f"""EARLIER SENTENCE: {sents[a - 1]}
{('TEXT BETWEEN (abridged): ' + gap) if gap else ''}
LATER SENTENCE: {sents[b - 1]}

{RULES}
Read the earlier sentence as true. Does the later sentence, as the scene tells it, require the earlier one to be false?

Return JSON: {{ "contradicts": true or false }}""",
            {"type": "object", "properties": {"contradicts": {"type": "boolean"}}, "required": ["contradicts"]}, 30)
    return r.get("contradicts") is True


def w1(scene):
    sents = sentences(scene["prose"])
    listing = "\n".join(f"[{i + 1}] {s}" for i, s in enumerate(sents))
    r = gen("You are a continuity editor reading one scene of fiction.",
            f"""The numbered sentences of one scene:

{listing}

Find places where a LATER sentence cannot be true given an EARLIER sentence of this same scene.
{RULES}
List only real contradictions, with the two sentence numbers. Most scenes have none; then return an empty list.

Return JSON: {{ "pairs": [ {{ "earlier": n, "later": m, "why": "..." }} ] }}""", PAIRS_SCHEMA, 800)
    out = []
    for p in r.get("pairs", []):
        a, b = p.get("earlier"), p.get("later")
        if not (isinstance(a, int) and isinstance(b, int) and 1 <= a < b <= len(sents)):
            continue
        if confirm_pair(sents, a, b):
            out.append({"earlier": sents[a - 1], "later": sents[b - 1], "why": p.get("why", "")})
    return {"fail": bool(out), "evidence": out, "proposed": len(r.get("pairs", []))}


STATE_SCHEMA = {"type": "object", "properties": {
    "conflicts": {"type": "array", "maxItems": 5, "items": {"type": "object", "properties": {
        "sentence": {"type": "integer"}, "state": {"type": "integer"}}, "required": ["sentence", "state"]}},
    "newState": {"type": "array", "maxItems": 12, "items": {"type": "string"}}},
    "required": ["conflicts", "newState"]}


def w2(scene):
    paras = [p for p in scene["prose"].split("\n\n") if p.strip()]
    state, out = [], []  # state: (text, sentence-it-came-from)
    for k in range(0, len(paras), 3):
        chunk = sentences(" ".join(paras[k:k + 3]))
        st = "\n".join(f"[{i + 1}] {t}" for i, (t, _) in enumerate(state)) or "(nothing yet)"
        r = gen("You are a continuity editor reading one scene of fiction in order.",
                f"""WHAT THE SCENE HAS ESTABLISHED SO FAR:
{st}

NEXT SENTENCES:
{chr(10).join(f"({i + 1}) {s}" for i, s in enumerate(chunk))}

{RULES}
1. "conflicts": each next sentence (number in round brackets) that cannot be true given an established item (number in square brackets). Usually none.
2. "newState": up to 12 short facts these sentences establish that later text could contradict: who is alive, dead, unconscious; who is present or absent; what is open, closed, lit, dark, broken; who knows or does not know something; where the scene is. Plain words, one fact each.

Return JSON: {{ "conflicts": [ {{ "sentence": n, "state": m }} ], "newState": [ "..." ] }}""", STATE_SCHEMA, 900)
        for c in r.get("conflicts", []):
            i, j = c.get("sentence"), c.get("state")
            if isinstance(i, int) and isinstance(j, int) and 1 <= i <= len(chunk) and 1 <= j <= len(state):
                src = state[j - 1][1]
                if confirm_pair([src, chunk[i - 1]], 1, 2):
                    out.append({"earlier": src, "later": chunk[i - 1], "state": state[j - 1][0]})
        for t in r.get("newState", [])[:12]:
            if isinstance(t, str) and t.strip():
                state.append((t.strip(), " ".join(paras[k:k + 3])[:300]))
        state = state[-30:]
    return {"fail": bool(out), "evidence": out}


CATEGORIES = {
    "body": "whether each person is alive, dead, dying, conscious, unconscious, injured, asleep, or what their body is doing",
    "object": "the state of objects and places: open or closed, on or off, lit or dark, empty or full, broken or whole",
    "presence": "who is present or absent, who has or has not been somewhere, and how often or how recently",
    "knowledge": "who knows, expected, or did not know something; what has or has not happened before",
}
QUOTES_SCHEMA = {"type": "object", "properties": {"quotes": {"type": "array", "maxItems": 12, "items": {
    "type": "object", "properties": {"about": {"type": "string"}, "quote": {"type": "string"}},
    "required": ["about", "quote"]}}}, "required": ["quotes"]}


def w3(scene):
    """ConStory-style (arXiv 2603.05890): one scan per category for VERBATIM
    quotes, code-verified; then clashes looked for among those quotes only;
    each flagged pair confirmed as in W1."""
    from continuity_claims import alnum
    prose = scene["prose"]
    body = alnum(prose)
    sents = sentences(prose)
    out = []
    for cat, what in CATEGORIES.items():
        r = gen("You collect evidence from one scene of fiction, quoting exactly.",
                f"""SCENE:
{prose}

Quote, in the order they appear, the short phrases (copied exactly, a few words to one sentence) that state {what}. Skip memories, dreams, similes and figures of speech. "about" names who or what the phrase is about.

Return JSON: {{ "quotes": [ {{ "about": "...", "quote": "..." }} ] }}""", QUOTES_SCHEMA, 900)
        quotes = []
        for q in r.get("quotes", []):
            k = alnum(q.get("quote", ""))
            if len(k) >= 8 and k in body:
                pos = body.index(k)
                quotes.append((pos, q.get("about", ""), q["quote"]))
        quotes.sort()
        if len(quotes) < 2:
            continue
        listing = "\n".join(f"[{i + 1}] ({a}) {t}" for i, (_, a, t) in enumerate(quotes))
        r2 = gen("You are a continuity editor reading one scene of fiction.",
                 f"""Phrases from one scene, in the order the scene tells them:
{listing}

{RULES}
Which pairs cannot both be true, with the later one read after the earlier one? Usually none.

Return JSON: {{ "pairs": [ {{ "earlier": n, "later": m, "why": "..." }} ] }}""", PAIRS_SCHEMA, 400)
        for p in r2.get("pairs", []):
            a, b = p.get("earlier"), p.get("later")
            if not (isinstance(a, int) and isinstance(b, int) and 1 <= a < b <= len(quotes)):
                continue
            ea, eb = quotes[a - 1][2], quotes[b - 1][2]
            ia = next((i for i, s in enumerate(sents) if alnum(ea) in alnum(s)), None)
            ib = next((i for i, s in enumerate(sents) if alnum(eb) in alnum(s)), None)
            if ia is None or ib is None or ia == ib:
                continue
            ia, ib = min(ia, ib), max(ia, ib)
            if confirm_pair(sents, ia + 1, ib + 1):
                out.append({"category": cat, "earlier": sents[ia], "later": sents[ib], "why": p.get("why", "")})
    return {"fail": bool(out), "evidence": out}


CHUNK_SCHEMA = {"type": "object", "properties": {
    "quotes": {"type": "array", "maxItems": 8, "items": {"type": "object", "properties": {
        "about": {"type": "string"}, "quote": {"type": "string"}}, "required": ["about", "quote"]}},
    "selfContradicting": {"type": "array", "maxItems": 3, "items": {"type": "integer"}}},
    "required": ["quotes", "selfContradicting"]}


def w4(scene):
    """W3 collapsed on long scenes (one call over 1,000 words returned "dying"
    twelve times) and skipped a contradiction inside one sentence. W4 collects
    quotes chunk by chunk (3 paragraphs), 4+ words, verbatim, de-duplicated;
    one pair search over the collected quotes; plus self-contradicting single
    sentences. Every finding is confirmed."""
    from continuity_claims import alnum
    paras = [p for p in scene["prose"].split("\n\n") if p.strip()]
    sents = sentences(scene["prose"])
    keyed = [alnum(s) for s in sents]
    quotes, seen, out = [], set(), []
    for k in range(0, len(paras), 3):
        chunk = sentences("\n\n".join(paras[k:k + 3]))
        listing = "\n".join(f"[{i + 1}] {s}" for i, s in enumerate(chunk))
        r = gen("You collect evidence from part of a scene of fiction, quoting exactly.",
                f"""SENTENCES:
{listing}

1. "quotes": copy exactly (4 to 20 words each) the phrases that establish something later text could contradict: someone alive, dead, dying or unconscious; someone present, absent, or not there for some time; something open, closed, on, off, lit or dark; someone knowing, not knowing or expecting something; how often something has happened. Skip memories, dreams, similes. At most 8; "about" names who or what.
2. "selfContradicting": numbers of any single sentence above that contradicts itself (states two things that cannot both be true). Usually none.

Return JSON: {{ "quotes": [ {{ "about": "...", "quote": "..." }} ], "selfContradicting": [ numbers ] }}""", CHUNK_SCHEMA, 700)
        for q in r.get("quotes", []):
            kq = alnum(q.get("quote", ""))
            if len(q.get("quote", "").split()) < 4 or kq in seen:
                continue
            si = next((i for i, ks in enumerate(keyed) if kq and kq in ks), None)
            if si is None:
                continue
            seen.add(kq)
            quotes.append((si, q.get("about", ""), q["quote"]))
        for i in r.get("selfContradicting", []):
            if isinstance(i, int) and 1 <= i <= len(chunk):
                s = chunk[i - 1]
                c = gen("You check one sentence of fiction.",
                        f"""SENTENCE: {s}

Does this sentence, read literally, state two things that cannot both be true at the same moment (not a figure of speech, not a change over time within the sentence)?

Return JSON: {{ "contradicts": true or false }}""",
                        {"type": "object", "properties": {"contradicts": {"type": "boolean"}}, "required": ["contradicts"]}, 20)
                if c.get("contradicts") is True:
                    out.append({"earlier": s, "later": s, "why": "self-contradicting sentence"})
    quotes.sort()
    quotes = quotes[:40]
    if len(quotes) >= 2:
        listing = "\n".join(f"[{i + 1}] ({a}) {t}" for i, (_, a, t) in enumerate(quotes))
        r2 = gen("You are a continuity editor reading one scene of fiction.",
                 f"""Phrases from one scene, in the order the scene tells them:
{listing}

{RULES}
Which pairs cannot both be true, with the later one read after the earlier one? Usually none.

Return JSON: {{ "pairs": [ {{ "earlier": n, "later": m, "why": "..." }} ] }}""", PAIRS_SCHEMA, 1000)
        for p in r2.get("pairs", []):
            a, b = p.get("earlier"), p.get("later")
            if not (isinstance(a, int) and isinstance(b, int) and 1 <= a < b <= len(quotes)):
                continue
            ia, ib = quotes[a - 1][0], quotes[b - 1][0]
            if ia == ib:
                continue
            ia, ib = min(ia, ib), max(ia, ib)
            if confirm_pair(sents, ia + 1, ib + 1):
                out.append({"earlier": sents[ia], "later": sents[ib], "why": p.get("why", "")})
    return {"fail": bool(out), "evidence": out, "quotes": len(quotes)}


def run(name, judge):
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    cons = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/consensus.json", encoding="utf-8"))}
    fine = [s for s, r in cons.items() if r["dims"]["continuity"] == "fine"]
    masters = json.load(open(f"{bench.MAS}/scenes.json", encoding="utf-8"))["scenes"]
    order = [(s, pool[s], "pos") for s in POSITIVES] + [(m["id"], m, "master") for m in masters] + \
            [(s, pool[s], "fine") for s in fine]
    path = f"{bench.CACHE}/within-{name}.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for sid, scene, kind in order:
        if sid not in cache:
            try:
                cache[sid] = judge(scene)
            except (json.JSONDecodeError, KeyError) as e:
                cache[sid] = {"fail": False, "evidence": [], "error": str(e)[:200]}
            cache[sid]["kind"] = kind
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {sid:22s} {kind:6s} fail={cache[sid]['fail']}", flush=True)
    for kind in ("pos", "master", "fine"):
        rows = [v for v in cache.values() if v.get("kind") == kind]
        k = sum(v["fail"] for v in rows)
        lo, hi = bench.wilson(k, len(rows))
        print(f"within-{name} {kind:6s} failed {k}/{len(rows)} [{lo:.0f}-{hi:.0f}%]")





# ---- W4b: a stricter confirming question (§32) -----------------------------
# W4 failed 2 masterpieces: Joyce's "her mother was alive" (then) vs "her
# mother was dead" (now), and Mansfield's "you won't bring a drunken workman
# back to life" vs "dead when they picked him up". Stricter confirming can only
# remove flags, so W4b re-confirms W4's findings rather than re-running it.
# The examples below are invented, not taken from the bench.
RULES_V2 = RULES + """
Statements about DIFFERENT TIMES do not contradict ("the mill was busy in those years" / "the mill stands empty now"). Negated, hypothetical, rhetorical or quoted statements do not either ("no one can raise the drowned" says nothing about who is alive)."""


def confirm_pair_v2(earlier, later):
    r = gen("You check one scene of fiction for a contradiction between two of its sentences.",
            f"""EARLIER SENTENCE: {earlier}
LATER SENTENCE: {later}

{RULES_V2}
Read the earlier sentence as true, at the time it describes. Does the later sentence, about the SAME moment or a later one, require the earlier one to be false?

Return JSON: {{ "contradicts": true or false }}""",
            {"type": "object", "properties": {"contradicts": {"type": "boolean"}}, "required": ["contradicts"]}, 30)
    return r.get("contradicts") is True


def reconfirm(src="w4", dst="w4b"):
    cache = json.load(open(f"{bench.CACHE}/within-{src}.json", encoding="utf-8"))
    out = {}
    for sid, v in cache.items():
        ev = [e for e in v.get("evidence", []) if confirm_pair_v2(e["earlier"], e["later"])]
        out[sid] = {**v, "evidence": ev, "fail": bool(ev)}
        if v.get("fail"):
            print(f"  {sid:22s} {v['kind']:6s} {len(v['evidence'])} -> {len(ev)}", flush=True)
    json.dump(out, open(f"{bench.CACHE}/within-{dst}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for kind in ("pos", "master", "fine"):
        rows = [x for x in out.values() if x.get("kind") == kind]
        print(f"within-{dst} {kind:6s} failed {sum(x['fail'] for x in rows)}/{len(rows)}")


if __name__ == "__main__":
    if sys.argv[1] == "reconfirm":
        reconfirm()
    else:
        run(sys.argv[1], {"w1": w1, "w2": w2, "w3": w3, "w4": w4}[sys.argv[1]])


def confirm_pair_timed(earlier, later):
    """W4c: FactTrack's time ranges (arXiv 2407.16347) as fields answered
    before the verdict: when is each sentence true, do the times overlap."""
    r = gen("You check one scene of fiction for a contradiction between two of its sentences.",
            f"""EARLIER SENTENCE: {earlier}
LATER SENTENCE: {later}

{RULES_V2}
Answer in order:
- "earlierTime": when what the earlier sentence describes is true (e.g. "years ago", "at this moment in the scene")
- "laterTime": the same for the later sentence
- "sameTime": do those times overlap, or is the later one after the earlier one within the scene?
- "contradicts": true only if, at an overlapping or later time, the later sentence requires the earlier one to be false

Return JSON: {{ "earlierTime": "...", "laterTime": "...", "sameTime": true or false, "contradicts": true or false }}""",
            {"type": "object", "properties": {"earlierTime": {"type": "string"}, "laterTime": {"type": "string"},
                                              "sameTime": {"type": "boolean"}, "contradicts": {"type": "boolean"}},
             "required": ["earlierTime", "laterTime", "sameTime", "contradicts"]}, 120)
    return r.get("contradicts") is True and r.get("sameTime") is True, r


def confirm_pair_ctx(prose, earlier, later):
    """W5: the stricter question (RULES_V2) with the passage around and between
    the two sentences, so "then" and "now" are visible. Up to 60 words before
    the earlier sentence, the text between (middle abridged past 160 words),
    and the later sentence."""
    from continuity_claims import alnum  # noqa: F401
    a, b = prose.find(earlier[:40]), prose.find(later[:40])
    if a < 0 or b < 0 or b <= a:
        return confirm_pair_v2(earlier, later)
    before = " ".join(prose[:a].split()[-60:])
    between = prose[a + len(earlier):b].split()
    mid = " ".join(between) if len(between) <= 160 else " ".join(between[:80]) + " [...] " + " ".join(between[-80:])
    r = gen("You check one scene of fiction for a contradiction between two of its sentences.",
            f"""PASSAGE (for context): ...{before}
>>> EARLIER SENTENCE: {earlier}
{mid}
>>> LATER SENTENCE: {later}

{RULES_V2}
Read the earlier sentence as true at the time it describes. Using the passage to tell WHEN each sentence applies, does the later sentence, about the same moment or a later one, require the earlier one to be false?

Return JSON: {{ "contradicts": true or false }}""",
            {"type": "object", "properties": {"contradicts": {"type": "boolean"}}, "required": ["contradicts"]}, 30)
    return r.get("contradicts") is True


def confirm_pair_prob(earlier, later):
    """W6: the W4b question as one letter, read as P(A) (see §32: a JSON
    boolean/enum answer is not the model's most likely answer)."""
    from confirm_variants import letter_probs
    return letter_probs("You check one scene of fiction for a contradiction between two of its sentences.",
                        f"""EARLIER SENTENCE: {earlier}
LATER SENTENCE: {later}

{RULES_V2}
Read the earlier sentence as true, at the time it describes. Does the later sentence, about the SAME moment or a later one, require the earlier one to be false?
A) yes, it contradicts
B) no

Answer with one letter only.""")["A"]
