"""
A retrieval eval that can fail (§35), across more than one book.

scripts/evaluate-scene-retrieval.js scores MRR 1.0 because it is circular:
its "relevant" scenes are chosen by the same TF-IDF cosine it then ranks with,
over synthetic documents built from genre keyword lists. This one has ground
truth the retriever does not define, and it now supports:

  manifest   one or more books (`tools/retrieval-eval/manifest.json`); each
             book has its own corpus, optional explicit queries and cache, so
             results can be reported per book and pooled without pretending
             scenes from one book are independent of another
  queries    a fact names the chapter it was recorded in; that chapter's scenes
             are relevant. Adjacent chapters are HARD NEGATIVES: plausible,
             same cast, same style, but wrong. Explicit query rows may set
             `relevant`, `hard_negatives`, or `kind: "noise"`
  noise      a query with no relevant scene (a global or ambiguous fact). It is
             counted, excluded from MRR, and reported through its own
             hard-negative top-1 rate instead of silently vanishing
  metrics    MRR, hit@1, hit@3, hard-negative top-1 rate, and deterministic
             bootstrap confidence intervals over queries
  docs       scene summaries (as production ranks) and full prose, for comparison
  scorers    BM25; nomic-embed-text and snowflake-arctic-embed2, each without
             and (nomic only) with the task prefixes production omits

The checked-in `reports/live/retrieval-eval/results.json` is the older
single-book run. Re-running this script writes the expanded per-book payload
and keeps the old `docs|scorer` keys for compatibility.

    python -X utf8 tools/retrieval-eval/fact_retrieval.py
    python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest path.json
    python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest path.json --validate --json
"""
from __future__ import annotations

import argparse
import json
import math
import random
import re
import sys
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Sequence

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "judge-bench"))
try:  # The model helper is optional; the pure eval does not need Ollama.
    from continuity_claims import gen  # noqa: E402
except Exception:  # pragma: no cover - only the summary generator needs it
    gen = None

HOST = "http://localhost:11434"
DEFAULT_CORPUS = "reports/live/critic-rank-agreement/corpus.json"
DEFAULT_CACHE = "reports/live/retrieval-eval"
DEFAULT_MANIFEST = "tools/retrieval-eval/manifest.json"
DEFAULT_MODELS = ("nomic-embed-text", "snowflake-arctic-embed2")
KINDS = ("fact", "noise")

Scorer = Callable[[Sequence[str], Sequence[str]], list[list[float]]]


@dataclass(frozen=True)
class Query:
    """One retrieval question and the labels it is graded against."""

    id: str
    text: str
    relevant: tuple[int, ...]
    hard_negatives: tuple[int, ...] = ()
    kind: str = "fact"


def resolve_path(path: str | Path) -> Path:
    """Resolve a repo-relative path without depending on the caller's cwd."""
    p = Path(path)
    return p if p.is_absolute() else ROOT / p


def load_corpus(path: str | Path) -> list[dict]:
    """Load a scene list, accepting either a bare array or `{ "scenes": [...] }`."""
    data = json.loads(resolve_path(path).read_text(encoding="utf-8"))
    scenes = data.get("scenes") if isinstance(data, dict) else data
    if not isinstance(scenes, list):
        raise ValueError(f"{path}: expected a list of scenes or a 'scenes' array")
    out = []
    for i, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise ValueError(f"{path}: scene {i} is not an object")
        if "index" not in scene:
            scene = {**scene, "index": i + 1}
        out.append(scene)
    return out


