"""Scaffold/finalize human annotation worksheets for retrieval-eval queries.

This tool MUST NOT fabricate relevance judgments. `scaffold` creates an
unfilled TEMPLATE with invalid relevance placeholders and `humanCheckedRelevance:
false`. A human fills `relevant`/`hard_negatives`/`kind` and marks each query
`humanChecked: true`, then `finalize` emits strict query rows for
fact_retrieval.py. Finalize rejects unfilled markers and missing human checks.

    python tools/retrieval-eval/query_worksheet.py scaffold --corpus <corpus.json> --book-id <id> --out worksheet.json
    # human edits worksheet.json ...
    python tools/retrieval-eval/query_worksheet.py finalize --worksheet worksheet.json --out queries.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from fact_retrieval import derive_queries, load_corpus, queries_from_rows  # noqa: E402

FILL = "__FILL__"
ROOT = Path(__file__).resolve().parents[2]


def resolve(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else ROOT / p


def excerpt(text: str, limit: int = 220) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    return t if len(t) <= limit else t[: limit - 3].rstrip() + "..."


def build_worksheet(corpus, book_id: str, source: str | None = None) -> dict:
    scenes = []
    for c in corpus:
        scenes.append(
            {
                "index": int(c.get("index", 0)),
                "chapter": c.get("chapter"),
                "title": c.get("title", ""),
                "words": c.get("words"),
                "excerpt": excerpt(str(c.get("draft") or c.get("summary") or "")),
            }
        )
    # Suggestions only. Relevance is NOT filled and NOT human-checked.
    suggestions = []
    try:
        derived = derive_queries(corpus)
    except ValueError:
        derived = []  # No ledger facts; human adds queries manually.
    for q in derived:
        suggestions.append(
            {
                "id": q.id,
                "text": q.text,
                "relevant": [FILL],
                "hard_negatives": [],
                "kind": "fact",
                "humanChecked": False,
                "suggestedFrom": "story-ledger-derived (HINT ONLY; verify; do not treat as human-checked relevance)",
                "hintDerivedRelevant": list(q.relevant),
                "hintDerivedHardNegatives": list(q.hard_negatives),
                "note": "",
            }
        )
    return {
        "status": "TEMPLATE_UNFILLED",
        "humanCheckedRelevance": False,
        "bookId": book_id,
        "source": source,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "instructions": [
            "This file is a TEMPLATE. It does NOT contain human relevance judgments.",
            "For each query, a human must set relevant/hard_negatives (0-based scene indices), kind (fact/noise), and humanChecked:true.",
            "Remove all __FILL__ markers. Use kind=noise with relevant=[] for queries with no relevant scene.",
            "When complete, set status=HUMAN_CHECKED and humanCheckedRelevance=true, then run: python tools/retrieval-eval/query_worksheet.py finalize --worksheet <this> --out queries.json",
            "Do not fabricate relevance labels. hintDerived* fields are unverified suggestions only.",
        ],
        "scenes": scenes,
        "queries": suggestions,
    }


def finalize_worksheet(worksheet: dict) -> list[dict]:
    if not isinstance(worksheet, dict):
        raise ValueError("worksheet must be an object")
    if worksheet.get("status") != "HUMAN_CHECKED":
        raise ValueError("worksheet.status must be HUMAN_CHECKED (set only after human review)")
    if worksheet.get("humanCheckedRelevance") is not True:
        raise ValueError("worksheet.humanCheckedRelevance must be true (set only after human review)")
    raw_queries = worksheet.get("queries")
    if not isinstance(raw_queries, list) or not raw_queries:
        raise ValueError("worksheet must contain a non-empty queries array")
    rows = []
    for i, q in enumerate(raw_queries):
        if not isinstance(q, dict):
            raise ValueError(f"query {i} is not an object")
        blob = json.dumps(q)
        if FILL in blob or "<FILL" in blob:
            raise ValueError(f"query {q.get('id', i)} still contains fill markers")
        if q.get("humanChecked") is not True:
            raise ValueError(f"query {q.get('id', i)} must have humanChecked:true")
        rows.append(
            {
                "id": q["id"],
                "text": q["text"],
                "relevant": q.get("relevant", []),
                "hard_negatives": q.get("hard_negatives", q.get("hardNegatives", [])),
                "kind": q.get("kind", "fact"),
            }
        )
    # Validate against the scene count when available.
    scenes = worksheet.get("scenes") or []
    if scenes:
        queries_from_rows(rows, len(scenes))
    else:
        upper = 0
        for r in rows:
            for v in list(r.get("relevant", [])) + list(r.get("hard_negatives", [])):
                try:
                    upper = max(upper, int(v))
                except (TypeError, ValueError):
                    pass
        queries_from_rows(rows, upper + 1)
    return rows


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Scaffold/finalize retrieval query worksheets (human-checked relevance required)"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sc = sub.add_parser("scaffold", help="create an unfilled TEMPLATE worksheet from a corpus")
    sc.add_argument("--corpus", required=True)
    sc.add_argument("--book-id", required=True)
    sc.add_argument("--out", required=True)

    fi = sub.add_parser("finalize", help="emit strict query rows from a HUMAN_CHECKED worksheet")
    fi.add_argument("--worksheet", required=True)
    fi.add_argument("--out", required=True)

    args = parser.parse_args(argv)
    if args.cmd == "scaffold":
        corpus = load_corpus(resolve(args.corpus))
        ws = build_worksheet(corpus, book_id=args.book_id, source=str(args.corpus))
        out = resolve(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(ws, indent=2), encoding="utf-8")
        print(f"wrote TEMPLATE worksheet: {out} ({len(ws['queries'])} suggested queries, 0 human labels)")
        print("A human must fill relevance and mark humanChecked:true before finalize. No labels fabricated.")
        return 0
    if args.cmd == "finalize":
        ws = json.loads(resolve(args.worksheet).read_text(encoding="utf-8"))
        rows = finalize_worksheet(ws)
        out = resolve(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"wrote {len(rows)} strict query rows: {out}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
