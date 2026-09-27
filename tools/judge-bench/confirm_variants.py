"""
Continuity confirmers compared on the development pairs (§32).

  C0  today's yes/no ("the facts are the story so far ... contradicts?")
  C1  the same framing as a three-way letter -- A contradicts, B compatible,
      C unrelated -- scored by P(A) from the token log-probabilities (Ollama
      >= 0.12.11). Small models over-answer "neutral" (arXiv 2411.14103), so
      a threshold below 0.5 can recover recall; it is set on the dev pairs at
      zero false alarms.
  C2  FactTrack-style decomposition (arXiv 2407.16347): the fact rewritten as
      2-3 things that must be true now or must have happened (cached per
      fact), then C1 with both sides spelled out.

    python -X utf8 tools/judge-bench/confirm_variants.py        # scores cached per pair
"""
import json
import math
import os
import sys
import urllib.request

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402
from continuity_claims import HOST, MODEL, OPTS, confirm_fact, gen  # noqa: E402

DEV = f"{bench.CACHE}/confirm-dev-candidates.json"
OUT = f"{bench.CACHE}/confirm-variants.json"
IMPL = f"{bench.CACHE}/fact-implications.json"

RULE = ("A new scene may add details the story has not mentioned, and may SHOW something change within the "
        "scene itself. It may not assume, as already having happened, a change the story never told (a death, "
        "a sale, a debt paid or reversed), and may not state the opposite of what is established.")