def load_manifest(path: str | Path | None = None) -> list[dict]:
    """Load a book manifest; a missing file means the one legacy book."""
    if path is None:
        return [{"id": "salt-road", "corpus": DEFAULT_CORPUS, "cache": DEFAULT_CACHE}]
    p = resolve_path(path)
    if not p.exists():
        raise FileNotFoundError(f"manifest not found: {path}")
    data = json.loads(p.read_text(encoding="utf-8"))
    books = data.get("books") if isinstance(data, dict) else data
    if not isinstance(books, list) or not books:
        raise ValueError(f"{path}: expected a non-empty 'books' array")
    ids = []
    for i, book in enumerate(books):
        if not isinstance(book, dict):
            raise ValueError(f"{path}: book {i} is not an object")
        if not book.get("id"):
            raise ValueError(f"{path}: book {i} has no id")
        if not book.get("corpus"):
            raise ValueError(f"{path}: book {book['id']} has no corpus")
        if book["id"] in ids:
            raise ValueError(f"{path}: duplicate book id {book['id']}")
        ids.append(book["id"])
    return books


def _query_from_row(row: dict, index: int, corpus_size: int) -> Query:
    text = str(row.get("text") or "").strip()
    if not text:
        raise ValueError(f"query {index} has no text")
    try:
        relevant = sorted({int(v) for v in row.get("relevant", [])})
        hard = sorted(
            {int(v) for v in row.get("hard_negatives", row.get("hardNegatives", []))}
        )
    except (TypeError, ValueError) as err:
        raise ValueError(f"query {index}: scene indices must be integers") from err
    for v in relevant + hard:
        if v < 0 or v >= corpus_size:
            raise ValueError(f"query {index}: scene index {v} is outside the corpus")
    overlap = set(relevant) & set(hard)
    if overlap:
        raise ValueError(f"query {index}: {sorted(overlap)} marked both relevant and hard")
    kind = "noise" if not relevant else "fact"
    if row.get("kind") is not None:
        kind = str(row["kind"])
        if kind not in KINDS:
            raise ValueError(f"query {index}: kind must be one of {KINDS}")
    if kind == "noise" and relevant:
        raise ValueError(f"query {index}: a noise query cannot have relevant scenes")
    return Query(
        id=str(row.get("id") or f"q{index + 1}"),
        text=text,
        relevant=tuple(relevant),
        hard_negatives=tuple(hard),
        kind=kind,
    )


def queries_from_rows(rows: Iterable[dict], corpus_size: int) -> list[Query]:
    """Validate explicit query rows (used by tests and by a book's `queries`)."""
    out = [_query_from_row(row, i, corpus_size) for i, row in enumerate(rows)]
    if not out:
        raise ValueError("query set is empty")
    ids = [q.id for q in out]
    if len(ids) != len(set(ids)):
        raise ValueError("query ids must be unique")
    return out


def _chapter(scene: dict) -> int:
    try:
        return int(scene.get("chapter", -1))
    except (TypeError, ValueError):
        return -1


def derive_queries(corpus: Sequence[dict]) -> list[Query]:
    """Derive fact queries and hard negatives from a corpus's story ledger.

    Adjacent chapters are the hard negatives: they share the book's cast and
    style, so ranking one above the true chapter is a plausible miss, not a
    random one. A fact naming a chapter the corpus does not contain becomes a
    noise query rather than a crash.
    """
    ledger = max((str(c.get("storyBible") or "") for c in corpus), key=len, default="")
    rows: list[dict] = []
    seen: set[tuple[int, str]] = set()
    for line in ledger.splitlines():
        m = re.match(r"Ch(\d+):\s*(.*)", line.strip())
        if not m or not m.group(2).strip():
            continue
        chapter, text = int(m.group(1)), m.group(2).strip()
        if (chapter, text) in seen:
            continue
        seen.add((chapter, text))
        relevant = [i for i, c in enumerate(corpus) if _chapter(c) == chapter]
        hard = [
            i
            for i, c in enumerate(corpus)
            if _chapter(c) in (chapter - 1, chapter + 1) and i not in relevant
        ]
        rows.append(
            {
                "id": f"ch{chapter}-{len(rows) + 1}",
                "text": text,
                "relevant": relevant,
                "hard_negatives": hard,
                "kind": "noise" if not relevant else "fact",
            }
        )
    return queries_from_rows(rows, len(corpus))


