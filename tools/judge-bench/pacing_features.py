"""
Pacing without a taste judge (§31): cheap, checkable measures of the thing the
reviewers actually flagged -- paragraphs that go back over ground already
covered -- compared with reviewer pacing labels and the masterpieces.

  redundancy: for each paragraph, the highest cosine similarity (nomic-embed-text)
              to any earlier paragraph; a scene's score is how many paragraphs
              exceed a threshold, and the mean of the top 3.
  length:     paragraphs, words.

    python -X utf8 tools/judge-bench/pacing_features.py
"""
import json
import os
import sys
import urllib.request
from math import sqrt

sys.path.insert(0, "tools/judge-bench")
import bench  # noqa: E402

HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
PATH = f"{bench.CACHE}/pacing-embeddings.json"


def embed(texts):
    body = json.dumps({"model": "nomic-embed-text", "input": [f"clustering: {t}" for t in texts],
                       "keep_alive": "5m"}).encode()
    req = urllib.request.Request(f"{HOST}/api/embed", body, {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=600))["embeddings"]


def cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / (sqrt(sum(x * x for x in a)) * sqrt(sum(y * y for y in b)))


def paras(prose):
    return [p.strip() for p in prose.split("\n\n") if p.strip()]


def features(scene, cache):
    ps = paras(scene["prose"])
    if scene["id"] not in cache:
        cache[scene["id"]] = embed(ps)
        json.dump(cache, open(PATH, "w"))
    e = cache[scene["id"]]
    back = sorted((max(cos(e[i], e[j]) for j in range(i)) for i in range(1, len(e))), reverse=True)
    return {"paras": len(ps), "words": len(scene["prose"].split()), "back": back,
            "top3": sum(back[:3]) / max(1, len(back[:3]))}


def auc(pos, neg):
    """P(a random problem scene scores higher than a random fine one)."""
    if not pos or not neg:
        return float("nan")
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


def main():
    problem, fine, masters = bench.load("pacing")
    cache = json.load(open(PATH)) if os.path.exists(PATH) else {}
    F = {s["id"]: features(s, cache) for s in problem + fine + masters}
    over = lambda f, t: sum(b >= t for b in f["back"])  # noqa: E731
    measures = {"paragraphs": lambda f: f["paras"], "words": lambda f: f["words"], "top3 similarity": lambda f: f["top3"]}
    for t in (0.80, 0.85, 0.88, 0.90):
        measures[f"paras >= {t} similar"] = (lambda t: lambda f: over(f, t))(t)
    print(f"{'measure':24s} AUC(problem>fine)  problem median  fine median  masters median")
    for name, m in measures.items():
        P = sorted(m(F[s["id"]]) for s in problem)
        N = sorted(m(F[s["id"]]) for s in fine)
        Mm = sorted(m(F[s["id"]]) for s in masters)
        med = lambda xs: xs[len(xs) // 2]  # noqa: E731
        print(f"{name:24s} {auc(P, N):.2f}               {med(P):8.2f}      {med(N):8.2f}     {med(Mm):8.2f}")


if __name__ == "__main__":
    main()
