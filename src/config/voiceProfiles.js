/**
 * Voice profiles for fiction writing.
 * Each profile encodes a distinct stylistic register with prose rules,
 * sensory priorities, dialogue approach, and pacing defaults.
 *
 * @module voiceProfiles
 */

/** @typedef {import('./voiceProfiles').VoiceProfile} VoiceProfile */

/**
 * @typedef {Object} VoiceProfile
 * @property {string} name - Profile key
 * @property {string} voice - Voice instruction text for the AI
 * @property {string} styleGuide - Condensed style guide (2-4 paragraphs)
 * @property {string[]} proseRules - Specific prose rules (5-8)
 * @property {string[]} forbidden - Patterns to avoid (3-5)
 * @property {string} sentenceRhythm - Expected sentence rhythm description
 * @property {string[]} sensoryPriority - Ordered sensory channels
 * @property {string} dialogueStyle - Dialogue approach description
 * @property {string} pacing - Default pacing description
 * @property {string} register - Literary register category
 */

export const VOICE_PROFILES = {
  literary: {
    name: 'literary',
    voice: `Write in third person limited, deep POV. Past tense. Use rich, layered prose with extended interiority. Favor complex sentences with embedded clauses where rhythm allows. Show emotional states through physical sensation and action, not direct statement. Vary sentence length dramatically — clipped and breathless during tension, flowing and expansive during reflection. Philosophical reflection is welcome when it arises naturally from character. Use specific, concrete nouns. Avoid filtering language ("he noticed", "she saw", "he felt"). Let the physical world reflect internal states — temperature, weight, texture as emotional metaphor.`,
    styleGuide: `Write literary fiction with deep third-person limited POV. Sentences should vary from fragmentary (under 5 words during tension) to long and flowing (30+ words during reflection). Prioritize physical sensation — temperature, pressure, kinesthetic awareness — over visual description. Emotional states emerge through bodily experience and action, never named directly. Use subtext in every line of dialogue; characters under stress never say what they mean. Specific, concrete nouns over general ones. Avoid all filtering and explanatory summary. Each scene needs an auditory detail and a tactile detail. The first sentence creates forward motion or tension; the last leaves something unresolved or changed.`,
    proseRules: [
      'Show emotional states through physical sensation and action, never direct naming',
      'Vary sentence length dramatically — short during tension, long during reflection',
      'Use subtext in all dialogue — characters never say exactly what they mean',
      'Every scene must include at least one auditory and one tactile detail',
      'Avoid filtering language: "he noticed", "she saw", "he felt", "she realized"',
      'Let setting and weather reflect character emotional state',
      'Specific beats generic: "the crack in the windshield" over "the damaged car"',
      'End each scene with something unresolved or changed'
    ],
    forbidden: [
      'Direct emotional statements: "she felt angry", "he was sad"',
      'Filtering verbs that distance the reader from the POV',
      'Explanatory summary that tells what a character learned rather than dramatizing discovery',
      'Generic or category nouns where specific ones are available',
      'Overused literary crutch words: "somehow", "perhaps", "almost", "seemed"'
    ],
    sentenceRhythm: 'Dramatic variation — clipped fragments under 5 words during tension, flowing sentences of 30+ words during reflection. Caesura and interruption for distress. Parallel structure for building intensity.',
    sensoryPriority: ['physical sensation', 'temperature', 'sight', 'sound', 'smell'],
    dialogueStyle: 'Subtext-driven. Characters under emotional pressure never state their real meaning. Dialogue is an oblique dance — what is not said matters more than what is. Action beats preferred over tags, but simple "said" is invisible and acceptable.',
    pacing: 'Variable, scene-determined. Reflection scenes move at contemplative pace with extended description. Tension scenes are clipped, breathless, with shorter paragraphs and more white space.',
    register: 'literary'
  },

  pulp: {
    name: 'pulp',
    voice: `Write in third person limited. Past tense. Fast-paced, immediate, action-forward. Short declarative sentences. Minimal interiority — show motivation through action, not thought. Sensory priority: sight first, then physical sensation, then sound. "Show, don't tell" but compressed — one vivid detail instead of three. Use "said" exclusively for dialogue tags. Action beats preferred. Keep paragraphs short — three sentences max in action sequences. Every scene needs forward momentum. End chapters on cliffhangers or reversals.`,
    styleGuide: `Write genre fiction with relentless momentum. Short declarative sentences. One vivid sensory detail per beat — never two or three. Dialogue tagged only with "said"; action beats preferred. Paragraphs are short, especially in action sequences where one sentence can stand alone. Interiority is minimal — a character's state is revealed by what they do, not what they think. Sight leads every sensory beat; follow with physical sensation, then sound if needed. Chapters must end on a hook, reversal, or unanswered question. Momentum is the only law; if a sentence slows the reader down, cut it.`,
    proseRules: [
      'Short declarative sentences — one idea per sentence',
      'One vivid detail per beat, never more',
      'Dialogue tags: "said" only, or use action beats',
      'Maximum three sentences per paragraph in action scenes',
      'Show motivation through action, not interior thought',
      'Every scene begins with forward motion',
      'End every chapter on a hook, reversal, or cliffhanger',
      'Cut any sentence that does not increase momentum'
    ],
    forbidden: [
      'Long or meandering sentences that slow pace',
      'Extended interior monologue or philosophical reflection',
      'Multiple qualifying details where one vivid detail suffices',
      'Dialogue tags beyond "said" — no "whispered", "hissed", "murmured"',
      'Passive construction that kills immediacy'
    ],
    sentenceRhythm: 'Staccato and driving. Most sentences under 15 words. Hard stops. Fragments for impact. Short paragraphs create a fast, breathless rhythm that pulls the reader forward.',
    sensoryPriority: ['sight', 'physical sensation', 'sound'],
    dialogueStyle: 'Lean and functional. "Said" only. Action beats to break up exchanges and reveal character through gesture. No lengthy speeches — information is parceled out across the scene. Conflict in every exchange.',
    pacing: 'Fast by default. Action sequences use very short paragraphs (1-2 sentences). Even reflective beats move at a clip — no passage lingers longer than it earns.',
    register: 'genre'
  },

  minimalist: {
    name: 'minimalist',
    voice: `Write in third person limited. Past tense. Austere, stripped down. Short sentences. Repetition for effect. Much left unsaid. Heavily rely on subtext and implication. Use sparse sensory detail — only what is essential. Interiority is fragmented, implied, never explained. Eliminate all adjectives and adverbs that are not structurally necessary. Every word must earn its place. The power is in what is withheld. Trust the reader to infer. End scenes on silence or implication, not explanation.`,
    styleGuide: `Write in a Hemingway-esque register. Short, declarative sentences. Repetition of key words and phrasings for cumulative effect. No adjectives that do not do essential work. No adverbs. Interiority is never explained — it emerges from what characters do, where they look, what they do not say. Sensory detail is sparse and chosen for maximum weight. Silence and pause are tools. Dialogue is terse, often with characters not responding directly. The emotional charge lives in the gap between what is said and what is meant. End on implication, not resolution.`,
    proseRules: [
      'Every word must earn its place — eliminate anything non-essential',
      'No adjectives or adverbs that are not structurally necessary',
      'Repetition of key words for cumulative effect',
      'Interiority is implied through action and gesture, never explained',
      'Dialogue is terse — characters often do not answer directly',
      'End scenes on silence, implication, or what is withheld',
      'Use short, declarative sentences as default'
    ],
    forbidden: [
      'Explanatory interiority: "he thought about", "she remembered when"',
      'Ornamental adjectives or decorative description',
      'Adverbs of any kind',
      'Emotional named directly — show only through what can be observed',
      'Summary or conclusion — trust the reader to infer'
    ],
    sentenceRhythm: 'Steady, declarative, repetitive. Most sentences are subject-verb-object, 5-12 words. Repetition of sentence openings for hypnotic effect. Sudden shorter sentences for impact. Variation is rare and therefore powerful.',
    sensoryPriority: ['sight', 'physical sensation', 'sound'],
    dialogueStyle: 'Terse to the point of bluntness. Characters speak in short bursts. Non-responses and silences are meaningful. No exposition through dialogue. What characters do between lines often matters more than the lines themselves.',
    pacing: 'Deliberate and measured. The stripped-down prose paradoxically creates a slower reading experience because every word carries weight. White space is used generously.',
    register: 'literary'
  },

  conversational: {
    name: 'conversational',
    voice: `Write in first-person or close third person. Past tense. Warm, accessible, intimate. Colloquial register that sounds like a natural storyteller. Natural speech rhythms — contractions, sentence fragments, occasional direct address to the reader. Emotional states can be named but should also be shown through relatable behavior. Sensory detail through everyday, familiar anchors — the smell of coffee, the weight of keys in a pocket. Accessible vocabulary. Dialogue should sound like real people talking — interruptions, overlapping, unfinished sentences welcome.`,
    styleGuide: `Write accessible fiction with a warm, conversational register. First-person or very close third person. The narrator sounds like someone telling a story to a friend — contractions, natural digressions, direct address ("you know how it is when..."). Emotional states can be named directly but gain power when shown through relatable behavior. Sensory detail uses everyday anchors — familiar, grounded, never obscure. Dialogue sounds genuinely spoken: interruptions, fragments, overlapping, unfinished sentences. Vocabulary stays within an accessible range. The prose is intimate and confiding, never distant or clinical.`,
    proseRules: [
      'Use contractions and natural speech rhythms',
      'Emotional states can be named but prefer showing through relatable behavior',
      'Sensory detail through familiar, everyday anchors',
      'Dialogue should include interruptions, fragments, overlapping speech',
      'Direct address to reader is occasionally welcome',
      'Keep vocabulary accessible — no obscure or academic words',
      'Write as if telling a story to a friend over coffee'
    ],
    forbidden: [
      'Stiff or formal register that breaks the intimate tone',
      'Overwritten sensory detail or obscure references',
      'Long, winding sentences without natural pause points',
      'Academic vocabulary or literary pretension',
      'Distance between narrator and reader — no cold observation'
    ],
    sentenceRhythm: 'Natural speech cadence. Mixture of short and medium sentences. Occasional fragments for emphasis. Runs-on for breathless or excited passages. The rhythm follows the breath of a person talking.',
    sensoryPriority: ['physical sensation', 'sight', 'sound', 'smell', 'taste'],
    dialogueStyle: 'Natural and unvarnished. People interrupt each other, trail off, talk over one another. Realistic filler and hesitation where appropriate. Dialogue reveals personality through word choice and rhythm, not just content.',
    pacing: 'Easy and engaging. The pace moves at a natural storytelling clip — faster for dramatic beats, slower for reflective or intimate moments. Never rushed, never dragging.',
    register: 'accessible'
  },

  atmospheric: {
    name: 'atmospheric',
    voice: `Write in third person limited. Past tense. Sensory-rich, immersive, slow-burn. Extended passages of setting and mood. Temperature and smell lead every scene before sight and sound. Use nature and environment as an emotional mirror for character state. Long paragraphs with cumulative sensory detail. The physical world is not backdrop — it is a participant. Gothic register. Slow pacing is the default; let the reader live inside the atmosphere before plot advances. Emotion emerges from environment — a character's state is revealed by how they perceive the world around them.`,
    styleGuide: `Write gothic and literary prose where atmosphere is primary. Every scene begins with sensory grounding — temperature and smell establish mood before visual or auditory detail. Long paragraphs build through cumulative specificity: one detail leads to the next, creating a texture that envelops the reader. The natural world mirrors emotional states: weather as mood, architecture as psyche, landscape as memory. Pacing is deliberately slow — let the reader inhabit the atmosphere before advancing plot. Interiority emerges through how the character perceives their environment, not through direct introspection. The goal is immersion so complete the reader forgets they are reading.`,
    proseRules: [
      'Open every scene with sensory grounding — temperature and smell first',
      'Nature and environment function as emotional mirror for character',
      'Long paragraphs of cumulative sensory detail',
      'Pacing is slow by default — let atmosphere breathe before advancing plot',
      'Emotion emerges from how character perceives environment, not direct introspection',
      'Gothic register — use the weight of history, architecture, and landscape',
      'One sensory detail leads naturally to the next in an unfolding chain'
    ],
    forbidden: [
      'Fast pacing that does not earn atmospheric immersion',
      'Generic setting description that could belong to any place',
      'Interiority separated from environment — character feeling in a vacuum',
      'Short, utilitarian paragraphs that break the immersive texture',
      'Modern or clinical language that breaks the gothic register'
    ],
    sentenceRhythm: 'Languid and cumulative. Sentences are generally long (20-40+ words), building through clauses and sensory layering. Short sentences are rare and land with heavy impact. Paragraphs are extended — sometimes half a page or more.',
    sensoryPriority: ['temperature', 'smell', 'sound', 'sight', 'physical sensation'],
    dialogueStyle: 'Sparse and weighted. Dialogue is infrequent — the environment speaks first. When characters speak, their words carry atmospheric weight. Silence is as meaningful as speech. Dialogue is often oblique, colored by mood and setting.',
    pacing: 'Slow by design. Atmosphere takes precedence over plot advancement. Scenes unfold at the pace of lived experience — time passes as it would in the world described. Fast pacing only in moments of crisis, and even then, the atmosphere remains.',
    register: 'literary'
  }
}

/**
 * Resolve a voice profile by name.
 * @param {string} profileName - One of 'literary', 'pulp', 'minimalist', 'conversational', 'atmospheric'
 * @param {string} [fallbackInstruction] - Fallback voice instruction if profile is not found
 * @returns {{ profile: VoiceProfile|null, voiceInstruction: string, styleGuide: string }}
 */
export function getVoiceProfile(profileName, fallbackInstruction) {
  const profile = VOICE_PROFILES[profileName]

  if (profile) {
    return {
      profile,
      voiceInstruction: profile.voice,
      styleGuide: profile.styleGuide
    }
  }

  return {
    profile: null,
    voiceInstruction: fallbackInstruction || '',
    styleGuide: ''
  }
}
