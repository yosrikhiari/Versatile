"""
G-Eval / DeepSeek-GRM style probe on the focused gate.

Same 4 scenes x 5 variants as gateSensitivity.live.js, same focused prompt
shape as useStoryCritic.focusedCritique. One call per (scene, variant, dim)
with logprobs: the sampled integer is what production sees today; the
probability-weighted expected score (sum p(d) * d over digit tokens) is the
G-Eval score, which equals the mean of infinitely many sampled votes.

Question: does the expected score separate defects from clean prose better
than the integer does, and does it remove the knife-edge false fails at 7?
"""
import json, math, re, sys, time, urllib.request

HOST = "http://localhost:11434"
MODEL = "qwen3:8b"
CORPUS = "reports/live/critic-rank-agreement/corpus.json"
SCENES = [8, 14, 20, 26]
DIMS = ["continuity", "voice", "emotional_goal", "show_tell", "pacing"]
OUT = sys.argv[1]

corpus = {c["index"]: c for c in json.load(open(CORPUS, encoding="utf-8"))}

DIALOGUE = re.compile(r'[“"][^“”"]{4,}[”"]')
SUMMARIES = [
    "She dealt with the matter at hand, and her feelings about it were the ones the situation called for.",
    "The exchange went the way such exchanges go, and by its end the position of each party was understood.",
    "What needed saying was said, more or less, and the consequences settled where consequences settle.",
    "The business of the hour was transacted without incident worth recording here.",
    "Whatever had been unresolved between them moved one notch toward resolution.",
    "The moment passed, having accomplished roughly what it needed to accomplish.",
]
FILLERS = [
    "The light was the light of late afternoon, lying across everything in the ordinary way light does at that hour, neither bright nor dim. The air held the temperature it had held for some time. Nothing about the hour was remarkable.",
    "Somewhere behind them a bird made the noise birds make. The ground underfoot was the same ground it had been for an hour, and would be for another. A cart passed on the far road and had nothing to do with any of this.",
    "Dust moved when the wind moved and settled when it stopped. The shadows had lengthened by the amount shadows lengthen. No one said anything, and nothing required saying.",
]


def voice_flatten(p, bible):
    return "\n".join(DIALOGUE.sub('"We should keep moving," ', l, count=1) if DIALOGUE.search(l) else l for l in p.split("\n"))


def told(p, bible):
    paras, k, out = re.split(r"\n\s*\n", p), 0, []
    for i, x in enumerate(paras):
        if i % 2 == 0 and len(x) > 200:
            out.append(SUMMARIES[k % len(SUMMARIES)]); k += 1
        else:
            out.append(x)
    return "\n\n".join(out)


def padding(p, bible):
    paras, out, k = re.split(r"\n\s*\n", p), [], 0
    for i, x in enumerate(paras):
        out.append(x)
        if i == 0 or i == len(paras) // 2 or i == len(paras) - 2:
            out.append(FILLERS[k % 3]); k += 1
    return "\n\n".join(out)


