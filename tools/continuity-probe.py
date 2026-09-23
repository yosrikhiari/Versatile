"""Compare two continuity-budget arms on the same scene briefs.

    python tools/continuity-probe.py [armA] [armB]     # default narrow wide

The arms are paired: same brief, same bible, same chapter log, same prior
scenes — only `embeddingContext` differs (350 tokens vs the new budget). Each
scene is generated REPEATS times per arm, because the Ollama path sends no
`seed` and one sample per cell cannot separate an effect from sampling noise.

Measures, densest first. Counting *occurrences* rather than distinct names is
deliberate: distinct-name counts gave ~3 observations per scene, which is too
few to see through the variance.

  callbackMentions  occurrences of a named character who is NOT in this scene's
                    brief. The writer can only produce one by remembering a
                    scene nobody handed it — the thing a continuity budget buys.
  namedMentions     occurrences of any known named character.
  distinctCallbacks how many different such characters appear.

Significance: exact paired permutation over the per-scene means. Five scenes
gives 2^5 = 32 sign assignments, so the smallest attainable two-sided p is
0.0625 — enough to detect a consistent effect, not enough to detect a small
one. That limit is stated rather than hidden.
"""

import json
import pathlib
import re
import sys
from itertools import product

ROOT = pathlib.Path("reports/live/continuity-probe")
CORPUS = pathlib.Path("reports/live/critic-rank-agreement/corpus.json")

# Descriptor words that appear inside `charactersPresent` strings like
# "Old Man at the Well" or "Merchant Yusuf" and are not the character's name.
NOT_NAMES = {"Old", "Man", "Another", "Merchant", "Official", "Trader", "Her",
             "Dying", "Mechanic", "Traveler", "Witness", "Well", "Son", "The", "An"}


def named_characters(corpus):
    names = set()
    for c in corpus:
        for raw in c["sceneBrief"].get("charactersPresent") or []:
            for tok in re.findall(r"\b[A-Z][a-zçğıöşü]{2,}\b", str(raw)):
                if tok not in NOT_NAMES:
                    names.add(tok)
    return names


def brief_names(scene_brief, known):
    out = set()
    for raw in scene_brief.get("charactersPresent") or []:
        for tok in re.findall(r"\b[A-Z][a-zçğıöşü]{2,}\b", str(raw)):
            if tok in known:
                out.add(tok)
    return out


def measure(prose, known, in_brief):
    counts = {n: len(re.findall(rf"\b{re.escape(n)}\b", prose)) for n in known}
    named_mentions = sum(counts.values())
    callback_mentions = sum(v for n, v in counts.items() if n not in in_brief)
    distinct_callbacks = sum(1 for n, v in counts.items() if v and n not in in_brief)
    return named_mentions, callback_mentions, distinct_callbacks


def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def perm_test(diffs):
    """Exact two-sided paired permutation test on the sign of each difference."""
    observed = abs(mean(diffs))
    hits = 0
    total = 0
    for signs in product([1, -1], repeat=len(diffs)):
        total += 1
        if abs(mean([s * d for s, d in zip(signs, diffs)])) >= observed - 1e-12:
            hits += 1
    return hits / total


def load(arm):
    p = ROOT / arm / "summary.json"
    if not p.exists():
        raise SystemExit(f"missing {p} — run ARM={arm} with REPEATS set")
    return json.loads(p.read_text(encoding="utf-8"))


def main():
    arm_a = sys.argv[1] if len(sys.argv) > 1 else "narrow"
    arm_b = sys.argv[2] if len(sys.argv) > 2 else "wide"
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    by_index = {c["index"]: c for c in corpus}
    known = named_characters(corpus)
    print(f"named characters: {sorted(known)}")

    sa, sb = load(arm_a), load(arm_b)
    print(f"repeats per scene: {arm_a}={sa.get('repeats', 1)}  {arm_b}={sb.get('repeats', 1)}\n")

    per_arm = {}
    for arm, s in ((arm_a, sa), (arm_b, sb)):
        by_scene = {}
        for r in s["results"]:
            stem = f"{r['index']:02d}-r{r.get('repeat', 1)}"
            f = ROOT / arm / f"{stem}.prose.txt"
            if not f.exists():
                continue
            prose = f.read_text(encoding="utf-8")
            in_brief = brief_names(by_index[r["index"]]["sceneBrief"], known)
            nm, cm, dc = measure(prose, known, in_brief)
            by_scene.setdefault(r["index"], []).append(
                {"named": nm, "callbacks": cm, "distinct": dc,
                 "words": r["words"], "cited": r["earlierScenesCited"],
                 "ctx": r["contextTokensApprox"]}
            )
        per_arm[arm] = by_scene

    scenes = sorted(set(per_arm[arm_a]) & set(per_arm[arm_b]))
    print(f"{'scene':>5} | {arm_a:^30s} | {arm_b:^30s}")
    print(f"{'':>5} | {'cited':>5} {'callb/rep':>10} {'named/rep':>10} | "
          f"{'cited':>5} {'callb/rep':>10} {'named/rep':>10}")
    metrics = {"callbacks": [], "named": [], "distinct": []}
    for idx in scenes:
        cells = []
        vals = {}
        for arm in (arm_a, arm_b):
            rows = per_arm[arm][idx]
            vals[arm] = {k: mean([r[k] for r in rows]) for k in ("callbacks", "named", "distinct")}
            cells.append(
                f"{mean([r['cited'] for r in rows]):5.0f} "
                f"{vals[arm]['callbacks']:10.1f} {vals[arm]['named']:10.1f}"
            )
        for k in metrics:
            metrics[k].append(vals[arm_b][k] - vals[arm_a][k])
        print(f"{idx:>5} | {cells[0]} | {cells[1]}")

    print()
    for k, diffs in metrics.items():
        p = perm_test(diffs)
        direction = "wider better" if mean(diffs) > 0 else "narrower better" if mean(diffs) < 0 else "no difference"
        print(f"{k:>10}: mean paired diff {mean(diffs):+.2f}  ({direction})  exact p = {p:.4f}")
    print(f"\nFloor on p with {len(scenes)} paired scenes is {2 / 2 ** len(scenes):.4f}.")
    print("A p at or near that floor means consistent direction, not a large effect.")


if __name__ == "__main__":
    main()
