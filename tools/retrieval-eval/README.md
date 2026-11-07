# Retrieval eval (fact/scene retrieval)

Non-circular retrieval evaluation for scene retrieval, runnable across **multiple books**. The retriever does not define ground truth: relevance comes from explicit query rows or (by default) derived story-ledger facts with adjacent-chapter hard negatives.

**Evidence rule:** do not fabricate relevance judgments or results. A multi-book result requires **2–3+ books with human-checked (or explicitly verified) query relevance**. Derived `storyBible` queries are a convenience fallback, not proof of human-checked relevance. The checked-in older baseline (`reports/live/retrieval-eval/results.json`) is a single-book/40-query result — not a cross-book claim.

## Run

```bash
# Structure validation only (no scorers, no embeddings, no Ollama, no results written)
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest tools/retrieval-eval/manifest.json --validate
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest path.json --validate --json

# BM25 only (no embeddings)
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest path.json --no-embed

# Full run (needs Ollama/models for embeddings; see --models)
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest path.json
```

Tests:

```bash
python -m unittest discover -s tools/retrieval-eval -p "test_*.py" -v
```

## Manifest

`tools/retrieval-eval/manifest.json` (or `--manifest`):

```json
{
  "books": [
    {
      "id": "salt-road",
      "corpus": "reports/live/critic-rank-agreement/corpus.json",
      "cache": "reports/live/retrieval-eval",
      "docs": ["summary", "prose"]
    }
  ]
}
```

- `id` (required, unique): book identifier used in per-book/pooled reports.
- `corpus` (required): scene list (array or `{ "scenes": [...] }`). Each scene needs `index` (or it is stamped), `chapter`, and the text fields used (`draft`/`summary`/`storyBible`).
- `cache` (optional): cache dir (summaries). With multiple books and no per-book cache, caches are namespaced under `--cache/<id>`.
- `docs` (optional): subset of `["summary","prose"]`.
- `queries` or `queriesPath` (optional): **explicit, human-checked relevance recommended** for real claims. If omitted, queries are derived from the corpus `storyBible`.

## Query format

Explicit query rows (inline `queries` or a JSON file at `queriesPath`):

```json
[
  {"id": "q1", "text": "Who finds the ledger?", "relevant": [3, 4], "hard_negatives": [1, 2, 5]},
  {"id": "n1", "text": "A global ambiguous fact", "relevant": [], "kind": "noise"}
]
```

- `relevant`: 0-based scene indices that answer the query.
- `hard_negatives`: plausible near-miss scenes (e.g. adjacent chapters). Must not overlap `relevant`.
- `kind: "noise"` / empty `relevant`: counted separately (noise hard-negative top-1), excluded from MRR.
- Indices are validated against corpus size; ids must be unique.

## Human annotation worksheet (optional helper)

`query_worksheet.py` can scaffold an **unfilled TEMPLATE** from a corpus (scene context + suggested query texts/hints). It **does not create relevance labels**: `relevant` is filled with `__FILL__` markers, `humanCheckedRelevance` is `false`, and finalize rejects unfilled/missing human checks.

```bash
python tools/retrieval-eval/query_worksheet.py scaffold --corpus <corpus.json> --book-id <id> --out worksheet.json
# human fills relevance/hard_negatives/kind and sets humanChecked:true per query, status=HUMAN_CHECKED, humanCheckedRelevance=true
python tools/retrieval-eval/query_worksheet.py finalize --worksheet worksheet.json --out queries.json
```

`hintDerived*` fields are unverified story-ledger suggestions only — never treat them as human-checked relevance.

## Adding a book (roadmap step)

1. Add a corpus with stable scene indices/chapters and the required text fields.
2. Optionally scaffold a worksheet, then have a human produce **human-checked** explicit `queries`/`queriesPath` with `relevant` (and `hard_negatives`/`noise` as appropriate). **Do not invent relevance labels.**
3. Add the book to a manifest (see `multi-book-manifest.example.json`).
4. Run `--validate` to check structure.
5. Run `--no-embed` for a fast sanity check, then the full embedding run.
6. Report per-book and pooled intervals; keep limitations explicit (book count, query provenance, language/genre). No fabricated judgments or results.
