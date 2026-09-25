"""
Continuity candidate: extract claims (stated AND presupposed), then check (§31).

§29 found the production checker misses real contradictions because they are
presupposed inside a clause ("since the day Halim died") rather than asserted,
and that nothing checks a scene against itself (a "lifeless" man who coughs).

  1. extract: every sentence, numbered; the model lists the facts each one
     states or takes for granted (alive/dead, where, what happened, who has
     what, the state of an object) as short plain claims.
  2. against the story facts (earlier chapters): which claims cannot be true
     if the facts are true?
  3. against the scene itself: which two claims from different sentences
     cannot both be true in this scene?
  4. every hit is confirmed on the ORIGINAL sentences ("can both be true?"),
     so a claim the extractor garbled cannot convict a scene.

Evidence is by sentence number, so it always points at real text.

    python tools/judge-bench/continuity_claims.py
"""
import json
import re
import sys
import urllib.request

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402

HOST, MODEL = "http://localhost:11434", "qwen3:8b"
OPTS = {"temperature": 0, "num_ctx": 12288, "top_p": 0.9, "min_p": 0.05, "repeat_penalty": 1}


def gen(system, prompt, schema, num_predict=1500):
    body = {"model": MODEL, "system": system, "prompt": prompt, "stream": False, "think": False,
            "format": schema, "keep_alive": "30m", "options": {**OPTS, "num_predict": num_predict}}
    req = urllib.request.Request(HOST + "/api/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    for attempt in range(2):
        try:
            return json.loads(json.load(urllib.request.urlopen(req, timeout=900))["response"])
        except (json.JSONDecodeError, KeyError):
            if attempt:
                raise


def sentences(text):
    out = []
    for para in re.split(r"\n\s*\n", text):
        out += [s.strip() for s in re.split(r"(?<=[.!?…”\"])\s+(?=[“\"A-Z])", para.strip()) if s.strip()]
    return out


def alnum(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def extract(sents):
    listing = "\n".join(f"[{i + 1}] {s}" for i, s in enumerate(sents))
    schema = {"type": "object", "properties": {"claims": {"type": "array", "items": {
        "type": "object", "properties": {"s": {"type": "integer"}, "about": {"type": "string"},
                                         "claim": {"type": "string"}},
        "required": ["s", "about", "claim"]}, "maxItems": 60}}, "required": ["claims"]}
    r = gen("You extract the factual content of fiction, sentence by sentence, precisely.",
            f"""Below are the numbered sentences of one scene.

For each sentence that states OR TAKES FOR GRANTED a checkable fact, write the fact as a short plain claim:
- whether someone is alive or dead, conscious, injured
- where someone or something is, who is present
- what has already happened, what someone already knows or has
- the physical state of an object (open/closed, lit/dark, full/empty)
Include facts a sentence only assumes: "The kettle had stayed cold since the winter Marek drowned" -> "Marek is dead"; "She paid back what she owed Anya" -> "She owed Anya a debt".
A fact inside a thought, feeling or memory is still a fact: "She wondered why the letter Piet sent her was unsigned" -> "Piet sent her a letter". Write each fact as its own claim, stripped of the feeling around it.
Skip mood, description, similes, opinions and anything uncheckable. Several claims per sentence are fine; most sentences have none.

{listing}

"about" names the one person or thing the claim is about, always spelled the same way ("the guard", "Marek", "the lantern").

Return JSON: {{ "claims": [ {{ "s": sentence number, "about": "...", "claim": "..." }} ] }}""", schema, 4000)
    return [c for c in r.get("claims", []) if isinstance(c.get("s"), int) and 1 <= c["s"] <= len(sents) and c.get("claim")]


def confirm(a, b, same_scene):
    where = ("B comes later in the same scene than A. Things can change over the scene (a man can die), "
             "but a thing cannot be in two contradictory states at once, and the dead do not act." if same_scene
             else "A is an established fact of the story; B is from a later scene.")
    r = gen("You decide whether two statements about a story contradict each other.",
            f"""STATEMENT A: {a}
STATEMENT B: {b}

{where}
Can A and B both be true? A statement that repeats, paraphrases, adds detail to, or agrees with the other CAN be true alongside it. Answer false only if believing B means A must be false.

Return JSON: {{ "bothCanBeTrue": true or false }}""",
            {"type": "object", "properties": {"bothCanBeTrue": {"type": "boolean"}}, "required": ["bothCanBeTrue"]}, 30)
    return r.get("bothCanBeTrue") is True


def against_facts(claims, facts):
    listing = "\n".join(f"[{i + 1}] {c['claim']}" for i, c in enumerate(claims))
    schema = {"type": "object", "properties": {"hits": {"type": "array", "items": {
        "type": "object", "properties": {"claim": {"type": "integer"}, "fact": {"type": "string"}},
        "required": ["claim", "fact"]}, "maxItems": 20}}, "required": ["hits"]}
    r = gen("You check claims from new prose against established facts.",
            f"""ESTABLISHED FACTS (true):
{chr(10).join(facts)}

CLAIMS from a new scene:
{listing}

Which claims CANNOT be true if the facts are true (a dead character alive or an alive one dead, an event that did not happen, a denied relationship or debt)? New information and details the facts do not mention are NOT contradictions.
Copy the fact exactly. If none, return an empty list.

Return JSON: {{ "hits": [ {{ "claim": claim number, "fact": "..." }} ] }}""", schema, 2000)
    keys = [alnum(f) for f in facts]
    return [h for h in r.get("hits", []) if isinstance(h.get("claim"), int) and 1 <= h["claim"] <= len(claims)
            and any(alnum(h.get("fact", "")) and (alnum(h["fact"]) in k or k in alnum(h["fact"])) for k in keys)]


def within_scene(claims):
    """One entity at a time: everything the scene says about it, in order.
    Scanning 50 mixed claims for any clashing pair was too wide a search for
    an 8B model (it paired "no pulse" with "going limp" and missed "no pulse"
    against "the dying man collapses" 25 sentences later)."""
    by = {}
    for i, c in enumerate(claims):
        key = re.sub(r"^(the|a|an)\s+", "", (c.get("about") or "").strip().lower())
        if key:
            by.setdefault(key, []).append(i)
    schema = {"type": "object", "properties": {"pairs": {"type": "array", "items": {
        "type": "object", "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
        "required": ["a", "b"]}, "maxItems": 10}}, "required": ["pairs"]}
    found = []
    for key, idx in by.items():
        if len({claims[i]["s"] for i in idx}) < 2:
            continue
        listing = "\n".join(f"[{n + 1}] (sentence {claims[i]['s']}) {claims[i]['claim']}" for n, i in enumerate(idx))
        r = gen("You check one character's or object's story inside a scene for contradictions.",
                f"""Everything one scene says about "{key}", in reading order:
{listing}

Is there a later statement that CANNOT follow from an earlier one? Examples: dead or without a pulse, then acting, moving, speaking or collapsing again; closed, then lighting the room; gone, then present with no return.
Ordinary change over the scene (injured, then dying; standing, then sitting) is NOT a contradiction. If none, return an empty list.

Return JSON: {{ "pairs": [ {{ "a": earlier number, "b": later number }} ] }}""", schema, 600)
        for p in r.get("pairs", []):
            a, b = p.get("a"), p.get("b")
            if isinstance(a, int) and isinstance(b, int) and 1 <= a <= len(idx) and 1 <= b <= len(idx):
                ia, ib = idx[a - 1], idx[b - 1]
                if claims[ia]["s"] != claims[ib]["s"]:
                    found.append((min(ia, ib) + 1, max(ia, ib) + 1))
    return sorted(set(found))


def judge(scene):
    try:
        return _judge(scene)
    except (json.JSONDecodeError, KeyError) as e:
        # Recorded, not raised: one malformed answer must not end a 90-scene run.
        return {"fail": False, "evidence": [], "claims": 0, "error": str(e)[:200]}


def _judge(scene):
    sents = sentences(scene["prose"])
    claims = extract(sents)
    evidence = []
    if scene.get("facts") and claims:
        for h in against_facts(claims, scene["facts"]):
            s = sents[claims[h["claim"] - 1]["s"] - 1]
            if not confirm(h["fact"], s, same_scene=False):
                evidence.append({"kind": "facts", "sentence": s, "fact": h["fact"]})
    if len(claims) >= 2:
        for a, b in within_scene(claims):
            ca, cb = claims[a - 1], claims[b - 1]
            first, second = sorted([ca, cb], key=lambda c: c["s"])
            sa, sb = sents[first["s"] - 1], sents[second["s"] - 1]
            if not confirm(sa, sb, same_scene=True):
                evidence.append({"kind": "scene", "a": sa, "b": sb})
    return {"fail": bool(evidence), "evidence": evidence, "claims": len(claims)}


if __name__ == "__main__" and len(sys.argv) == 1:
    bench.run("continuity-claims-v1", "continuity", judge)


# ---- facts-only candidate (§31): the half that works ---------------------------
#
# The within-scene check above is not solved: extraction flattens actions into
# states ("the dying man collapses" -> "the Worker is dead"), so a clash between
# a death and a later act disappears before anything checks it. The facts half
# is different: every facts-type miss in §29 is presupposed or indirect ("the
# day she left Halim's body in the salt flat", "the debt Halim owed her"), and
# claim extraction surfaces exactly that. This candidate runs only that half,
# only on sentences that name someone the facts name -- faster, and aimed.

VERSION = "v3"
# v1: confirmed with the whole sentence ("can both be true?") and carried a
#     prompt example copied from a bench scene (salt-corpus-14) -- a leak.
# v2: confirmed the bare claim: "Halim is alive" (Ch1) vs "Halim is dead" came
#     back "both can be true" -- he could have died since. That is the real
#     question, and the facts answer it: they are the story SO FAR.
# v3: asks exactly that -- a scene may show a change, not assume one the story
#     never told -- with the claim and its sentence together. Probed on 10
#     known pairs: 9/10 stable over two runs, 0 false alarms.


def confirm_fact(fact, claim, sentence):
    r = gen("You check a new scene against what a story has already established.",
            f"""ESTABLISHED (true as of the story so far; nothing told since has changed it):
{fact}

NEW SCENE, one sentence: {sentence}
What that sentence says or assumes: {claim}

A new scene may add details the story has not mentioned, and may SHOW something change within the scene itself. It may not assume, as already having happened, a change the story never told (a death, a sale, a debt paid or reversed), and may not state the opposite of what is established.
Does the sentence contradict what is established?

Return JSON: {{ "contradicts": true or false }}""",
            {"type": "object", "properties": {"contradicts": {"type": "boolean"}}, "required": ["contradicts"]}, 30)
    return r.get("contradicts") is True


def names_in(facts):
    stop = {"Ch", "The", "She", "He", "They", "A", "An", "In", "On", "At", "Her", "His", "It", "This"}
    return sorted({w for w in re.findall(r"\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b", " ".join(facts)) if w not in stop})


def judge_facts(scene):
    try:
        facts = scene.get("facts") or []
        if not facts:
            return {"fail": False, "evidence": [], "claims": 0, "skipped": "no facts"}
        names = names_in(facts)
        sents = [s for s in sentences(scene["prose"]) if any(n in s for n in names)]
        if not sents:
            return {"fail": False, "evidence": [], "claims": 0}
        claims = extract(sents)
        evidence = []
        seen = set()
        for h in against_facts(claims, facts) if claims else []:
            s = sents[claims[h["claim"] - 1]["s"] - 1]
            claim = claims[h["claim"] - 1]["claim"]
            if (s, h["fact"]) in seen:
                continue
            seen.add((s, h["fact"]))
            if confirm_fact(h["fact"], claim, s):
                evidence.append({"kind": "facts", "sentence": s, "fact": h["fact"], "claim": claim})
        return {"fail": bool(evidence), "evidence": evidence, "claims": len(claims)}
    except (json.JSONDecodeError, KeyError) as e:
        return {"fail": False, "evidence": [], "claims": 0, "error": str(e)[:200]}


def run_facts():
    """Bench on what this half is for: the reviewers' facts-type continuity
    problems, and every reviewer-fine scene that has facts (false alarms)."""
    import os
    p1 = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/pass1.json", encoding="utf-8"))}
    p2 = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/pass2.json", encoding="utf-8"))}
    cons = {r["sceneId"]: r for r in json.load(open(f"{bench.LAB}/claude-labels/consensus.json", encoding="utf-8"))}
    pool = {s["id"]: s for s in json.load(open(f"{bench.LAB}/scenes.json", encoding="utf-8"))["scenes"]}
    facts_type = [sid for sid, r in cons.items() if r["dims"]["continuity"] == "problem"
                  and re.search(r"\bCh\d|fact", p1[sid]["note"] + " " + p2[sid]["note"])]
    fine = [sid for sid, r in cons.items() if r["dims"]["continuity"] == "fine" and pool[sid]["facts"]]
    path = f"{bench.CACHE}/continuity-facts-{VERSION}.json"
    os.makedirs(bench.CACHE, exist_ok=True)
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for sid in facts_type + fine:
        if sid not in cache:
            cache[sid] = judge_facts(pool[sid])
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {sid:20s} fail={cache[sid]['fail']}", flush=True)
    caught = sum(cache[s]["fail"] for s in facts_type)
    alarms = sum(cache[s]["fail"] for s in fine)
    c, a = bench.wilson(caught, len(facts_type)), bench.wilson(alarms, len(fine))
    print(f"\ncontinuity-facts-{VERSION}")
    print(f"  facts-type problems caught {caught}/{len(facts_type)}  [{c[0]:.0f}-{c[1]:.0f}%]")
    print(f"  false alarms (fine, has facts) {alarms}/{len(fine)}  [{a[0]:.0f}-{a[1]:.0f}%]")
    print("  errors", sum(1 for s in facts_type + fine if cache[s].get("error")))


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "facts":
    run_facts()