def load_queries(book: dict, corpus: Sequence[dict]) -> list[Query]:
    """A book may carry explicit rows, a query file, or a story-ledger default."""
    if book.get("queries") is not None:
        return queries_from_rows(book["queries"], len(corpus))
    if book.get("queriesPath"):
        rows = json.loads(resolve_path(book["queriesPath"]).read_text(encoding="utf-8"))
        return queries_from_rows(rows, len(corpus))
    return derive_queries(corpus)


def embed(texts: Sequence[str], model: str, host: str = HOST) -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), 16):
        body = json.dumps(
            {"model": model, "input": list(texts[i : i + 16]), "keep_alive": "5m"}
        ).encode()
        req = urllib.request.Request(
            f"{host}/api/embed", body, {"Content-Type": "application/json"}
        )
        out += json.load(urllib.request.urlopen(req, timeout=600))["embeddings"]
    return out


def cos(a: Sequence[float], b: Sequence[float]) -> float:
    denom = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return sum(x * y for x, y in zip(a, b)) / (denom or 1)


def tokens(t: str) -> list[str]:
    return re.findall(r"[a-z]{3,}", t.lower())


def bm25(queries: Sequence[str], docs: Sequence[str], k1: float = 1.5, b: float = 0.75):
    if not docs:
        raise ValueError("BM25 needs at least one document")
    dt = [tokens(d) for d in docs]
    avg = sum(map(len, dt)) / len(dt)
    df: dict[str, int] = {}
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
                    s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len(d) / (avg or 1)))
            scores.append(s)
        out.append(scores)
    return out


def summaries(
    corpus: Sequence[dict],
    cache_dir: str | Path = DEFAULT_CACHE,
    generate: Callable | None = None,
) -> list[str]:
    """Scene summaries, cached per book. A corpus's own `summary` wins."""
    cache_path = resolve_path(cache_dir) / "summaries.json"
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache = (
        json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    )
    generate = generate or gen
    out = []
    for c in corpus:
        if c.get("summary"):
            out.append(str(c["summary"]))
            continue
        key = str(c["index"])
        if key not in cache:
            if generate is None:
                raise RuntimeError(
                    "no summary generator available; pass a corpus with `summary` "
                    "or run with Ollama reachable"
                )
            r = generate(
                "You summarise scenes of a novel for a writer's reference.",
                f"""SCENE:
{c['draft']}

Summarise this scene in two or three sentences: who is in it, what happens, and what changes by its end.

Return JSON: {{ "summary": "..." }}""",
                {
                    "type": "object",
                    "properties": {"summary": {"type": "string"}},
                    "required": ["summary"],
                },
                300,
            )
            cache[key] = r.get("summary", "")
            cache_path.write_text(
                json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8"
            )
        out.append(cache[key])
    return out


def rank_rows(scores: Sequence[float]) -> list[int]:
    """Rank indices by score, ties broken by index so runs are reproducible."""
    return sorted(range(len(scores)), key=lambda i: (-scores[i], i))


def metrics(score_rows: Sequence[Sequence[float]], queries: Sequence[Query]) -> dict:
    """Per-query arrays, not averages: bootstrap and pooling need the raw rows."""
    if len(score_rows) != len(queries):
        raise ValueError("one score row per query is required")
    reciprocal: list[float] = []
    hit1: list[float] = []
    hit3: list[float] = []
    hard_top1: list[float] = []
    noise_hard_top1: list[float] = []
    noise = 0
    for scores, q in zip(score_rows, queries):
        order = rank_rows(scores)
        top = order[0] if order else None
        if q.kind == "noise" or not q.relevant:
            noise += 1
            if q.hard_negatives:
                noise_hard_top1.append(1.0 if top in q.hard_negatives else 0.0)
            continue
        first = next((r for r, i in enumerate(order) if i in q.relevant), None)
        reciprocal.append(1 / (first + 1) if first is not None else 0.0)
        hit1.append(1.0 if first == 0 else 0.0)
        hit3.append(1.0 if first is not None and first < 3 else 0.0)
        if q.hard_negatives:
            hard_top1.append(1.0 if top in q.hard_negatives else 0.0)
    return {
        "queries": len(queries),
        "scoredQueries": len(reciprocal),
        "noiseQueries": noise,
        "reciprocalRanks": reciprocal,
        "hit1": hit1,
        "hit3": hit3,
        "hardNegativeTop1": hard_top1,
        "noiseHardNegativeTop1": noise_hard_top1,
    }


