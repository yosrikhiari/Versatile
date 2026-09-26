"""
A second masterpiece control (§33), because the first 12 were used to tune
the within-scene check. Same six public-domain books (already downloaded),
passages chosen mechanically, not by hand: two per book, starting at the
first paragraph of 40+ words at 35% and at 65% through the book, running to
the first paragraph break past ~550 words. No brief beyond the cast; no facts.

    python -X utf8 tools/labelling/build_masterpieces_b.py
    -> reports/live/masterpieces-b/scenes.json
"""
import json
import os
import re
import sys

sys.path.insert(0, "tools/labelling")
from build_masterpieces import RAW, paragraphs  # noqa: E402

BOOKS = [("pg13415", "chekhov"), ("pg4517", "wharton"), ("pg2814", "joyce"),
         ("pg1429", "mansfield"), ("pg1661", "doyle"), ("pg35", "wells")]


def passage(paras, start, min_words=550, max_words=950):
    i = next(k for k in range(start, len(paras)) if len(paras[k].split()) >= 40
             and not re.fullmatch(r"[IVXLC]+\.?|\*+|[A-Z][A-Z ’'.,-]{4,}", paras[k]))
    out, words = [], 0
    for p in paras[i:]:
        if re.fullmatch(r"[IVXLC]+\.?|\*+|[A-Z][A-Z ’'.,-]{4,}", p):
            if out:
                break
            continue
        out.append(p)
        words += len(p.split())
        if words >= min_words:
            break
    while words > max_words and len(out) > 1:
        words -= len(out.pop().split())
    return out


def main():
    scenes = []
    for book, name in BOOKS:
        paras = paragraphs(f"{RAW}/{book}.txt")
        # skip the Gutenberg licence at the end
        end = next((k for k, p in enumerate(paras) if "END OF THE PROJECT GUTENBERG" in p.upper()), len(paras))
        for j, frac in enumerate((0.35, 0.65)):
            ps = passage(paras[:end], int(end * frac))
            prose = "\n\n".join(ps)
            scenes.append({"id": f"{name}-b{j + 1}", "source": "masterpiece-b", "chapter": None,
                           "brief": {"title": f"{name} at {int(frac * 100)}%", "emotionalGoal": "", "whatChanges": "",
                                     "characters": [], "location": ""},
                           "facts": [], "prose": prose, "words": len(prose.split())})
            print(f"{scenes[-1]['id']:14s} {len(ps):3d} ¶ {scenes[-1]['words']:4d} words | {ps[0][:70]}")
    for i, s in enumerate(scenes):
        s["order"] = i + 1
    os.makedirs("reports/live/masterpieces-b", exist_ok=True)
    json.dump({"built": "2026-09-26", "scenes": scenes},
              open("reports/live/masterpieces-b/scenes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
