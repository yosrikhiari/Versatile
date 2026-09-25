"""
Known-good controls: 12 scenes from public-domain masterpieces (§30).

The real-scene test (§29) left one question open: are the reviewers right, or
just harsh? Published literary prose is the control. A judge or rubric that
fails Chekhov for "telling" is miscalibrated. Passages are contiguous, start at
a scene break, and run to the first paragraph break past ~550 words. Each gets
the same brief shape as a generated scene (goal, cast) and no prior facts.

Source: Project Gutenberg plain text (public domain), downloaded with the
user's OK to reports/live/masterpieces/raw/ (gitignored).

    python tools/labelling/build_masterpieces.py
    -> reports/live/masterpieces/scenes.json  (same shape as the labelling pool)
"""
import json
import re

RAW = "reports/live/masterpieces/raw"

# (id, gutenberg file, start phrase, title, emotional goal, cast, genre)
PASSAGES = [
    ("chekhov-lady-01", "pg13415", "was said that a new person had appeared",
     "The Lady with the Dog (opening)", "Reader senses a jaded man's idle curiosity turning into something he does not expect.",
     ["Gurov", "Anna Sergeyevna"], "literary"),
    ("chekhov-family-01", "pg13415", "after losing heavily at cards",
     "The Head of the Family", "Reader feels the petty tyranny of a man souring his family's breakfast.",
     ["Zhilin", "his wife", "Fedya"], "family"),
    ("wharton-frome-01", "pg4517", "The village lay under two feet of snow",
     "Ethan Frome (Mattie at the dance)", "Reader feels Ethan's longing and his fear of losing Mattie.",
     ["Ethan Frome", "Mattie Silver"], "literary"),
    ("wharton-frome-02", "pg4517", "They walked on in silence through the blackness",
     "Ethan Frome (walking home)", "Reader feels a fragile, unspoken closeness under constant threat.",
     ["Ethan Frome", "Mattie Silver"], "literary"),
    ("joyce-eveline-01", "pg2814", "She sat at the window watching the evening invade",
     "Eveline", "Reader feels a young woman torn between escape and duty.",
     ["Eveline"], "family"),
    ("joyce-araby-01", "pg2814", "North Richmond Street, being blind",
     "Araby", "Reader feels a boy's secret, consuming infatuation.",
     ["the narrator", "Mangan's sister"], "literary"),
    ("mansfield-party-01", "pg1429", "And after all the weather was ideal",
     "The Garden Party (morning)", "Reader feels the excitement and class awkwardness of a family party.",
     ["Laura", "Mrs. Sheridan", "the workmen"], "family"),
    ("mansfield-party-02", "pg1429", "There’s been a horrible accident,” said Cook",
     "The Garden Party (the news)", "Reader feels the collision of a festive mood with a death nearby.",
     ["Laura", "Jose", "Mrs. Sheridan"], "family"),
    ("doyle-scandal-01", "pg1661", "To Sherlock Holmes she is always",
     "A Scandal in Bohemia (opening)", "Reader feels intrigue as an old friendship resumes around a mystery.",
     ["Watson", "Sherlock Holmes"], "crime"),
    ("doyle-league-01", "pg1661", "I had called upon my friend, Mr. Sherlock Holmes, one day in the autumn",
     "The Red-Headed League", "Reader feels amused curiosity at a strange case.",
     ["Watson", "Sherlock Holmes", "Jabez Wilson"], "crime"),
    ("wells-time-01", "pg35", "The Time Traveller (for so it will be convenient",
     "The Time Machine (the argument)", "Reader feels intellectual excitement and skepticism.",
     ["the Time Traveller", "Filby", "the Psychologist"], "scifi"),
    ("wells-time-02", "pg35", "So I travelled, stopping ever and again",
     "The Time Machine (the end of the world)", "Reader feels awe and dread at the dying Earth.",
     ["the Time Traveller"], "scifi"),
]


def paragraphs(path):
    text = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    return [p for p in paras if p]


def extract(paras, start, min_words=550, max_words=950):
    i = next((k for k, p in enumerate(paras) if start in p), None)
    if i is None:
        raise ValueError(f"start phrase not found: {start!r}")
    out, words = [], 0
    for p in paras[i:]:
        if re.fullmatch(r"[IVXLC]+\.?|\*+|[A-Z][A-Z ’'.,-]{4,}", p):  # section numerals, headings
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
    cache = {}
    for sid, book, start, title, goal, cast, genre in PASSAGES:
        paras = cache.setdefault(book, paragraphs(f"{RAW}/{book}.txt"))
        ps = extract(paras, start)
        prose = "\n\n".join(ps)
        scenes.append({
            "id": sid, "source": f"masterpiece-{genre}", "chapter": None,
            "brief": {"title": title, "emotionalGoal": goal, "whatChanges": "", "characters": cast, "location": ""},
            "facts": [], "prose": prose, "words": len(prose.split()),
            "dialogueLines": len(re.findall(r"[“\"][^“”\"]{2,}[”\"]", prose)),
        })
        print(f"{sid:20s} {len(ps):3d} ¶ {scenes[-1]['words']:4d} words  {scenes[-1]['dialogueLines']:3d} dialogue  | {ps[0][:60]}")
    for i, s in enumerate(scenes):
        s["order"] = i + 1
    json.dump({"rubric": "v1", "built": "2026-09-25", "scenes": scenes},
              open("reports/live/masterpieces/scenes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
