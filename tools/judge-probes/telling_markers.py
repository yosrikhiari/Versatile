"""
Is there a cheap, deterministic signal for telling? (§27 probe, no model calls)

Writing craft says telling leaves fingerprints: an emotion named outright
("she was afraid", "he felt angry") and filter verbs that report perception or
thought instead of showing it ("she realized", "she noticed", "he knew that").
Count them per 100 words in: clean paragraphs, the faithful-summary paragraphs
that replace them (told_faithful), and planted filler.

    python tools/judge-probes/telling_markers.py
"""
import json, re, statistics as st

corpus = json.load(open("reports/live/critic-rank-agreement/corpus.json", encoding="utf-8"))
faithful = json.load(open("reports/live/judge-probes/told-faithful.json", encoding="utf-8"))
FILLERS = [
    "The light was the light of late afternoon, lying across everything in the ordinary way light does at that hour, neither bright nor dim. The air held the temperature it had held for some time. Nothing about the hour was remarkable.",
    "Somewhere behind them a bird made the noise birds make. The ground underfoot was the same ground it had been for an hour, and would be for another. A cart passed on the far road and had nothing to do with any of this.",
    "Dust moved when the wind moved and settled when it stopped. The shadows had lengthened by the amount shadows lengthen. No one said anything, and nothing required saying.",
]

EMOTIONS = r"(afraid|scared|frightened|terrified|angry|furious|sad|unhappy|happy|glad|relieved|anxious|nervous|worried|uneasy|ashamed|guilty|jealous|lonely|hopeful|hopeless|desperate|determined|resolved|confused|curious|suspicious|grateful|bitter|calm|tense|frustrated|overwhelmed|exhausted|shocked|surprised|horrified|disgusted|proud|embarrassed|excited|dread|fear|anger|grief|sorrow|joy|shame|guilt|relief|resentment|despair|unease|apprehension|resolve|determination)"
PATTERNS = {
    # "she was afraid", "he felt a surge of anger", "feeling uneasy"
    "named_emotion": re.compile(r"\b(was|were|is|are|felt|feel|feels|feeling|grew|became|seemed)\s+(a\s+|an\s+|so\s+|very\s+|deeply\s+|suddenly\s+|(a\s+)?(surge|wave|sense|pang|flicker|rush)\s+of\s+)?" + EMOTIONS + r"\b", re.I),
    # filter verbs that report cognition/perception
    "filter_verb": re.compile(r"\b(realized|realised|understood|knew that|wondered|decided|noticed|thought that|felt that|sensed that|recognized)\b", re.I),
}


def paragraphs(t):
    return [p.strip() for p in re.split(r"\n\s*\n", t) if p.strip()]


def rate(text):
    words = max(1, len(text.split()))
    return {k: 100 * len(p.findall(text)) / words for k, p in PATTERNS.items()}


def summarize(name, texts):
    rs = [rate(t) for t in texts]
    tot = [r["named_emotion"] + r["filter_verb"] for r in rs]
    print(f"{name:32s} n={len(texts):4d}  named_emotion/100w {st.mean(r['named_emotion'] for r in rs):.2f}  "
          f"filter_verb/100w {st.mean(r['filter_verb'] for r in rs):.2f}  any>0 {sum(t > 0 for t in tot)}/{len(tot)}")
    return tot


clean_paras, replaced_orig, summaries = [], [], []
for c in corpus:
    ps = re.split(r"\n\s*\n", c["draft"])
    targets = [p for i, p in enumerate(ps) if i % 2 == 0 and len(p) > 200]
    replaced_orig += targets
    clean_paras += [p.strip() for p in ps if p.strip()]
    summaries += faithful.get(str(c["index"])) or []

print("per paragraph:")
summarize("clean paragraphs (all)", clean_paras)
summarize("originals that got replaced", replaced_orig)
summarize("faithful summaries (telling)", summaries)
summarize("planted filler", FILLERS)

# scene level: does the told_faithful version score above its own clean scene?
wins, deltas = 0, []
for c in corpus:
    sums = faithful.get(str(c["index"]))
    if not sums:
        continue
    k, out = 0, []
    for i, p in enumerate(re.split(r"\n\s*\n", c["draft"])):
        if i % 2 == 0 and len(p) > 200 and k < len(sums):
            out.append(sums[k]); k += 1
        else:
            out.append(p)
    a = sum(rate(c["draft"]).values())
    b = sum(rate("\n\n".join(out)).values())
    deltas.append(b - a)
    wins += b > a
print(f"\nscene level: telling version has MORE markers per 100 words than its clean scene in {wins}/{len(deltas)} scenes "
      f"(mean +{st.mean(deltas):.2f}/100w)")
