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

/**
 * One entry per speech. A speech interrupted by a tag ("You carry enough," he
 * said, "but leave some behind.") is one speech: a fragment that ends in a
 * comma or dash continues into the next quoted fragment of the SAME paragraph,
 * across a short tag (a new paragraph is a new speaker). Counted as fragments, a scene of
 * four speeches reached MIN_VOICE_LINES and was judged, and failed, on voice
 * (repair-run-04, §32); 8 of 78 pool scenes were over the line only by
 * fragments, all of them voice-fine to both reviewers.
 */
export function extractDialogueLines(draft: string): string[] {
  const text = String(draft || '')
  const out: string[] = []
  let continues = false
  let lastEnd = 0
  for (const m of text.matchAll(DIALOGUE)) {
    const line = m[1].trim()
    if (!line) continue
    const start = m.index ?? 0
    const between = text.slice(lastEnd, start)
    const sameSpeech = continues && out.length && between.length <= 80 && !/\n\s*\n/.test(between)
    if (sameSpeech) out[out.length - 1] += ` ${line}`
    else out.push(line)
    continues = /[,—–-]$/.test(line)
    lastEnd = start + m[0].length
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
  // Accented capitals too: "Élodie" is a name the facts use (§31).
  const found =
    String(bible || '').match(/(?<![\p{L}\p{N}])[A-ZÀ-Ý][a-zà-ÿ]{2,}(?![\p{L}\p{N}])/gu) || []
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
 * Scene continuity by claims (§31). The one-shot prompt above found 0 of the 9
 * story-fact contradictions two reviewers marked in real scenes, because most
 * of them are ASSUMED, not stated: "It hadn't been warm since the day Halim
 * died" never says "Halim is dead". So the check runs in three narrow steps,
 * each one a question a small model answers reliably:
 *
 *   1. extract: every fact each sentence states or takes for granted
 *   2. match:   which claims cannot be true if the facts are true
 *   3. confirm: per (sentence, fact) -- the facts are the story SO FAR; a
 *               scene may show a change, not assume one the story never told
 *
 * On the bench (tools/judge-bench): 3/9 reviewer problems caught (the old
 * check: 0/9), 0/29 false alarms on reviewer-fine scenes with facts, 4/10
 * planted contradictions it was not tuned on, and every flag on the planted
 * sentence itself. Low recall, high precision: a false alarm costs a rewrite.
 */
export const CLAIMS_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        properties: {
          s: { type: 'integer' },
          about: { type: 'string' },
          claim: { type: 'string' }
        },
        required: ['s', 'about', 'claim']
      }
    }
  },
  required: ['claims']
}

export interface SceneClaim {
  s: number
  about: string
  claim: string
}

export function buildClaimsPrompt(sentences: string[]): string {
  return `Below are the numbered sentences of one scene.

For each sentence that states OR TAKES FOR GRANTED a checkable fact, write the fact as a short plain claim:
- whether someone is alive or dead, conscious, injured
- where someone or something is, who is present
- what has already happened, what someone already knows or has
- the physical state of an object (open/closed, lit/dark, full/empty)
Include facts a sentence only assumes: "The kettle had stayed cold since the winter Marek drowned" -> "Marek is dead"; "She paid back what she owed Anya" -> "She owed Anya a debt".
A fact inside a thought, feeling or memory is still a fact: "She wondered why the letter Piet sent her was unsigned" -> "Piet sent her a letter". Write each fact as its own claim, stripped of the feeling around it.
Skip mood, description, similes, opinions and anything uncheckable. Several claims per sentence are fine; most sentences have none.

${sentences.map((s, i) => `[${i + 1}] ${s}`).join('\n')}

"about" names the one person or thing the claim is about, always spelled the same way ("the guard", "Marek", "the lantern").

Return JSON: { "claims": [ { "s": sentence number, "about": "...", "claim": "..." } ] }`
}

/** Claims with a sentence number that exists and a non-empty text. */
export function validClaims(parsed: unknown, sentenceCount: number): SceneClaim[] {
  const claims = (parsed as { claims?: unknown })?.claims
  if (!Array.isArray(claims)) return []
  return claims.filter(
    (c): c is SceneClaim =>
      Number.isInteger(c?.s) &&
      c.s >= 1 &&
      c.s <= sentenceCount &&
      typeof c?.claim === 'string' &&
      c.claim.trim().length > 0
  )
}

export const FACT_HITS_SCHEMA = {
  type: 'object',
  properties: {
    hits: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        properties: { claim: { type: 'integer' }, fact: { type: 'string' } },
        required: ['claim', 'fact']
      }
    }
  },
  required: ['hits']
}

