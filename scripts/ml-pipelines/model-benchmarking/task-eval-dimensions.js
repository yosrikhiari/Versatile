const CREATIVITY_RUBRIC = {
  1: 'Output is generic, clichéd, or completely unoriginal — no novel ideas present',
  2: 'Derivative concepts with minimal original thought or perspective',
  3: 'One mildly original element buried under conventional ideas',
  4: 'Some creative elements but overall predictable or formulaic',
  5: 'Adequate creativity — some original ideas mixed with familiar patterns',
  6: 'Solid creative thinking with at least one genuinely novel angle',
  7: 'Clear creative spark — ideas feel fresh and thoughtfully developed',
  8: 'Original and imaginative — concepts show depth and unexpected connections',
  9: 'Highly inventive — pushes boundaries of the domain with novel framing',
  10: 'Breakthrough creativity — ideas are surprising, original, and instantly compelling'
}

const RELEVANCE_RUBRIC = {
  1: 'Completely off-topic; fails to address the brief in any way',
  2: 'Tangential response that barely relates to the prompt',
  3: 'Partial relevance — addresses secondary aspects but misses the core ask',
  4: 'Mostly relevant but has significant digressions',
  5: 'Generally on-topic with some loosely related content',
  6: 'Good relevance with minor tangents that dont detract',
  7: 'Focused response that addresses the brief directly',
  8: 'Highly relevant — every part of the output serves the prompt',
  9: 'Perfect alignment with the brief; anticipates unstated needs',
  10: 'Exemplary relevance — precisely targets the prompt with zero drift'
}

const CLARITY_RUBRIC = {
  1: 'Incomprehensible — ideas buried in confusing structure or prose',
  2: 'Very difficult to follow; major organizational problems',
  3: 'Multiple confusing passages that obscure meaning',
  4: 'Somewhat unclear — needs re-reading in places',
  5: 'Generally clear with occasional vagueness',
  6: 'Mostly clear with minor ambiguities',
  7: 'Clear and well-structured; easy to follow',
  8: 'Very clear with logical flow and precise language',
  9: 'Exceptionally clear — complex ideas made simple',
  10: 'Masterful clarity — instantly understandable and perfectly structured'
}

const CONTINUITY_RUBRIC = {
  1: 'No connection to the provided context or synopsis',
  2: 'Contradicts established details from the synopsis',
  3: 'Multiple logical gaps or inconsistencies with context',
  4: 'Some inconsistencies that break immersion',
  5: 'Generally consistent with occasional minor oversight',
  6: 'Mostly consistent with one clear oversight',
  7: 'Consistent with context; no logical contradictions',
  8: 'Fully consistent and builds logically on the synopsis',
  9: 'Seamless integration with context — enriches the source material',
  10: 'Perfect continuity — every detail aligns and builds meaningfully'
}

const VOICE_RUBRIC = {
  1: 'No discernible voice or personality; purely mechanical',
  2: 'Inconsistent tone that detracts from the content',
  3: 'Voice present but flat or generic',
  4: 'Adequate voice but lacking distinctiveness',
  5: 'Clear voice with some character or personality',
  6: 'Good voice that fits the content and audience',
  7: 'Strong, distinctive voice; engaging and appropriate',
  8: 'Compelling voice that enhances the content significantly',
  9: 'Masterful voice — authentic, memorable, and perfectly calibrated',
  10: 'Iconic voice — immediately recognizable and perfectly suited to purpose'
}

const STRUCTURE_RUBRIC = {
  1: 'No discernible structure; ideas randomly ordered',
  2: 'Poor organization that impedes comprehension',
  3: 'Structure present but illogical for the content type',
  4: 'Adequate structure with some organizational issues',
  5: 'Reasonable structure that serves the content',
  6: 'Good structure with clear sections and flow',
  7: 'Well-organized with logical progression',
  8: 'Excellent structure that enhances readability',
  9: 'Superior structure — every section in its optimal position',
  10: 'Perfect architecture — structure elevates content to its full potential'
}

