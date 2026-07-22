/**
 * Writer persona profiles for fiction generation.
 *
 * Three orthogonal dimensions:
 *  - GENRE: what kind of story (fantasy, scifi, romance, mystery, thriller, literary, horror)
 *  - POV: whose eyes (first-person, second-person, third-limited, third-omniscient)
 *  - TONE: emotional register (light, neutral, dark, humorous, epic)
 *
 * Each dimension produces a targeted instruction block. `buildPersonaBlock`
 * combines the active dimensions into a single prompt section.
 *
 * @module writerPersonas
 */

export const GENRES = ['fantasy', 'scifi', 'romance', 'mystery', 'thriller', 'literary', 'horror']
export const POV_TYPES = ['first-person', 'second-person', 'third-limited', 'third-omniscient']
export const TONES = ['light', 'neutral', 'dark', 'humorous', 'epic']

/**
 * Genre-specific writing guidance.
 * @type {Record<string, string>}
 */
export const GENRE_PROFILES = {
  fantasy: [
    'Make the world feel lived-in — sensory details of magic, architecture, and daily life',
    'Ground fantastical elements in tangible physicality: smell, weight, temperature of magic',
    'Balance wonder with human stakes — the extraordinary matters because ordinary people care about it',
    'Magic should have rules or costs, even if unexplained; avoid deus ex machina',
    'Fantastical creatures and beings have their own cultures, not just monster roles',
    'Prophecy and destiny are tools, not straitjackets — characters still make meaningful choices'
  ].join('\n'),

  scifi: [
    'Ground technology in plausible extrapolation — show how it works through use, not exposition',
    'The science fictional element should reveal something about humanity, not just serve as backdrop',
    'Balance technical vocabulary with accessibility — one unfamiliar term per paragraph maximum',
    'Show societal and ethical implications of technology through character choices',
    'Alien or AI perspectives should feel genuinely different, not humans with strange skin',
    'Avoid infodumps — drip worldbuilding through conflict and character reaction'
  ].join('\n'),

  romance: [
    'Emotional intimacy is the plot — every scene should advance the connection or tension between the central pair',
    'POV matters enormously: stay deep in one perspective per scene to amplify emotional stakes',
    'Chemistry lives in specific, grounded details — a glance held a beat too long, an unexpected kindness',
    'Conflict should be emotional and character-driven, not manufactured misunderstanding',
    'The resolution must feel earned — the obstacles were real and the growth is visible',
    'Sexual tension is about what does not happen as much as what does'
  ].join('\n'),

  mystery: [
    'Plant clues visibly but disguise their significance through context and misdirection',
    'Red herrings must be plausible — they mislead, they do not cheat',
    'The detective/reader should be able to solve it: all necessary information is present by the reveal',
    'Pacing of revelation is critical — too fast loses tension, too slow frustrates',
    'Every character has a reason to hide something, even if unrelated to the central crime',
    'The solution should reframe everything the reader thought they knew about earlier events'
  ].join('\n'),

  thriller: [
    'Every scene must escalate stakes or tighten the clock — no resting pulses',
    'Short scenes, short paragraphs, short sentences during action beats',
    'Danger should feel immediate and physical — proximity, not abstraction',
    'Information asymmetry drives tension: the reader knows more than the protagonist, or less, but never the same',
    'Setbacks are opportunities — every failure raises the cost and narrows the options',
    'The protagonist should be competent but not invulnerable; their skills fail at the worst moment'
  ].join('\n'),

  literary: [
    'Prose is the medium, not just the vehicle — every sentence should reward close reading',
    'Ambiguity is a feature: characters, events, and motivations resist easy judgment',
    'Interiority is primary — external events matter for how they transform inner life',
    'Specificity over generality: concrete, precise details that accumulate into universal resonance',
    'Theme emerges from character and situation, never stated directly',
    'The ordinary contains the extraordinary — find the profound in the everyday'
  ].join('\n'),

  horror: [
    'Dread is built slowly and paid off suddenly — atmosphere before the scare',
    'Violation of safety: the horror happens in places the reader thought were safe',
    'The unseen is more terrifying than the revealed — show carefully, imply generously',
    'Psychological horror cuts deeper than physical: fear of what you might become, what you might do',
    'Gore without emotional context is numbing; gore with emotional context is unbearable',
    'The monster/villain should have an internal logic, even if inhuman — chaos is less frightening than purpose'
  ].join('\n')
}

/**
 * POV-specific writing guidance.
 * @type {Record<string, string>}
 */
