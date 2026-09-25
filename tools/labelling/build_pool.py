"""
Build the scene pool for the human-labelled test set (§28).

Sources:
  - the 30-scene salt-road corpus (reports/live/critic-rank-agreement/corpus.json)
  - every live book run named below (book.md + plan.json): today's gate on/off,
    repair and langgraph runs (salt road), and the three pool books with other
    premises (harbour, orbit, orchard) written with the gate OFF, so they are
    not pre-filtered by the judge under test

Each scene carries what a labeller needs and what the gate is given: the brief
(emotional goal, cast, what changes) and the facts established in EARLIER
chapters. The order is shuffled with a fixed seed, so books are interleaved
and the order is the same every time the pool is rebuilt.

    python tools/labelling/build_pool.py
    -> reports/live/labelling/scenes.json
"""
import json
import os
import random
import re

ROOT = "reports/live"
OUT_DIR = f"{ROOT}/labelling"
RUNS = ["gate-off-run", "gate-on-run", "repair-run", "graph-repair-run",
        "pool-harbour", "pool-orbit", "pool-orchard"]


def brief_of(b):
    return {
        "title": b.get("title") or "",
        "emotionalGoal": b.get("emotionalGoal") or "",
        "whatChanges": b.get("whatChanges") or b.get("change") or "",
        "characters": b.get("charactersPresent") or b.get("characters") or [],
        "location": b.get("location") or "",
    }


def from_corpus():
    out = []
    for c in json.load(open(f"{ROOT}/critic-rank-agreement/corpus.json", encoding="utf-8")):
        out.append({
            "id": f"salt-corpus-{c['index']:02d}",
            "source": "salt-corpus",
            "chapter": c.get("chapter"),
            "brief": brief_of(c["sceneBrief"]),
            "facts": [l.strip() for l in c["storyBible"].splitlines() if l.strip()],
            "prose": c["draft"].strip(),
        })
    return out


def from_run(run):
    base = f"{ROOT}/{run}"
    if not os.path.exists(f"{base}/book.md"):
        return []
    book = open(f"{base}/book.md", encoding="utf-8").read()
    plan = json.load(open(f"{base}/plan.json", encoding="utf-8"))
    spine = {e["chapterNumber"]: e.get("keyFacts") or [] for e in plan.get("spine") or [] if e}
    briefs = plan.get("scenePlan") or []
    out, chapter, k = [], 0, 0
    # "## Chapter title" then "### Scene title" blocks
    for block in re.split(r"(?m)^(?=#{2,3} )", book):
        if block.startswith("### "):
            title, _, prose = block[4:].partition("\n")
            prose = prose.strip()
            if not prose or k >= len(briefs):
                continue
            facts = [f"Ch{n}: {f}" for n in sorted(spine) if n < chapter for f in spine[n]]
            out.append({
                "id": f"{run}-{k + 1:02d}",
                "source": run,
                "chapter": chapter,
                "brief": {**brief_of(briefs[k]), "title": title.strip()},
                "facts": facts,
                "prose": prose,
            })
            k += 1
        elif block.startswith("## "):
            chapter += 1
    return out


def main():
    pool = from_corpus()
    for run in RUNS:
        got = from_run(run)
        print(f"{run:18s} {len(got)} scenes")
        pool += got
    random.Random(20260925).shuffle(pool)
    for i, s in enumerate(pool):
        s["order"] = i + 1
        s["words"] = len(s["prose"].split())
        s["dialogueLines"] = len(re.findall(r"[“\"][^“”\"]{2,}[”\"]", s["prose"]))
    # The human's share (§28): three of the shortest scenes from each story.
    # All 78 are labelled twice by independent model reviewers; these 12 are
    # the human reference that says whether those labels can stand in.
    def story(sc):
        return "salt" if not sc["source"].startswith("pool-") else sc["source"][5:]
    quick = []
    for st in ["salt", "harbour", "orbit", "orchard"]:
        quick += [sc["id"] for sc in sorted((x for x in pool if story(x) == st), key=lambda x: x["words"])[:3]]
    quick.sort(key=lambda i: next(sc["order"] for sc in pool if sc["id"] == i))
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump({"rubric": "v1", "built": "2026-09-25", "quick": quick, "scenes": pool},
              open(f"{OUT_DIR}/scenes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"pool: {len(pool)} scenes, {sum(s['words'] for s in pool)} words "
          f"-> {OUT_DIR}/scenes.json")


if __name__ == "__main__":
    main()