def _mean(values: Sequence[float]) -> float | None:
    return sum(values) / len(values) if values else None


def bootstrap_ci(
    values: Sequence[float], n_boot: int = 1000, seed: int = 0, alpha: float = 0.05
) -> list[float] | None:
    """Percentile bootstrap over queries, deterministic for a given seed."""
    values = [float(v) for v in values]
    if not values:
        return None
    if n_boot <= 0:
        raise ValueError("n_boot must be positive")
    rng = random.Random(seed)
    n = len(values)
    means = []
    for _ in range(n_boot):
        total = 0.0
        for _ in range(n):
            total += values[rng.randrange(n)]
        means.append(total / n)
    means.sort()
    lo = means[int((alpha / 2) * n_boot)]
    hi = means[min(n_boot - 1, int((1 - alpha / 2) * n_boot))]
    return [lo, hi]


def summarize(raw: dict, n_boot: int = 1000, seed: int = 0) -> dict:
    """Turn per-query arrays into the reported point estimate plus intervals."""
    return {
        "queries": raw["queries"],
        "scoredQueries": raw["scoredQueries"],
        "noiseQueries": raw["noiseQueries"],
        "mrr": _mean(raw["reciprocalRanks"]),
        "mrrCI": bootstrap_ci(raw["reciprocalRanks"], n_boot, seed),
        "hitAt1": _mean(raw["hit1"]),
        "hitAt1CI": bootstrap_ci(raw["hit1"], n_boot, seed),
        "hitAt3": _mean(raw["hit3"]),
        "hitAt3CI": bootstrap_ci(raw["hit3"], n_boot, seed),
        "hardNegativeTop1": _mean(raw["hardNegativeTop1"]),
        "hardNegativeTop1CI": bootstrap_ci(raw["hardNegativeTop1"], n_boot, seed),
        "noiseHardNegativeTop1": _mean(raw["noiseHardNegativeTop1"]),
        "noiseHardNegativeTop1CI": bootstrap_ci(
            raw["noiseHardNegativeTop1"], n_boot, seed
        ),
    }


def combine_raw(raws: Iterable[dict]) -> dict:
    """Pool per-query rows from several books without averaging averages."""
    keys = (
        "reciprocalRanks",
        "hit1",
        "hit3",
        "hardNegativeTop1",
        "noiseHardNegativeTop1",
    )
    combined: dict = {
        "queries": 0,
        "scoredQueries": 0,
        "noiseQueries": 0,
        **{k: [] for k in keys},
    }
    for raw in raws:
        combined["queries"] += raw["queries"]
        combined["scoredQueries"] += raw["scoredQueries"]
        combined["noiseQueries"] += raw["noiseQueries"]
        for k in keys:
            combined[k].extend(raw[k])
    return combined


def evaluate_documents(
    corpus: Sequence[dict],
    queries: Sequence[Query],
    docs: dict[str, Sequence[str]],
    scorers: dict[str, Scorer],
    n_boot: int = 1000,
    seed: int = 0,
) -> tuple[dict, dict[str, dict]]:
    """Score every docs × scorer pair; return reports and raw arrays."""
    report: dict[str, dict] = {}
    raws: dict[str, dict] = {}
    query_texts = [q.text for q in queries]
    for dname, dtexts in docs.items():
        if len(dtexts) != len(corpus):
            raise ValueError(f"{dname}: one document per scene is required")
        report[dname] = {}
        for sname, scorer in scorers.items():
            raw = metrics(scorer(query_texts, dtexts), queries)
            report[dname][sname] = summarize(raw, n_boot, seed)
            raws[f"{dname}|{sname}"] = raw
    return report, raws