def contradiction(p, bible):
    m = re.search(r"\b(Nesrin|Halim|Ahmed|Yusuf|Kemal|Idris)\b", bible)
    name = m.group(1) if m else "Halim"
    paras = re.split(r"\n\s*\n", p)
    paras.insert(max(1, len(paras) // 2), f"{name} had been dead for two years by then, buried past the salt flats, and everyone on the road knew it. No debt had ever passed between them.")
    return "\n\n".join(paras)


DEFECTS = {"control": (None, lambda p, b: p), "voice_flatten": ("voice", voice_flatten),
           "told_not_shown": ("show_tell", told), "padding": ("pacing", padding),
           "contradiction": ("continuity", contradiction)}

RUBRIC = {
    "continuity": {1: "Multiple character name/spelling contradictions across scenes; timeline inconsistent", 3: "Setting/location inconsistencies that break immersion; forgotten plot points", 5: "Generally consistent with occasional minor oversight affecting comprehension", 7: "No logical gaps or contradictions; minor inconsistencies that do not affect comprehension", 9: "Flawless integration of subplots and timeline; subtle callbacks to earlier scenes", 10: "Everything perfectly synchronized — continuity enriches the story through foreshadowing and payoff"},
    "voice": {1: "All characters sound identical; no differentiation in dialogue", 3: "Character voice wavers inconsistently across the scene", 5: "Characters generally distinct but occasional slip into generic voice", 7: "Clear differentiation with occasional tonal misstep in one character", 9: "Voices are vivid, unique, and advance characterization with each line", 10: "Dialogue unmistakable per character — voice drives plot and character simultaneously"},
    "emotional_goal": {1: "Scene evokes the opposite emotion to what the brief requires", 3: "Emotional beat present but weak and unconvincing", 5: "Generally hits target but emotional delivery could be stronger", 7: "Clearly achieves the intended emotional response without confusion", 9: "Deep emotional resonance that lingers beyond the scene end", 10: "Masterful emotional arc — reader feels exactly what was intended, intensely"},
    "show_tell": {1: "Pure summary or exposition; no dramatization of any moment", 3: "Heavy telling throughout; few concrete sensory details", 5: "Mixed balance — some vivid moments but significant telling patches", 7: "Mostly showing with appropriate summary for transitions", 9: "Vivid sensory writing across sight, sound, touch, smell, taste", 10: "Masterful showing — every abstract concept dramatized; none told"},
    "pacing": {1: "Scene is all filler; nothing advances plot, character, or theme", 3: "Pacing problems that significantly affect readability", 5: "Generally adequate pacing with some slow/fast patches", 7: "Effective pacing that maintains reader interest throughout", 9: "Tension expertly modulated — rises and falls at the right moments", 10: "Perfect pacing — every sentence earns its place; peak engagement sustained"},
}
FRAMING = {
    "continuity": "The STORY BIBLE below is established fact. Prose that contradicts it — a character who is dead, a debt that never existed — is a continuity failure however well written.",
    "voice": "Judge whether the characters sound like different people, and like the people the STORY BIBLE describes.",
    "show_tell": "Judge dramatisation against summary. A paragraph that reports what happened instead of enacting it is telling.",
    "pacing": "Judge whether every passage earns its place. Material that advances neither plot, character nor tension is filler.",
    "emotional_goal": "Judge the scene against the emotional goal in its brief, and nothing else.",
}


def scene_block(s, draft):
    b = s["sceneBrief"]
    return f"""SCENE BRIEF:
- Title: {b['title']}
- Emotional goal: {b['emotionalGoal']}
- Characters present: {', '.join(b['charactersPresent'])}
- Payoff: {b['payoff']}
- Tension: {b['tension']}

CHAPTER LOG (previous events):
(First scene)

EXISTING ENTITIES CONTEXT:
(No existing entities)

STORY BIBLE (character descriptions for voice check):
{s['storyBible']}

DRAFT TEXT:
{draft}
"""


def prompt(dim, s, draft):
    rub = "\n".join(f"  {k} = {v}" for k, v in RUBRIC[dim].items())
    return f"""Judge ONE aspect of this scene: {dim}.

{FRAMING[dim]}

SCORING SCALE — use these anchors and nothing else:
{dim}:
{rub}

If the scene is weak on this aspect, say so — a middling default is worse than
an honest low mark. Name the problem in "issue" only if there is one.

{scene_block(s, draft)}

Return JSON: {{ "score": number, "issue": "one sentence, or omit if none" }}"""


SCHEMA = {"type": "object", "properties": {"score": {"type": "integer", "minimum": 1, "maximum": 10}, "issue": {"type": "string"}}, "required": ["score"]}


def call(dim, s, draft):
    body = {"model": MODEL, "stream": False, "think": False, "format": SCHEMA, "keep_alive": "30m",
            "logprobs": True, "top_logprobs": 10,
            "options": {"temperature": 0.3, "num_ctx": 8192, "num_predict": 300},
            "messages": [{"role": "system", "content": f"You are a story editor judging exactly one aspect of a scene: {dim}. You judge that aspect and nothing else, and you are willing to mark it low."},
                         {"role": "user", "content": prompt(dim, s, draft)}]}
    req = urllib.request.Request(HOST + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=600))
    content = r["message"]["content"]
    score = json.loads(content)["score"]
    lps = r.get("logprobs") or []
    # find the first token that is a digit (the score); "10" may tokenise as "1","0"
    ev, dist = None, None
    for i, t in enumerate(lps):
        tok = t["token"].strip()
        if tok and tok[0].isdigit():
            dist = {}
            for alt in t.get("top_logprobs", []):
                a = alt["token"].strip()
                if a.isdigit() and 1 <= int(a) <= 10:
                    dist[int(a)] = dist.get(int(a), 0) + math.exp(alt["logprob"])
            z = sum(dist.values())
            if z > 0:
                ev = sum(k * v for k, v in dist.items()) / z
                dist = {k: round(v / z, 3) for k, v in sorted(dist.items())}
            break
    return score, ev, dist, len(lps)


