/**
 * Input isolation for the focused critic: each judge sees only the evidence its
 * dimension depends on.
 *
 * Measured on the injected-defect corpus (docs §19): when every focused judge
 * reads the whole scene, one visible flaw drags every dimension down — a scene
 * whose paragraphs were replaced by summary lost 2–3 points on voice, pacing
 * and emotional goal as well as show_tell, so the verdict often NAMED the wrong
 * dimension even though it failed the scene. Asked for evidence, the judge
 * quoted the planted passage for whichever dimension it was asked about: it
 * sees the flaw, it just cannot keep it out of the other questions.
 *
 * So the question is narrowed by what the judge is shown:
 *   - voice reads the dialogue lines alone. Summary and filler contain no
 *     dialogue, so they cannot leak in.
 *   - pacing labels each paragraph ADVANCES / FILLER, so the verdict is a
 *     count of paragraphs with their numbers — evidence the reviser can act on.
 *   - continuity reads the bible's facts and only the sentences that name
 *     someone in it, and every contradiction must quote both sides; code
 *     checks the quotes (§20).
 * show_tell and emotional_goal stay whole-scene: they measured fine that way,
 * and a per-paragraph show/tell label did NOT work (the judge called 84–88% of
 * clean paragraphs "reported").
 */

/**
 * Sampling for judge calls. The Ollama provider always sends the prose
 * defaults — repeat_penalty 1.15 over the last 512 tokens — and a judge's
 * output is not prose: a label array is the same two words repeated, so the
 * penalty pushes the model off "ADVANCES" the further down the list it gets.
 * Measured over all 30 corpus scenes (§20): false FILLER flags on clean prose
 * 32 → 9, clean scenes failing pacing 7/30 → 1/30, padded scenes caught 30/30
 * either way. 1.0 is neutral (llama.cpp applies no penalty).
 */
export const JUDGE_SAMPLING = { repeatPenalty: 1 } as const

