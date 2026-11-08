# Retrieval multi-book: human input required (no fabrication)

Multi-book retrieval claims require **2–3+ books with human-checked (or explicitly verified) query relevance**. Tooling exists; **qualified relevance data does not**. Do not fabricate queries, relevance judgments, or results.

## Current state
- No qualifying `humanChecked`/`HUMAN_CHECKED` relevance manifests/queries under `reports/live` (by design — humans must provide them).
- Older single-book/story-ledger-derived baselines are **not** cross-book and **not** human-checked relevance proof.

## Human inputs required
For each book (2–3 books minimum for a cross-book claim):
1. A **corpus** with stable 0-based scene indices, chapters, and required text fields (`draft`/`summary`/`storyBible` as used).
2. **Human-checked explicit queries** with:
   - `id`, `text`
   - `relevant`: 0-based scene indices that answer the query (verified by a human)
   - optional `hard_negatives` (plausible near-misses; must not overlap `relevant`)
   - optional `kind: "noise"` with empty `relevant`
   - per-query human check flag as required by your finalize workflow
3. A **manifest** listing books, corpus paths, optional caches/docs, and `queries`/`queriesPath`.

## Workflow (operator + human)
```bash
# 1) Validate structure only (no embeddings/Ollama, no results written)
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest <manifest.json> --validate
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest <manifest.json> --validate --json

# 2) Optional: scaffold an UNFILLED template (human must fill; tool rejects unfilled/fake-ready state)
python tools/retrieval-eval/query_worksheet.py scaffold --corpus <corpus.json> --book-id <id> --out worksheet.json
# Human edits worksheet: sets HUMAN_CHECKED / humanCheckedRelevance as required, fills relevant/hard_negatives,
# sets humanChecked:true per query. hintDerived* fields are UNVERIFIED suggestions only.

# 3) Finalize only after real human checks
python tools/retrieval-eval/query_worksheet.py finalize --worksheet worksheet.json --out queries.json

# 4) Run eval (BM25 sanity; full run needs Ollama embeddings configured)
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest <manifest.json> --no-embed
python -X utf8 tools/retrieval-eval/fact_retrieval.py --manifest <manifest.json>
```

See `tools/retrieval-eval/README.md` and `tools/retrieval-eval/multi-book-manifest.example.json`.

## Reporting rules
- Report **per-book and pooled** metrics with provenance (book ids, query source, who/when human-checked, limitations).
- State explicitly when queries are derived/ledger-based (convenience, not human-checked proof).
- Never report fabricated judgments or “expected” results as measured outcomes.