export function buildFactHitsPrompt(facts: string[], claims: SceneClaim[]): string {
  return `ESTABLISHED FACTS (true):
${facts.join('\n')}

CLAIMS from a new scene:
${claims.map((c, i) => `[${i + 1}] ${c.claim}`).join('\n')}

Which claims CANNOT be true if the facts are true (a dead character alive or an alive one dead, an event that did not happen, a denied relationship or debt)? New information and details the facts do not mention are NOT contradictions.
Copy the fact exactly. If none, return an empty list.

Return JSON: { "hits": [ { "claim": claim number, "fact": "..." } ] }`
}

/**
 * Hits → (sentence, fact, claim) candidates. The fact must be one of the facts
 * (matched on letters and digits, as `verifyContradictions` does), and each
 * (sentence, fact) pair is kept once, so it is confirmed once.
 */
export function claimHitsToCandidates(
  parsed: unknown,
  claims: SceneClaim[],
  sentences: string[],
  facts: string[]
): Array<{ sentence: string; fact: string; claim: string }> {
  const hits = (parsed as { hits?: unknown })?.hits
  if (!Array.isArray(hits)) return []
  const out: Array<{ sentence: string; fact: string; claim: string }> = []
  const seen = new Set<string>()
  for (const h of hits) {
    const claim = Number.isInteger(h?.claim) ? claims[h.claim - 1] : undefined
    const f = alnum(h?.fact)
    const fact =
      f.length >= 8 ? facts.find((k) => alnum(k).includes(f) || f.includes(alnum(k))) : undefined
    if (!claim || !fact) continue
    const sentence = sentences[claim.s - 1]
    const key = `${sentence}\u0000${fact}`
    if (!sentence || seen.has(key)) continue
    seen.add(key)
    out.push({ sentence, fact, claim: claim.claim })
  }
  return out
}

export const FACT_CONFIRM_SCHEMA = {
  type: 'object',
  properties: { contradicts: { type: 'boolean' } },
  required: ['contradicts']
}

/**
 * The confirming question. Asked as "can both be true?" of a Chapter 1 fact
 * ("Halim is alive") and a later claim ("Halim is dead"), the model answers
 * yes -- he could have died since. The facts are the story so far, so the
 * question is whether the scene assumes a change the story never told. A
 * reasoning-first variant caught more (5/9 vs 3/9 on probe pairs) but raised
 * false alarms from 0/8 to 2/8, and was not adopted.
 */
export function buildFactConfirmPrompt(fact: string, claim: string, sentence: string): string {
  return `ESTABLISHED (true as of the story so far; nothing told since has changed it):
${fact}

NEW SCENE, one sentence: ${sentence}
What that sentence says or assumes: ${claim}

A new scene may add details the story has not mentioned, and may SHOW something change within the scene itself. It may not assume, as already having happened, a change the story never told (a death, a sale, a debt paid or reversed), and may not state the opposite of what is established.
Does the sentence contradict what is established?

Return JSON: { "contradicts": true or false }`
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

/**
 * The chapter audit, isolated (§23). `checkContradictions` drives the
 * chapter-boundary audit, whose findings trigger rewrites. Measured on the 30
 * corpus scenes against their ledgers (`auditFalseAlarm.live.js`) it accused
 * 10/30 clean scenes (26 accusations, every one read false: "collapsed under
 * the salt in Ch2, which contradicts carrying it later") and named the planted
 * "dead two years" in 1/30. The isolated checker on the same scenes: 0/30 and
 * 30/30.
 *
 * A scene is checked only against facts from EARLIER chapters: a fact from
 * later ("Ch9: Halim dies") would make every earlier "Halim is alive" look
 * like a contradiction. Facts without a chapter tag always apply.
 */
export function factsBeforeChapter(ledger: string[], chapterNumber: number | null): string[] {
  if (chapterNumber == null || !Number.isFinite(chapterNumber)) return ledger
  return ledger.filter((line) => {
    const m = /^Ch(\d+)\s*:/.exec(line)
    return !m || Number(m[1]) < chapterNumber
  })
}

/**
 * Verified contradictions → the report shape the audit already consumes.
 * `between` carries the scene's own sentence, which `planConsistencyFixes`
 * matches back to exactly the scene that must be rewritten.
 */
/** One finding in the audit's report shape (`planConsistencyFixes` reads it). */
export interface AuditContradiction {
  type: string
  description: string
  between: string[]
}

export function contradictionsToReport(
  found: Array<{ sentence: string; fact: string }>,
  names: string[]
): {
  characterIssues: Array<{ character: string; contradictions: AuditContradiction[] }>
  locationIssues: Array<{ location: string; contradictions: AuditContradiction[] }>
} {
  const byName = new Map<string, AuditContradiction[]>()
  for (const c of found) {
    const name = names.find((n) => c.sentence.includes(n)) || names[0] || 'Story'
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name)!.push({
      type: 'fact',
      description: `"${c.sentence}" contradicts the established fact "${c.fact}"`,
      between: [c.sentence, c.fact]
    })
  }
  return {
    characterIssues: [...byName.entries()].map(([character, contradictions]) => ({
      character,
      contradictions
    })),
    locationIssues: []
  }
}

