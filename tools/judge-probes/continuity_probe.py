"""
Continuity by input isolation + code-verified evidence.

The whole-scene focused judge named the planted contradiction ("X had been
dead for two years") on 8 of 30 scenes. Here the judge sees only:
  - the STORY BIBLE facts (one per line)
  - the scene's sentences that mention a name from the bible
and must return each contradiction as {sentence, fact}, copied exactly. Code
then keeps a contradiction only if the sentence is really in the scene AND the
fact is really a bible line — a claim with invented evidence is dropped.

Request replicates production: /api/generate, repeat_penalty 1 (JUDGE_SAMPLING).

    python tools/judge-probes/continuity_probe.py reports/live/judge-probes/continuity.json
"""
import json, re, sys, time, urllib.request, importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("g", os.path.join(HERE, "geval_probe_lib.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
OUT = sys.argv[1]
MARK = "had been dead for two years"


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower().strip(' ."\'')


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?”\"])\s+", text) if s.strip()]


def names(bible):
    # capitalised words that recur as subjects in the bible lines
    stop = {"Ch", "The", "She", "He", "They", "A", "An", "In", "On", "At", "Her", "His"}
    return sorted({w for w in re.findall(r"\b[A-Z][a-z]{2,}\b", bible) if w not in stop})


SCHEMA = {"type": "object", "properties": {"contradictions": {"type": "array", "items": {"type": "object", "properties": {"sentence": {"type": "string"}, "fact": {"type": "string"}}, "required": ["sentence", "fact"]}}}, "required": ["contradictions"]}


def judge(bible, draft):
    facts = [l.strip() for l in bible.splitlines() if l.strip()]
    ns = names(bible)
    sents = [s for s in sentences(draft) if any(n in s for n in ns)]
    if not sents:
        return [], [], 0
    prompt = f"""ESTABLISHED FACTS (true, do not question them):
{chr(10).join(facts)}

SENTENCES FROM A NEW SCENE:
{chr(10).join(f'- {s}' for s in sents)}

Does any sentence state something that CANNOT be true if the facts are true — a dead character alive or an alive one dead, an event that did not happen, a relationship or debt that is denied?
Differences of detail, new information, and things the facts do not mention are NOT contradictions.

For each real contradiction, copy the sentence EXACTLY and the fact EXACTLY. If there are none, return an empty list.

Return JSON: {{ "contradictions": [ {{ "sentence": "...", "fact": "..." }} ] }}"""
    body = {"model": g.MODEL, "stream": False, "think": False, "format": SCHEMA, "keep_alive": "30m",
            "system": "You check new prose against established facts. You report only contradictions you can quote on both sides.",
            "prompt": prompt, "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 600, "top_p": 0.9, "min_p": 0.05, "repeat_penalty": 1}}
    req = urllib.request.Request(g.HOST + "/api/generate", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    claimed = json.loads(json.load(urllib.request.urlopen(req, timeout=600))["response"])["contradictions"]
    nd, nf = norm(draft), [norm(f) for f in facts]
    verified = [c for c in claimed if norm(c["sentence"]) and norm(c["sentence"]) in nd and any(norm(c["fact"]) and (norm(c["fact"]) in f or f in norm(c["fact"])) for f in nf)]
    return claimed, verified, len(sents)


rows, t0 = [], time.time()
for idx in sorted(g.corpus):
    s = g.corpus[idx]
    for variant in ["control", "contradiction"]:
        draft = g.DEFECTS[variant][1](s["draft"], s["storyBible"])
        claimed, verified, n = judge(s["storyBible"], draft)
        hit = any(MARK in c["sentence"] for c in verified)
        rows.append({"scene": idx, "variant": variant, "sentencesShown": n, "claimed": claimed, "verified": verified, "plantedFound": hit})
        print(idx, variant, "shown", n, "claimed", len(claimed), "verified", len(verified), "PLANTED" if hit else "", [c["sentence"][:60] for c in verified], flush=True)
json.dump({"minutes": round((time.time() - t0) / 60, 1), "rows": rows}, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
C = [r for r in rows if r["variant"] == "control"]; X = [r for r in rows if r["variant"] == "contradiction"]
print("clean with a verified contradiction", sum(bool(r["verified"]) for r in C), "/", len(C),
      "| planted found", sum(r["plantedFound"] for r in X), "/", len(X),
      "| claimed-but-unverifiable", sum(len(r["claimed"]) - len(r["verified"]) for r in rows), "| minutes", round((time.time() - t0) / 60, 1))