def embedding_scorer(model: str, prefixed: bool = False) -> Scorer:
    qp, dp = ("search_query: ", "search_document: ") if prefixed else ("", "")

    def score(query_texts: Sequence[str], doc_texts: Sequence[str]):
        qv = embed([qp + q for q in query_texts], model)
        dv = embed([dp + d for d in doc_texts], model)
        return [[cos(q, d) for d in dv] for q in qv]

    return score


def build_scorers(
    models: Sequence[str] = DEFAULT_MODELS, use_embeddings: bool = True
) -> dict[str, Scorer]:
    scorers: dict[str, Scorer] = {"bm25": bm25}
    if not use_embeddings:
        return scorers
    for model in models:
        scorers[model] = embedding_scorer(model)
        if model == "nomic-embed-text":
            scorers[f"{model} + prefixes"] = embedding_scorer(model, prefixed=True)
    return scorers


def _fmt(value: float | None) -> str:
    return "-" if value is None else f"{value:.3f}"


def _fmt_ci(ci: list[float] | None) -> str:
    return "" if ci is None else f" [{ci[0]:.3f},{ci[1]:.3f}]"


def _print_table(label: str, report: dict[str, dict]) -> None:
    print(f"\n{label}")
    print(f"{'docs':8s} {'scorer':40s} {'MRR':>6s} {'hit@1':>6s} {'hit@3':>6s} {'hard@1':>7s}")
    for dname, scorers in report.items():
        for sname, m in scorers.items():
            print(
                f"{dname:8s} {sname:40s} "
                f"{_fmt(m['mrr'])}{_fmt_ci(m['mrrCI'])} "
                f"{_fmt(m['hitAt1'])} {_fmt(m['hitAt3'])} "
                f"{_fmt(m['hardNegativeTop1'])}"
            )


def validate_manifest(books: Sequence[dict]) -> dict:
    """Validate manifest/corpora/queries without running scorers or embeddings.

    Does not fabricate relevance judgments or results. A valid structure means
    the data is loadable and query indices are in range; it does not prove that
    relevance labels are human-checked or correct.
    """
    report: dict[str, dict] = {}
    for book in books:
        book_id = book["id"]
        corpus = load_corpus(book["corpus"])
        queries = load_queries(book, corpus)
        facts = sum(1 for q in queries if q.kind == "fact")
        noise = sum(1 for q in queries if q.kind == "noise")
        has_explicit = book.get("queries") is not None or book.get("queriesPath") is not None
        modes = book.get("docs") or ["summary", "prose"]
        report[book_id] = {
            "corpus": str(book["corpus"]),
            "scenes": len(corpus),
            "queries": len(queries),
            "factQueries": facts,
            "noiseQueries": noise,
            "querySource": "explicit" if has_explicit else "story-ledger-derived",
            "docs": list(modes),
            "cache": book.get("cache"),
        }
    return {"ok": True, "books": report}