/** A line of dialogue: the text inside a quoted span. */
const DIALOGUE = /[“"]([^“”"]{2,})[”"]/g

export function extractDialogueLines(draft: string): string[] {
  const out: string[] = []
  for (const m of String(draft || '').matchAll(DIALOGUE)) {
    const line = m[1].trim()
    if (line) out.push(line)
  }
  return out
}

export function splitParagraphs(draft: string): string[] {
  return String(draft || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Below this many lines there is no voice to judge. Scene 14 of the corpus has
 * two lines of dialogue and was the focused gate's persistent false fail on
 * clean prose (voice 5, and 3 when shown the dialogue alone) — a verdict about
 * a sample too small to carry one.
 */
export const MIN_VOICE_LINES = 6

/**
 * Share of dialogue lines that are distinct. A deterministic guard, not a voice
 * judge: it only catches characters repeating the same line verbatim — which
 * small models do when they loop — and it is free.
 */
export function dialogueDistinctRatio(lines: string[]): number {
  if (!lines.length) return 1
  const norm = (l: string) =>
    l
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  return new Set(lines.map(norm)).size / lines.length
}

/** Under this share of distinct lines, the dialogue is looping. */
export const MIN_DISTINCT_DIALOGUE = 0.6

/**
 * Filler paragraphs → a 1–10 score, so the result slots into `deriveVerdict`
 * with the other dimensions (floor 7). One flagged paragraph passes: clean
 * scenes drew 0–1 flags; three planted fillers drew 2–4.
 */
export function pacingScoreFromFiller(fillerCount: number): number {
  if (fillerCount <= 0) return 8
  return Math.max(1, 9 - 2 * fillerCount)
}

export function buildVoicePrompt({
  lines,
  storyBible,
  charactersPresent,
  rubric
}: {
  lines: string[]
  storyBible: string
  charactersPresent: string[]
  rubric: string
}): string {
  const listing = lines.map((l, i) => `${i + 1}. "${l}"`).join('\n')
  return `Below are ONLY the lines of dialogue from a scene, in order, with the narration removed.
Characters present: ${charactersPresent.join(', ') || '(not listed)'}

CHARACTER DESCRIPTIONS:
${storyBible || '(No story bible)'}

DIALOGUE:
${listing}

Judge VOICE only: do these lines sound like different, specific people, as the descriptions suggest — or could any character have said any line?

SCORING SCALE — use these anchors and nothing else:
${rubric}

Return JSON: { "score": number, "issue": "one sentence, or omit if none" }`
}

export function buildPacingPrompt({
  paragraphs,
  emotionalGoal,
  whatChanges
}: {
  paragraphs: string[]
  emotionalGoal: string
  whatChanges: string
}): string {
  const listing = paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n\n')
  return `SCENE GOAL: ${emotionalGoal || '(not stated)'}
WHAT CHANGES: ${whatChanges || '(not stated)'}

For EACH numbered paragraph, decide: ADVANCES — it moves the plot, reveals character, or raises tension toward the scene's goal; or FILLER — it could be deleted without losing anything the scene needs.

There are ${paragraphs.length} paragraphs. Return exactly ${paragraphs.length} labels, in order.

${listing}

Return JSON: { "labels": [ ... ] }`
}

export function pacingLabelsSchema(count: number) {
  return {
    type: 'object',
    properties: {
      labels: {
        type: 'array',
        items: { type: 'string', enum: ['ADVANCES', 'FILLER'] },
        minItems: count,
        maxItems: count
      }
    },
    required: ['labels']
  }
}

/** 1-based paragraph numbers labelled FILLER. */
export function fillerParagraphs(labels: unknown): number[] {
  if (!Array.isArray(labels)) return []
  return labels.flatMap((l, i) => (l === 'FILLER' ? [i + 1] : []))
}

/**
 * Continuity, isolated: the judge sees the STORY BIBLE's lines as established
 * facts and only the scene sentences that mention a name from the bible, and
 * must return each contradiction as the exact sentence and the exact fact.
 * Code keeps a contradiction only when both are really there
 * (`verifyContradictions`) — evidence the model cannot invent.
 *
 * Measured over 30 scenes (§20): the planted "X had been dead for two years"
 * found 29/30 (the whole-scene judge named it 8/30), 0/30 clean scenes with a
 * verified contradiction, and 6 claims dropped for quoting text that was not
 * there. It also found a real one: committed scene 14 says "since the day Halim
 * died" while the bible has Halim alive.
 */
export const CONTINUITY_SCHEMA = {
  type: 'object',
  properties: {
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { sentence: { type: 'string' }, fact: { type: 'string' } },
        required: ['sentence', 'fact']
      }
    }
  },
  required: ['contradictions']
}

const NAME_STOPWORDS = new Set([
  'Ch',
  'The',
  'She',
  'He',
  'They',
  'A',
  'An',
  'In',
  'On',
  'At',
  'Her',
  'His'
])

/** Capitalised words in the bible: the people and places a sentence can contradict. */
export function bibleNames(bible: string): string[] {
  const found = String(bible || '').match(/\b[A-Z][a-z]{2,}\b/g) || []
  return [...new Set(found.filter((w) => !NAME_STOPWORDS.has(w)))]
}

export function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?”"])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function bibleFacts(bible: string): string[] {
  return String(bible || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Letters and digits only: a quote with a stray comma ("Hal,im") still matches. */
function alnum(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function verifyContradictions(
  claimed: unknown,
  draft: string,
  facts: string[]
): Array<{ sentence: string; fact: string }> {
  if (!Array.isArray(claimed)) return []
  const body = alnum(draft)
  const factKeys = facts.map(alnum).filter(Boolean)
  return claimed.filter((c): c is { sentence: string; fact: string } => {
    const s = alnum(c?.sentence)
    const f = alnum(c?.fact)
    // Short strings match anywhere; demand enough to be a quote.
    if (s.length < 12 || f.length < 8) return false
    return body.includes(s) && factKeys.some((k) => k.includes(f) || f.includes(k))
  })
}

export function buildContinuityPrompt({
  facts,
  sentences
}: {
  facts: string[]
  sentences: string[]
}): string {
  return `ESTABLISHED FACTS (true, do not question them):
${facts.join('\n')}

SENTENCES FROM A NEW SCENE:
${sentences.map((s) => `- ${s}`).join('\n')}

Does any sentence state something that CANNOT be true if the facts are true — a dead character alive or an alive one dead, an event that did not happen, a relationship or debt that is denied?
Differences of detail, new information, and things the facts do not mention are NOT contradictions.

For each real contradiction, copy the sentence EXACTLY and the fact EXACTLY. If there are none, return an empty list.

Return JSON: { "contradictions": [ { "sentence": "...", "fact": "..." } ] }`
}

/**
 * Pacing by two votes (§21). Borderline paragraphs flip under small changes in
 * how the list is presented; planted filler does not. So a failing forward pass
 * is re-asked with the paragraphs in reverse order (which also cancels drift
 * down the list), and the scene fails only when at least one forward flag is
 * confirmed. The rule was chosen on the odd corpus scenes (clean fails 1/15 →
 * 0/15, padded 15/15 kept) and held on the even ones unchanged (1/15 → 0/15,
 * 15/15). The confirming call only happens when the forward pass would fail,
 * so clean prose pays nothing extra.
 */
export function unreverseParagraphNumbers(reversed: number[], count: number): number[] {
  return reversed.map((i) => count + 1 - i).sort((a, b) => a - b)
}

export function pacingVote(
  forward: number[],
  reversed: number[] | null
): { score: number; filler: number[]; confirmed: number[] } {
  const confirmed = reversed ? forward.filter((i) => reversed.includes(i)) : []
  const failing = forward.length >= 2 && confirmed.length >= 1
  return {
    // Unconfirmed flags still pass, as one flagged paragraph always has.
    score: failing
      ? pacingScoreFromFiller(forward.length)
      : pacingScoreFromFiller(Math.min(1, forward.length)),
    filler: forward,
    confirmed
  }
}