export const POV_PROFILES = {
  'first-person': [
    'The narrator can only know what they personally experience or have learned',
    'Their voice IS the prose — word choice, rhythm, and digressions reveal personality',
    'They can be unreliable: their interpretation of events may differ from objective reality',
    'Physical descriptions of the narrator should be sparse and contextual — they do not describe themselves unprompted',
    'Internal monologue is natural and expected in this mode',
    'Emotions are felt and narrated, not observed from outside'
  ].join('\n'),

  'second-person': [
    'You are the protagonist — every sentence addresses the reader directly',
    'The effect is immersive and immediate: the reader cannot be a passive observer',
    'Use imperative and present tense for maximum immediacy',
    'Balance direct address with enough narrative framing to avoid gimmickry',
    'Best suited to intense, intimate, or experimental storytelling',
    'The "you" should have a consistent character — it is a persona, not a blank slate'
  ].join('\n'),

  'third-limited': [
    'Stay locked in one character\'s perspective per scene — no head-hopping',
    'The reader knows only what the POV character perceives, feels, and learns',
    'Filtering language ("he noticed", "she saw", "he felt") creates distance — prefer direct sensory presentation',
    'The POV character\'s voice should color the narration subtly — word choice, preoccupations, blind spots',
    'Emotional states should be shown through physical sensation and action, not named directly',
    'The narrator can infer but not confirm what other characters think or feel'
  ].join('\n'),

  'third-omniscient': [
    'The narrator has access to any character\'s thoughts, feelings, and history',
    'Use this power deliberately — shifting POV within a scene should serve a purpose',
    'The narrator can have a distinct voice and make commentary on events',
    'Be explicit when shifting between character perspectives to avoid confusion',
    'Omniscience does not mean equal attention — focalize through one or two characters per scene',
    'The narrator can reveal information no character knows, creating dramatic irony'
  ].join('\n')
}

/**
 * Tone matrix — how the emotional register shapes prose and story.
 * @type {Record<string, string>}
 */
export const TONE_MATRIX = {
  light: [
    'The world is fundamentally benevolent — setbacks are temporary, not devastating',
    'Warmth and optimism color the narration even during conflict',
    'Humor arises naturally from character and situation, not forced wit',
    'Relationships tend toward connection and reconciliation',
    'Prose feels airy — shorter sentences, brighter sensory details, hopeful closings',
    'The ending should leave the reader with a sense of earned comfort'
  ].join('\n'),

  neutral: [
    'Events are presented with emotional even-handedness',
    'The narration does not editorialize — let events speak for themselves',
    'Tone shifts naturally to match scene content without stylistic forcing',
    'Neither optimistic nor cynical; the world is what it is',
    'Prose is transparent and workmanlike — it serves the story, not itself',
    'Appropriate for genre fiction where plot and character carry the weight'
  ].join('\n'),

  dark: [
    'The world is dangerous and indifferent — trust is costly, safety is illusory',
    'Moral complexity is the default: difficult choices with no good options',
    'Violence and cruelty have real weight and consequence, never gratuitous',
    'Hopeful moments are rare and therefore more powerful',
    'Prose carries weight — longer shadows, heavier sensory details, slower pacing for dread',
    'The ending may be ambiguous or costly, but should feel true to the world established'
  ].join('\n'),

  humorous: [
    'Comic timing matters — setup, delay, punchline, even in narrative prose',
    'Humor should arise from character and situation, not narrator aside',
    'Dialogue is a primary vehicle for wit — banter, misdirection, callback',
    'Even serious moments can have a wry edge — humor as emotional range, not tonal break',
    'Prose is agile — quick cuts, playful word choices, unexpected juxtapositions',
    'The humor should never undermine genuine emotional stakes when they matter'
  ].join('\n'),

  epic: [
    'The stakes are civilization-scale or existential — the outcome shapes the world',
    'Language rises to match the scale: elevated register, rhythmic prose, deliberate cadence',
    'Characters are aware they are part of something larger than themselves',
    'Set pieces and pivotal moments deserve extended, ceremonial treatment',
    'Prose has weight and momentum — longer sentences, cumulative detail, mythic resonance',
    'The ending should feel like history turning'
  ].join('\n')
}

/**
 * Build a formatted persona instruction block from genre, POV, and tone.
 *
 * @param {object} options
 * @param {string} [options.genre] - Story genre key
 * @param {string} [options.pov] - POV type key
 * @param {string} [options.tone] - Tone key
 * @returns {string} Formatted persona block (empty string if all dimensions are empty)
 */
export function buildPersonaBlock({ genre, pov, tone }) {
  const parts = []

  if (genre && GENRE_PROFILES[genre]) {
    parts.push(`## GENRE: ${genre.toUpperCase()}\n${GENRE_PROFILES[genre]}`)
  }

  if (pov && POV_PROFILES[pov]) {
    parts.push(`## POINT OF VIEW: ${pov}\n${POV_PROFILES[pov]}`)
  }

  if (tone && TONE_MATRIX[tone]) {
    parts.push(`## TONE: ${tone.toUpperCase()}\n${TONE_MATRIX[tone]}`)
  }

  if (parts.length === 0) return ''

  return `\n## WRITER PERSONA\n${parts.join('\n\n')}\n`
}
