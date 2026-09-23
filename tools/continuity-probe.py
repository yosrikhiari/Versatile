"""Compare two continuity-budget arms on the same scene briefs.

    python tools/continuity-probe.py [armA] [armB]     # default narrow wide

Reads `reports/live/continuity-probe/<arm>/summary.json` and the saved drafts
beside it. The arms are paired: same brief, same bible, same chapter log, same
prior scenes — only `embeddingContext` differs (350 tokens vs the new budget).

Two measures, because the harness's own one is weak:

1. `grounding` from the harness — capitalised words in the draft that appear in
   the prior scenes. Simple, but it catches sentence-internal words like "Old"
   and "Well" as invented names, and there are only ~3 observations per scene.

2. **Named-character callbacks** — computed here from the corpus's own
   `charactersPresent` fields rather than a regex. A callback is a named
   character who appears in the draft but is NOT in that scene's brief: the
   writer can only produce one if it remembers a scene it was not just handed.
   That is the thing a continuity budget is supposed to buy, so it is the
   primary measure.

Neither arm is seeded (the Ollama path sends no `seed`), so this is one sample
per cell. Treat a difference as a signal to investigate, not a result.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path("reports/live/continuity-probe")
CORPUS = pathlib.Path("reports/live/critic-rank-agreement/corpus.json")


def named_characters(corpus):
    """Single-token proper names from the briefs, e.g. Nesrin, Halim, Kemal."""
    names = set()
    for c in corpus:
        for raw in c["sceneBrief"].get("charactersPresent") or []:
            for tok in re.findall(r"\b[A-Z][a-zçğıöşü]{2,}\b", str(raw)):
                if tok not in {"Old", "Man", "Another", "Merchant", "Official", "Trader", "Her"}:
                    names.add(tok)
    return names


def brief_names(scene_brief, known):
    present = set()
    for raw in scene_brief.get("charactersPresent") or []:
        for tok in re.findall(r"\b[A-Z][a-zçğıöşü]{2,}\b", str(raw)):
            if tok in known:
                present.add(tok)
    return present


def load(arm):
    p = ROOT / arm / "summary.json"
    if not p.exists():
        raise SystemExit(f"missing {p} — run: ARM={arm} npx vitest run --config vitest.live.config.js src/tests/live/continuityProbe.live.js")
    return json.loads(p.read_text(encoding="utf-8"))


def main():
    arm_a = sys.argv[1] if len(sys.argv) > 1 else "narrow"
    arm_b = sys.argv[2] if len(sys.argv) > 2 else "wide"
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    by_index = {c["index"]: c for c in corpus}
    known = named_characters(corpus)
    print(f"named characters in the corpus: {sorted(known)}\n")

    sa, sb = load(arm_a), load(arm_b)
    print(f"{'':6s} {'':4s} | {arm_a:^33s} | {arm_b:^33s}")
    print(f"{'scene':6s} {'prior':>5s} | {'ctx':>5s} {'cited':>5s} {'words':>5s} {'call':>4s} {'grnd':>5s} | "
          f"{'ctx':>5s} {'cited':>5s} {'words':>5s} {'call':>4s} {'grnd':>5s}")

    rows_a = {r["index"]: r for r in sa["results"]}
    rows_b = {r["index"]: r for r in sb["results"]}
    totals = {arm_a: [0, 0], arm_b: [0, 0]}

    for idx in sorted(set(rows_a) & set(rows_b)):
        cells = []
        for arm, rows in ((arm_a, rows_a), (arm_b, rows_b)):
            r = rows[idx]
            prose = (ROOT / arm / f"{idx:02d}.prose.txt").read_text(encoding="utf-8")
            in_prose = {n for n in known if re.search(rf"\b{re.escape(n)}\b", prose)}
            in_brief = brief_names(by_index[idx]["sceneBrief"], known)
            callbacks = in_prose - in_brief
            totals[arm][0] += len(callbacks)
            totals[arm][1] += len(in_prose)
            cells.append(
                f"{r['contextTokensApprox']:5d} {r['earlierScenesCited']:5d} {r['words']:5d} "
                f"{len(callbacks):4d} {r['grounding'] if r['grounding'] is not None else 0:5.2f}"
            )
        print(f"{idx:6d} {rows_a[idx]['priorScenes']:5d} | {cells[0]} | {cells[1]}")

    print()
    for arm, s in ((arm_a, sa), (arm_b, sb)):
        cb, named = totals[arm]
        print(
            f"{arm:7s} budget {s['budgetTokens']:>5} tok | mean ctx {s['meanContextTokens']:>5} tok | "
            f"mean cited {s['meanEarlierScenesCited']:>5} | callbacks {cb:>3} | named mentions {named:>3} | "
            f"mean grounding {s['meanGrounding']}"
        )
    print("\nOne sample per cell, unseeded. A gap here is a lead, not a finding.")


if __name__ == "__main__":
    main()