def letter_probs(system, prompt):
    body = {"model": MODEL, "system": system, "prompt": prompt, "stream": False, "think": False,
            "logprobs": True, "top_logprobs": 20, "keep_alive": "30m",
            "options": {**OPTS, "num_predict": 1}}
    req = urllib.request.Request(HOST + "/api/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=600))
    top = d["logprobs"][0]["top_logprobs"]
    p = {k: 0.0 for k in "ABC"}
    for t in top:
        k = t["token"].strip().upper()
        if k in p:
            p[k] += math.exp(t["logprob"])
    z = sum(p.values()) or 1.0
    return {k: v / z for k, v in p.items()}


def letter_probs_n(system, prompt, letters="ABCD"):
    """letter_probs for any set of one-letter choices."""
    body = {"model": MODEL, "system": system, "prompt": prompt, "stream": False, "think": False,
            "logprobs": True, "top_logprobs": 20, "keep_alive": "30m",
            "options": {**OPTS, "num_predict": 1}}
    req = urllib.request.Request(HOST + "/api/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=600))
    p = {k: 0.0 for k in letters}
    for t in d["logprobs"][0]["top_logprobs"]:
        k = t["token"].strip().upper()
        if k in p:
            p[k] += math.exp(t["logprob"])
    z = sum(p.values()) or 1.0
    return {k: v / z for k, v in p.items()}


def c1(fact, claim, sentence, extra=""):
    return letter_probs("You check a new scene against what a story has already established.",
                        f"""ESTABLISHED (true as of the story so far; nothing told since has changed it):
{fact}
{extra}
NEW SCENE, one sentence: {sentence}
What that sentence says or assumes: {claim}

{RULE}

Which is it?
A) the sentence contradicts what is established
B) the sentence is compatible with it
C) the sentence is unrelated to it

Answer with one letter only.""")["A"]


def implications(fact, cache):
    if fact not in cache:
        r = gen("You spell out what a story fact implies.",
                f"""STORY FACT: {fact}

Write 2 or 3 short statements that must be true, now or in the past, if this fact is true. Include what must already have happened. Plain words, one idea each.
Example: "Mira must repay her loan" -> "Mira borrowed money", "Mira owes money now".

Return JSON: {{ "implies": [ "..." ] }}""",
                {"type": "object", "properties": {"implies": {"type": "array", "maxItems": 3, "items": {"type": "string"}}},
                 "required": ["implies"]}, 200)
        cache[fact] = [x for x in r.get("implies", []) if isinstance(x, str)][:3]
        json.dump(cache, open(IMPL, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return cache[fact]


def c2(fact, claim, sentence, impl_cache):
    imp = implications(fact, impl_cache)
    extra = ("Which means: " + "; ".join(imp) + ".\n") if imp else ""
    return c1(fact, claim, sentence, extra)


SENT = f"{bench.CACHE}/sentence-assumptions.json"


def assumptions(fact, sentence, cache):
    """C3: the sentence side spelled out -- what it states or takes for granted
    about the same people or things as the fact. Replaces the extracted claim,
    which dropped the contradicting part in 4 of 8 dev misses."""
    key = f"{fact}|{sentence}"
    if key not in cache:
        r = gen("You spell out what a sentence of fiction states and takes for granted.",
                f"""SENTENCE: {sentence}

TOPIC: the same people, things or events as this story fact: {fact}

Write up to 3 short statements that the sentence states OR that must be true for it to make sense, about that topic only. Include what must already have happened. Plain words, one idea each. If the sentence says nothing about the topic, return an empty list.
Example: "She laid flowers where they had buried Tomas" -> "Tomas is dead", "Tomas was buried".

Return JSON: {{ "assumes": [ "..." ] }}""",
                {"type": "object", "properties": {"assumes": {"type": "array", "maxItems": 3, "items": {"type": "string"}}},
                 "required": ["assumes"]}, 200)
        cache[key] = [x for x in r.get("assumes", []) if isinstance(x, str)][:3]
        json.dump(cache, open(SENT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return cache[key]


def c3(fact, sentence, sent_cache, impl_cache=None):
    said = assumptions(fact, sentence, sent_cache)
    if not said:
        return 0.0
    extra = ""
    if impl_cache is not None:
        imp = implications(fact, impl_cache)
        extra = ("Which means: " + "; ".join(imp) + ".\n") if imp else ""
    return letter_probs("You check a new scene against what a story has already established.",
                        f"""ESTABLISHED (true as of the story so far; nothing told since has changed it):
{fact}
{extra}
NEW SCENE, one sentence: {sentence}
What that sentence states or takes for granted about this: {"; ".join(said)}

{RULE}

Which is it?
A) the sentence contradicts what is established
B) the sentence is compatible with it
C) the sentence is unrelated to it

Answer with one letter only.""")["A"]


def main_c3():
    dev = json.load(open(DEV, encoding="utf-8"))
    out = json.load(open(OUT, encoding="utf-8"))
    impl = json.load(open(IMPL, encoding="utf-8")) if os.path.exists(IMPL) else {}
    sc = json.load(open(SENT, encoding="utf-8")) if os.path.exists(SENT) else {}
    for key, rec in dev.items():
        for i, p in enumerate(rec["pairs"]):
            k = f"{key}#{i}"
            if k not in out or "c3" in out[k]:
                continue
            out[k]["c3"] = c3(p["fact"], p["sentence"], sc)
            out[k]["c4"] = c3(p["fact"], p["sentence"], sc, impl)
            json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {k:36s} c3={out[k]['c3']:.2e} c4={out[k]['c4']:.2e}", flush=True)


def main():
    dev = json.load(open(DEV, encoding="utf-8"))
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    impl = json.load(open(IMPL, encoding="utf-8")) if os.path.exists(IMPL) else {}
    for key, rec in dev.items():
        for i, p in enumerate(rec["pairs"]):
            k = f"{key}#{i}"
            if k in out:
                continue
            out[k] = {"label": p.get("label"), "kind": rec["kind"],
                      "c0": confirm_fact(p["fact"], p["claim"], p["sentence"]),
                      "c1": round(c1(p["fact"], p["claim"], p["sentence"]), 4),
                      "c2": round(c2(p["fact"], p["claim"], p["sentence"], impl), 4)}
            json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {k:36s} label={out[k]['label']} c0={out[k]['c0']} c1={out[k]['c1']} c2={out[k]['c2']}", flush=True)


if __name__ == "__main__":
    main_c3() if sys.argv[1:] == ["c3"] else main()