/**
 * Check the checker (§23, DeepSeekMath-V2's meta-verification). A quoted pair
 * can be real text on both sides and still not be a contradiction: the audit
 * flagged "Halim warns her about the salt's strange properties" against
 * "Halim warns her of its unnatural qualities" — a paraphrase that AGREES.
 * Each verified pair gets one yes/no question; only "cannot both be true"
 * survives. Asked only for flagged pairs, so clean prose pays nothing.
 */
export const CONFIRM_SCHEMA = {
  type: 'object',
  properties: { bothCanBeTrue: { type: 'boolean' } },
  required: ['bothCanBeTrue']
}

export function buildConfirmPrompt(sentence: string, fact: string): string {
  return `STATEMENT A (an established fact): ${fact}
STATEMENT B (from a new scene): ${sentence}

Can A and B both be true in the same story? A statement that repeats, paraphrases, adds detail to, or agrees with the other CAN be true alongside it. Answer false only if believing B means A must be false.

Return JSON: { "bothCanBeTrue": true or false }`
}

/**
 * Repair in place (§25). The gate names exactly what is wrong for two
 * dimensions: pacing (the confirmed filler paragraphs) and continuity (the
 * contradicting sentence and the fact it breaks). When those are the ONLY
 * failing dimensions, the scene can be fixed by cutting the paragraphs and
 * rewriting the sentences, instead of writing the whole scene again. Measured
 * on 30 scenes: padded scenes passed after the cut 27/30, cutting 6 real
 * paragraphs against 69 planted; contradiction scenes passed after one
 * sentence rewrite 29/30.
 *
 * Returns null when anything else failed, or when the evidence is missing —
 * those go back to the writer as before.
 */
export interface RepairPlan {
  cut: number[]
  rewrites: Array<{ sentence: string; fact: string }>
}

export function planRepair(
  verdict: {
    dimensionScores?: Record<string, number | null> | null
    issues?: Array<{
      type?: string
      paragraphs?: number[]
      evidence?: Array<{ sentence: string; fact: string }>
    }>
    advisoryDimensions?: readonly string[] | null
  } | null,
  minDimension: number
): RepairPlan | null {
  if (!verdict?.dimensionScores) return null
  // Advisory dimensions do not fail the scene, so they are not repaired
  // either; one would otherwise veto the repair of a real failure (§31).
  const advisory = new Set(verdict.advisoryDimensions || [])
  const failing = Object.entries(verdict.dimensionScores)
    .filter(([k, v]) => !advisory.has(k) && typeof v === 'number' && v < minDimension)
    .map(([k]) => k)
  if (!failing.length) return null
  const issues = verdict.issues || []
  const plan: RepairPlan = { cut: [], rewrites: [] }
  for (const dim of failing) {
    const issue = issues.find((i) => i?.type === dim)
    if (dim === 'pacing' && issue?.paragraphs?.length) plan.cut.push(...issue.paragraphs)
    else if (dim === 'continuity' && issue?.evidence?.length) plan.rewrites.push(...issue.evidence)
    else return null
  }
  return plan
}

/**
 * Apply a plan to the prose: paragraphs are numbered the way the critic
 * numbered them (`splitParagraphs`), each sentence is replaced where it
 * stands. A sentence no longer present is skipped, not guessed at.
 */
export function applyRepair(
  prose: string,
  cut: number[],
  replacements: Array<{ sentence: string; replacement: string }>
): string {
  let paras = splitParagraphs(prose).filter((_, i) => !cut.includes(i + 1))
  for (const r of replacements) {
    paras = paras
      .map((p) => (p.includes(r.sentence) ? p.replace(r.sentence, r.replacement).trim() : p))
      .filter(Boolean)
  }
  return paras.join('\n\n')
}

export const SENTENCE_REPAIR_SCHEMA = {
  type: 'object',
  properties: { sentence: { type: 'string' } },
  required: ['sentence']
}

export function buildSentenceRepairPrompt(sentence: string, fact: string): string {
  return `This sentence from a scene contradicts an established fact of the story.

FACT: ${fact}
SENTENCE: ${sentence}

Rewrite ONLY this sentence so it no longer contradicts the fact. Keep its place in the scene, its voice and length; change as little as possible. If the sentence cannot be saved, return an empty string to delete it.

Return JSON: { "sentence": "the rewritten sentence, or empty" }`
}