const COMPLETENESS_RUBRIC = {
  1: 'Barely begins the requested output',
  2: 'Significant portions of expected content missing',
  3: 'Covers some but not all required aspects',
  4: 'Missing one major expected section or element',
  5: 'Covers the basics with some gaps',
  6: 'Good coverage with minor omissions',
  7: 'Complete — covers all requested elements',
  8: 'Thorough — covers all elements with appropriate depth',
  9: 'Comprehensive — exceeds expectations on depth and breadth',
  10: 'Definitive — exhaustive coverage with no meaningful gaps'
}

const IMPROVEMENT_RUBRIC = {
  1: 'Rewritten version is worse than the original',
  2: 'Minor improvements but new issues introduced',
  3: 'Some improvements but misses the core problems',
  4: 'Adequate improvement in some areas, no change in others',
  5: 'Moderate improvement over the original',
  6: 'Clear improvement across most dimensions',
  7: 'Significant improvement — better in every relevant way',
  8: 'Major improvement — substantially elevates the quality',
  9: 'Transformative improvement — unrecognizably better',
  10: 'Perfect execution — every weakness addressed, no new issues'
}

const FIDELITY_RUBRIC = {
  1: 'Changes meaning or intent of the original',
  2: 'Alters key details or introduces inaccuracies',
  3: 'Multiple fidelity breaks in critical sections',
  4: 'Some fidelity concerns — loses nuance or detail',
  5: 'Generally faithful with minor deviations',
  6: 'Mostly faithful — preserves intent and key details',
  7: 'Faithful to the originals meaning and intent',
  8: 'High fidelity — preserves nuance and specific details',
  9: 'Perfect fidelity while improving expression',
  10: 'Absolute fidelity — every meaningful detail preserved and enhanced'
}

const CONCISION_RUBRIC = {
  1: 'Rewritten version is longer and less clear',
  2: 'No meaningful reduction in length',
  3: 'Minor cutting but retains significant redundancy',
  4: 'Some concision achieved but not proportionate to effort',
  5: 'Moderate reduction with some retained verbosity',
  6: 'Good concision — meaningful cuts without loss',
  7: 'Significantly tighter with no loss of content',
  8: 'Highly concise — every word earns its place',
  9: 'Masterful concision — density without sacrifice',
  10: 'Maximum density — minimum words, maximum signal'
}

const SPARK_DIMENSIONS = {
  creativity: {
    label: 'Creativity',
    description: 'Evaluates originality, novelty, and imaginative quality of ideas',
    rubric: CREATIVITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  relevance: {
    label: 'Relevance',
    description: 'Evaluates how well the output addresses the specific prompt and context',
    rubric: RELEVANCE_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  clarity: {
    label: 'Clarity',
    description: 'Evaluates how clearly and accessibly ideas are communicated',
    rubric: CLARITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  }
}

const STORY_DIMENSIONS = {
  continuity: {
    label: 'Continuity',
    description: 'Evaluates logical consistency and connection to provided context/synopsis',
    rubric: CONTINUITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  voice: {
    label: 'Voice',
    description: 'Evaluates narrative voice, tone appropriateness, and stylistic quality',
    rubric: VOICE_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  structure: {
    label: 'Structure',
    description: 'Evaluates organizational quality, flow, and structural coherence',
    rubric: STRUCTURE_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  completeness: {
    label: 'Completeness',
    description: 'Evaluates thoroughness and coverage of the requested output',
    rubric: COMPLETENESS_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  }
}

const POLISH_DIMENSIONS = {
  improvement: {
    label: 'Improvement',
    description: 'Evaluates degree of quality improvement from original to revised version',
    rubric: IMPROVEMENT_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  fidelity: {
    label: 'Fidelity',
    description: 'Evaluates preservation of original meaning, intent, and key details',
    rubric: FIDELITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  concision: {
    label: 'Concision',
    description: 'Evaluates reduction of redundancy and density of signal',
    rubric: CONCISION_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  }
}

export const TASK_EVAL_DIMENSIONS = {
  SPARK: SPARK_DIMENSIONS,
  STORY: STORY_DIMENSIONS,
  POLISH: POLISH_DIMENSIONS
}

export function getDimensionsForTaskType(taskType) {
  return TASK_EVAL_DIMENSIONS[taskType] || null
}