def evaluate_manifest(
    books: Sequence[dict],
    cache_dir: str | Path = DEFAULT_CACHE,
    models: Sequence[str] = DEFAULT_MODELS,
    use_embeddings: bool = True,
    n_boot: int = 1000,
    seed: int = 0,
) -> dict:
    """Run every book, return per-book and pooled reports (plus raw arrays)."""
    books_report: dict[str, dict] = {}
    per_book_raw: dict[str, dict[str, dict]] = {}
    for book in books:
        book_id = book["id"]
        corpus = load_corpus(book["corpus"])
        queries = load_queries(book, corpus)
        # One book can share the legacy cache directory. With several books,
        # index keys (1..N) would collide, so each gets its own subdirectory
        # unless the manifest names a cache explicitly.
        book_cache = book.get("cache")
        if not book_cache:
            book_cache = cache_dir if len(books) == 1 else Path(cache_dir) / book_id
        docs: dict[str, Sequence[str]] = {}
        modes = book.get("docs") or ["summary", "prose"]
        if "summary" in modes:
            docs["summary"] = summaries(corpus, book_cache)
        if "prose" in modes:
            docs["prose"] = [str(c.get("draft") or "") for c in corpus]
        report, raws = evaluate_documents(
            corpus, queries, docs, build_scorers(models, use_embeddings), n_boot, seed
        )
        books_report[book_id] = {
            "queries": len(queries),
            "scenes": len(corpus),
            "docs": report,
        }
        per_book_raw[book_id] = raws

    # Pool only pairs every book has; a missing model on one book must not
    # silently turn an overall row into a different population.
    common = set.intersection(*(set(r) for r in per_book_raw.values())) if per_book_raw else set()
    overall: dict[str, dict] = {}
    overall_raw: dict[str, dict] = {}
    for key in sorted(common):
        dname, sname = key.split("|", 1)
        overall.setdefault(dname, {})[sname] = summarize(
            combine_raw(per_book_raw[b][key] for b in per_book_raw), n_boot, seed
        )
        overall_raw[key] = combine_raw(per_book_raw[b][key] for b in per_book_raw)
    return {
        "books": books_report,
        "overall": overall,
        "_raw": overall_raw,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Retrieval eval across books")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--corpus", default=None, help="single-book corpus override")
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--models", default=",".join(DEFAULT_MODELS))
    parser.add_argument("--no-embed", action="store_true")
    parser.add_argument("--bootstrap", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--validate",
        action="store_true",
        help="validate manifest/corpora/queries only; do not run scorers, embeddings, or write results",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON (useful with --validate)")
    args = parser.parse_args(argv)

    if args.corpus:
        books = [{"id": Path(args.corpus).stem, "corpus": args.corpus, "cache": args.cache}]
    else:
        books = load_manifest(args.manifest)

    if args.validate:
        report = validate_manifest(books)
        report["disclaimer"] = (
            "Validation checks structure only. It does not fabricate or verify "
            "relevance judgments; a multi-book claim requires explicit, human-checked "
            "query relevance (or verified labels), not derived convenience queries alone."
        )
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print("retrieval manifest validation: OK (structure)")
            for book_id, info in report["books"].items():
                print(
                    f"- {book_id}: {info['scenes']} scenes, {info['queries']} queries "
                    f"({info['factQueries']} fact/{info['noiseQueries']} noise, {info['querySource']}), "
                    f"docs={info['docs']}"
                )
            print(f"\n{report['disclaimer']}")
        return 0

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    result = evaluate_manifest(
        books,
        cache_dir=args.cache,
        models=models,
        use_embeddings=not args.no_embed,
        n_boot=args.bootstrap,
        seed=args.seed,
    )
    for book_id, report in result["books"].items():
        _print_table(
            f"{book_id}: {report['queries']} queries, {report['scenes']} scenes",
            report["docs"],
        )
    if len(result["books"]) > 1:
        _print_table("overall (pooled queries)", result["overall"])

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "bootstrap": {"samples": args.bootstrap, "seed": args.seed, "alpha": 0.05},
        "books": result["books"],
        "overall": result["overall"],
    }
    # Compatibility with the earlier single-book file, whose top-level keys
    # are `summary|bm25` etc. New consumers should read `overall`.
    for dname, scorers in result["overall"].items():
        for sname, m in scorers.items():
            payload[f"{dname}|{sname}"] = [m["mrr"], m["hitAt1"], m["hitAt3"]]

    out_path = resolve_path(args.cache) / "results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
