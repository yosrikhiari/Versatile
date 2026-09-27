"""
A retrieval eval that can fail (§35).

scripts/evaluate-scene-retrieval.js scores MRR 1.0 because it is circular:
its "relevant" scenes are chosen by the same TF-IDF cosine it then ranks with,
over synthetic documents built from genre keyword lists. This one has ground
truth the retriever does not define and hard negatives:

  corpus   the 30 Salt Road scenes (reports/live/critic-rank-agreement),
           3 per chapter, one book, one cast, one style
  queries  the 40 story-ledger facts ("Ch3: The trader disappears ..."), the
           "ChN:" prefix stripped
  relevant the 3 scenes of the fact's chapter (the fact was recorded there)
  docs     scene summaries, as production ranks by (sceneContext.ts compares a
           query embedding with each earlier scene's summary embedding) --
           generated once with qwen3:8b and cached, since the corpus has none;
           and full prose, for comparison
  scorers  BM25; nomic-embed-text (app default) and snowflake-arctic-embed2
           (the live runs), each without and with the nomic task prefixes
           ("search_query: " / "search_document: "), which production omits

    python -X utf8 tools/retrieval-eval/fact_retrieval.py
"""
import json
import math
import os
import re
import sys
import urllib.request

sys.path.insert(0, "tools/judge-bench")
from continuity_claims import gen  # noqa: E402

HOST = "http://localhost:11434"
CORPUS = "reports/live/critic-rank-agreement/corpus.json"
CACHE = "reports/live/retrieval-eval"
os.makedirs(CACHE, exist_ok=True)


def embed(texts, model):
    out = []
    for i in range(0, len(texts), 16):
        body = json.dumps({"model": model, "input": texts[i:i + 16], "keep_alive": "5m"}).encode()
        req = urllib.request.Request(f"{HOST}/api/embed", body, {"Content-Type": "application/json"})
        out += json.load(urllib.request.urlopen(req, timeout=600))["embeddings"]
    return out


def cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)) or 1)


def tokens(t):
    return re.findall(r"[a-z]{3,}", t.lower())


def bm25(queries, docs, k1=1.5, b=0.75):
    dt = [tokens(d) for d in docs]
    avg = sum(map(len, dt)) / len(dt)
    df = {}
    for d in dt:
        for w in set(d):
            df[w] = df.get(w, 0) + 1
    n = len(dt)
    out = []
    for q in queries:
        scores = []
        for d in dt:
            s = 0.0
            for w in set(tokens(q)):
                f = d.count(w)
                if f:
                    idf = math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5))
                    s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len(d) / avg))
            scores.append(s)
        out.append(scores)
    return out


def summaries(corpus):
    path = f"{CACHE}/summaries.json"
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    for c in corpus:
        k = str(c["index"])
        if k not in cache:
            r = gen("You summarise scenes of a novel for a writer's reference.",
                    f"""SCENE:
{c['draft']}

Summarise this scene in two or three sentences: who is in it, what happens, and what changes by its end.

Return JSON: {{ "summary": "..." }}""",
                    {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]}, 300)
            cache[k] = r.get("summary", "")
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return [cache[str(c["index"])] for c in corpus]


def metrics(score_rows, relevant):
    mrr = r3 = r1 = 0.0
    for scores, rel in zip(score_rows, relevant):
        order = sorted(range(len(scores)), key=lambda i: -scores[i])
        first = next(r for r, i in enumerate(order) if i in rel)
        mrr += 1 / (first + 1)
        r1 += first == 0
        r3 += first < 3
    n = len(relevant)
    return mrr / n, r1 / n, r3 / n


def main():
    corpus = json.load(open(CORPUS, encoding="utf-8"))
    facts = [l.strip() for l in max(corpus, key=lambda c: len(c["storyBible"]))["storyBible"].split("\n") if l.strip()]
    queries, relevant = [], []
    for f in facts:
        m = re.match(r"Ch(\d+):\s*(.*)", f)
        if not m:
            continue
        ch = int(m.group(1))
        queries.append(m.group(2))
        relevant.append({i for i, c in enumerate(corpus) if c["chapter"] == ch})
    docs = {"summary": summaries(corpus), "prose": [c["draft"] for c in corpus]}
    print(f"{len(queries)} fact queries, {len(corpus)} scenes, 3 relevant each (chance MRR ~0.21)\n")
    print(f"{'docs':8s} {'scorer':40s} {'MRR':>6s} {'hit@1':>6s} {'hit@3':>6s}")
    results = {}
    for dname, dtexts in docs.items():
        rows = [[s for s in r] for r in bm25(queries, dtexts)]
        results[(dname, "bm25")] = metrics(rows, relevant)
        for model in ("nomic-embed-text", "snowflake-arctic-embed2"):
            for prefixed in (False, True):
                if prefixed and model != "nomic-embed-text":
                    continue
                qp, dp = ("search_query: ", "search_document: ") if prefixed else ("", "")
                qv = embed([qp + q for q in queries], model)
                dv = embed([dp + d for d in dtexts], model)
                rows = [[cos(q, d) for d in dv] for q in qv]
                results[(dname, f"{model}{' + prefixes' if prefixed else ''}")] = metrics(rows, relevant)
    for (dname, scorer), (mrr, h1, h3) in results.items():
        print(f"{dname:8s} {scorer:40s} {mrr:6.3f} {h1:6.2f} {h3:6.2f}")
    json.dump({f"{d}|{s}": v for (d, s), v in results.items()}, open(f"{CACHE}/results.json", "w"), indent=1)


if __name__ == "__main__":
    main()
