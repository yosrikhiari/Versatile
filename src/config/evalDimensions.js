import { WORKSPACE_TYPES } from './workspace'

const CONTINUITY_RUBRIC = {
  1: 'Multiple character name/spelling contradictions across scenes; timeline inconsistent',
  2: 'Major timeline contradictions, events in wrong order; setting changes without reason',
  3: 'Setting/location inconsistencies that break immersion; forgotten plot points',
  4: 'Minor plot thread forgotten or contradicted between scenes',
  5: 'Generally consistent with occasional minor oversight affecting comprehension',
  6: 'Consistent with one clear oversight (minor contradiction or dropped thread)',
  7: 'No logical gaps or contradictions; minor inconsistencies that do not affect comprehension',
  8: 'Fully consistent across all dimensions — plot, timeline, setting, characters',
  9: 'Flawless integration of subplots and timeline; subtle callbacks to earlier scenes',
  10: 'Everything perfectly synchronized — continuity enriches the story through foreshadowing and payoff'
}

const VOICE_RUBRIC = {
  1: 'All characters sound identical; no differentiation in dialogue',
  2: 'Dialogue contradicts established character traits/personality from story bible',
  3: 'Character voice wavers inconsistently across the scene',
  4: 'Some differentiation between characters but one or more feel flat',
  5: 'Characters generally distinct but occasional slip into generic voice',
  6: 'Most characters have distinct, consistent voice with minor deviations',
  7: 'Clear differentiation with occasional tonal misstep in one character',
  8: 'Every character has distinct, consistent voice that fits their description',
  9: 'Voices are vivid, unique, and advance characterization with each line',
  10: 'Dialogue unmistakable per character — voice drives plot and character simultaneously'
}

const EMOTIONAL_GOAL_RUBRIC = {
  1: 'Scene evokes the opposite emotion to what the brief requires',
  2: 'Misses the emotional target entirely — no emotional beat present',
  3: 'Emotional beat present but weak and unconvincing',
  4: 'Partially hits target but tone is inconsistent or undercut',
  5: 'Generally hits target but emotional delivery could be stronger',
  6: 'Emotional goal met with some effectiveness; one moment lands',
  7: 'Clearly achieves the intended emotional response without confusion',
  8: 'Powerful emotional delivery that feels well-earned by the scene',
  9: 'Deep emotional resonance that lingers beyond the scene end',
  10: 'Masterful emotional arc — reader feels exactly what was intended, intensely'
}

const SHOW_TELL_RUBRIC = {
  1: 'Pure summary or exposition; no dramatization of any moment',
  2: 'Mostly telling with rare attempts at showing',
  3: 'Heavy telling throughout; few concrete sensory details',
  4: 'More telling than showing; abstract language dominates',
  5: 'Mixed balance — some vivid moments but significant telling patches',
  6: 'Good balance of showing and telling with several weak patches',
  7: 'Mostly showing with appropriate summary for transitions',
  8: 'Effective showing throughout; sensory details create immersion',
  9: 'Vivid sensory writing across sight, sound, touch, smell, taste',
  10: 'Masterful showing — every abstract concept dramatized; none told'
}

const PACING_RUBRIC = {
  1: 'Scene is all filler; nothing advances plot, character, or theme',
  2: 'Extremely rushed (important beats skipped) or painfully slow (overstays)',
  3: 'Pacing problems that significantly affect readability',
  4: 'Uneven pacing — clear drag or rush in multiple sections',
  5: 'Generally adequate pacing with some slow/fast patches',
  6: 'Good rhythm with minor drag or rush in one section',
  7: 'Effective pacing that maintains reader interest throughout',
  8: 'Well-paced with natural rhythm that suits the scene function',
  9: 'Tension expertly modulated — rises and falls at the right moments',
  10: 'Perfect pacing — every sentence earns its place; peak engagement sustained'
}

const CLARITY_RUBRIC = {
  1: 'Text is incomprehensible; sentence structure obscures meaning entirely',
  2: 'Multiple ambiguous phrases; reader cannot determine obligations',
  3: 'Poor sentence structure; defined terms used inconsistently',
  4: 'Several unclear clauses requiring clarification',
  5: 'Generally clear with some ambiguous language',
  6: 'Mostly clear with one unclear section',
  7: 'Clear and precise; minor ambiguity in non-critical section',
  8: 'Precise language; terms used consistently; unambiguous',
  9: 'Exemplary clarity; every obligation precisely stated',
  10: 'Flawless legal drafting — crystal clear through complex provisions'
}

const AMBIGUITY_RUBRIC = {
  1: 'Text open to 3+ reasonable interpretations',
  2: 'Major ambiguity in critical obligation or definition',
  3: '"Reasonable" used without qualification in multiple places',
  4: 'Undefined terms or missing qualifiers creating uncertainty',
  5: 'Minor ambiguity that could be resolved in context',
  6: 'One ambiguous phrase in non-critical section',
  7: 'Generally precise with negligible ambiguity',
  8: 'Language is precise and unambiguous throughout',
  9: 'Exceptionally clear — every term defined, every obligation bounded',
  10: 'No possible alternative interpretation exists'
}

const LIABILITY_RUBRIC = {
  1: 'No indemnification or liability cap present; fully exposed',
  2: 'Missing critical liability protections for major risks',
  3: 'Unbalanced liability caps favoring the wrong party',
  4: 'Missing limitation periods or remedy restrictions',
  5: 'Adequate coverage with gaps in non-critical areas',
  6: 'Liability provisions present but could be stronger',
  7: 'Good liability coverage with minor gaps',
  8: 'Comprehensive liability framework with appropriate caps',
  9: 'Well-balanced liability allocation with clear risk distribution',
  10: 'Optimal liability structure — risks allocated to the responsible party'
}

const MISSING_PROVISION_RUBRIC = {
  1: '4+ standard provisions entirely absent',
  2: 'Major missing provision (governing law, dispute resolution)',
  3: 'Missing multiple standard provisions',
  4: 'One significant provision missing',
  5: 'Missing a minor or non-standard provision',
  6: 'All standard provisions present with minor gap',
  7: 'All provisions present and appropriate',
  8: 'Comprehensive provision coverage for contract type',
  9: 'Exceptionally thorough — anticipates edge cases',
  10: 'Every conceivable provision included without overreach'
}

const ARCHITECTURE_RUBRIC = {
  1: 'Fundamental architectural flaws; components impossibly coupled',
  2: 'No coherent architecture pattern identifiable',
  3: 'Single responsibility violations across multiple components',
  4: 'Architecture mostly sound with clear violation',
  5: 'Reasonable architecture with minor design issues',
  6: 'Good architecture with one questionable decision',
  7: 'Sound architecture following consistent patterns',
  8: 'Well-architected with appropriate separation of concerns',
  9: 'Excellent architecture that elegantly handles complexity',
  10: 'Exemplary — clean layers, proper abstraction, perfect pattern fit'
}

const INTERFACE_RUBRIC = {
  1: 'No interface defined or interface contradicts itself',
  2: 'Critical parameters missing; contract undefined',
  3: 'Response schema incomplete; error handling absent',
  4: 'Interface defined but with significant gaps',
  5: 'Adequate interface with some missing specification',
  6: 'Good interface coverage with minor gaps',
  7: 'Complete interface with clear contracts',
  8: 'Well-documented interface with proper error coverage',
  9: 'Comprehensive interface with versioning consideration',
  10: 'Exemplary API contract — every edge case specified'
}

const SECURITY_RUBRIC = {
  1: 'No security considerations present',
  2: 'Critical vulnerabilities (injection, auth bypass)',
  3: 'Missing authentication/authorization in key areas',
  4: 'Security partial but has clear gaps',
  5: 'Basic security with some missing controls',
  6: 'Good security coverage with minor gaps',
  7: 'Solid security posture with standard protections',
  8: 'Comprehensive security across all layers',
  9: 'Defense-in-depth with proactive security measures',
  10: 'Zero-trust ready — security designed in, not bolted on'
}

const VALIDATION_RUBRIC = {
  1: 'No input validation anywhere',
  2: 'Critical missing validation on user-facing inputs',
  3: 'Boundary conditions not handled',
  4: 'Validation present but inconsistent',
  5: 'Basic validation with gaps in edge cases',
  6: 'Good validation with minor missing cases',
  7: 'Thorough validation across all inputs',
  8: 'Comprehensive validation including business rules',
  9: 'Defense-in-depth validation at multiple layers',
  10: 'Perfect validation — every constraint enforced at every boundary'
}

const VIABILITY_RUBRIC = {
  1: 'No market need; solution looking for a problem',
  2: 'Market need unclear; competition unaddressed',
  3: 'Business model not sustainable or scalable',
  4: 'Viability partially demonstrated with gaps',
  5: 'Reasonable viability with some risk',
  6: 'Good market fit with one significant concern',
  7: 'Clear market need with sustainable business model',
  8: 'Strong competitive position and viable model',
  9: 'Well-differentiated with clear path to scale',
  10: 'Unassailable market position with sustainable advantage'
}

const FINANCIAL_RUBRIC = {
  1: 'No financial projections or cost model',
  2: 'Projections unrealistic or internally contradictory',
  3: 'Unit economics missing or wrong',
  4: 'Cost assumptions unjustified',
  5: 'Reasonable projections with some gaps',
  6: 'Sound financials with minor concerns',
  7: 'Clear projections with justified assumptions',
  8: 'Comprehensive financial model with sensitivity',
  9: 'Detailed unit economics with scenario planning',
  10: 'Investment-grade financial projections'
}

const ASSUMPTIONS_RUBRIC = {
  1: 'Critical assumptions not stated; analysis relies on hidden premises',
  2: 'Assumptions stated but clearly unreasonable',
  3: 'Key risk factors not identified as assumptions',
  4: 'Multiple assumptions lack justification',
  5: 'Assumptions stated but some need stronger backing',
  6: 'Reasonable assumptions with one questionable',
  7: 'Assumptions explicit and generally reasonable',
  8: 'Well-justified assumptions with risk acknowledgment',
  9: 'Assumptions stress-tested with alternative scenarios',
  10: 'All assumptions validated, bounded, and stress-tested'
}

const KPI_CLARITY_RUBRIC = {
  1: 'No KPIs or success metrics defined',
  2: 'Metrics defined without units or measurement method',
  3: 'KPIs are vanity metrics without diagnostic value',
  4: 'Some metrics defined but lagging/leading mix unclear',
  5: 'Basic KPI set with clear definitions',
  6: 'Good KPI selection with minor ambiguity',
  7: 'Clear, measurable KPIs with baseline and target',
  8: 'Comprehensive metric hierarchy from leading to lagging',
  9: 'Metrics tied to specific decisions and thresholds',
  10: 'Perfect KPI framework — diagnostic, predictive, and actionable'
}

const RIGOR_RUBRIC = {
  1: 'No hypothesis stated; no methodology identified',
  2: 'Hypothesis vague; variables not identified',
  3: 'Controls missing or inappropriate',
  4: 'Statistical methodology inappropriate for data',
  5: 'Adequate rigor with some methodological gaps',
  6: 'Good methodology with minor rigor concerns',
  7: 'Sound scientific approach with clear hypothesis',
  8: 'Rigorous methodology with appropriate controls',
  9: 'Well-designed study with validity considerations',
  10: 'Gold-standard rigor — reproducible, controlled, validated'
}

const METHODOLOGY_RUBRIC = {
  1: 'No experimental design described',
  2: 'Method not reproducible from description',
  3: 'Sample size absent or clearly insufficient',
  4: 'Data collection procedure incompletely specified',
  5: 'Adequate methodology with gaps in detail',
  6: 'Good methodology with minor procedure gaps',
  7: 'Clear method description enabling reproduction',
  8: 'Well-documented methodology with justified choices',
  9: 'Comprehensive method with bias mitigation',
  10: 'Exemplary — method, sample, procedure, and bias all addressed'
}

const CITATIONS_RUBRIC = {
  1: 'No citations; unsubstantiated claims throughout',
  2: 'Citations present but irrelevant or outdated',
  3: 'Claims lack citations in critical areas',
  4: 'Citation format inconsistent; some claims unsupported',
  5: 'Adequate citations with some gaps',
  6: 'Good citation coverage with minor missing references',
  7: 'Well-cited with current and relevant references',
  8: 'Comprehensive literature positioning',
  9: 'Excellent coverage with identified gaps in literature',
  10: 'Exhaustive — every claim grounded, gaps explicitly identified'
}

const REPRODUCIBILITY_RUBRIC = {
  1: 'Data/code not available; environment not specified',
  2: 'Parameters insufficiently specified to reproduce',
  3: 'Critical implementation detail missing',
  4: 'Reproducibility possible but difficult without author help',
  5: 'Adequate documentation with some gaps',
  6: 'Mostly reproducible with minor missing detail',
  7: 'Clear reproducibility instructions',
  8: 'Well-documented with data/code availability',
  9: 'Fully reproducible — data, code, environment specified',
  10: 'Reproducible with automated setup scripts and full data'
}

const CREATIVE_DIMENSIONS = {
  continuity: {
    label: 'Continuity',
    description: 'Evaluates story consistency, logical coherence, and absence of contradictions across scenes',
    rubric: CONTINUITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  voice: {
    label: 'Voice',
    description: 'Evaluates character voice authenticity and whether dialogue fits each character\'s established personality',
    rubric: VOICE_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  emotional_goal: {
    label: 'Emotional Goal',
    description: 'Evaluates whether the prose achieves the scene\'s intended emotional target',
    rubric: EMOTIONAL_GOAL_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  show_tell: {
    label: 'Show vs Tell',
    description: 'Evaluates whether prose dramatizes (shows) vs summarizes (tells)',
    rubric: SHOW_TELL_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  pacing: {
    label: 'Pacing',
    description: 'Evaluates narrative pacing — speed, filler content, and rhythm',
    rubric: PACING_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  }
}

const NOVEL_DIMENSIONS = CREATIVE_DIMENSIONS

const LEGAL_DIMENSIONS = {
  clarity: {
    label: 'Clarity',
    description: 'Evaluates whether legal text is clear, precise, and unambiguous',
    rubric: CLARITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  ambiguity: {
    label: 'Ambiguity',
    description: 'Evaluates legal language for multiple interpretations or vague wording',
    rubric: AMBIGUITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  liability: {
    label: 'Liability',
    description: 'Evaluates risk exposure, liability coverage, and indemnification completeness',
    rubric: LIABILITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  missing_provision: {
    label: 'Missing Provision',
    description: 'Evaluates whether necessary legal provisions are absent from the document',
    rubric: MISSING_PROVISION_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  }
}

const TECHNICAL_DIMENSIONS = {
  architecture: {
    label: 'Architecture',
    description: 'Evaluates system architecture soundness, coupling, and design decisions',
    rubric: ARCHITECTURE_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  interface: {
    label: 'Interface',
    description: 'Evaluates API contracts and component interfaces for completeness',
    rubric: INTERFACE_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  security: {
    label: 'Security',
    description: 'Evaluates authentication, authorization, data protection, and vulnerability posture',
    rubric: SECURITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  validation: {
    label: 'Validation',
    description: 'Evaluates input validation, constraint enforcement, and boundary handling',
    rubric: VALIDATION_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  }
}

const BUSINESS_DIMENSIONS = {
  viability: {
    label: 'Viability',
    description: 'Evaluates commercial viability, market positioning, and business model sustainability',
    rubric: VIABILITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  financial: {
    label: 'Financial',
    description: 'Evaluates financial projections, cost models, and ROI analysis',
    rubric: FINANCIAL_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  assumptions: {
    label: 'Assumptions',
    description: 'Evaluates whether underlying business assumptions are realistic and explicit',
    rubric: ASSUMPTIONS_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  },
  kpi_clarity: {
    label: 'KPI Clarity',
    description: 'Evaluates clarity and measurability of KPIs and success metrics',
    rubric: KPI_CLARITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 7
  }
}

const RESEARCH_DIMENSIONS = {
  rigor: {
    label: 'Rigor',
    description: 'Evaluates scientific rigor, hypothesis clarity, and methodological soundness',
    rubric: RIGOR_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  methodology: {
    label: 'Methodology',
    description: 'Evaluates experimental design clarity and reproducibility of method',
    rubric: METHODOLOGY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  citations: {
    label: 'Citations',
    description: 'Evaluates citation quality, relevance, and coverage of existing literature',
    rubric: CITATIONS_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  },
  reproducibility: {
    label: 'Reproducibility',
    description: 'Evaluates whether research can be independently reproduced from documentation',
    rubric: REPRODUCIBILITY_RUBRIC,
    weight: 1.0,
    defaultThreshold: 8
  }
}

export const EVAL_DIMENSIONS = {
  [WORKSPACE_TYPES.CREATIVE]: CREATIVE_DIMENSIONS,
  [WORKSPACE_TYPES.NOVEL]: NOVEL_DIMENSIONS,
  [WORKSPACE_TYPES.LEGAL]: LEGAL_DIMENSIONS,
  [WORKSPACE_TYPES.TECHNICAL]: TECHNICAL_DIMENSIONS,
  [WORKSPACE_TYPES.BUSINESS]: BUSINESS_DIMENSIONS,
  [WORKSPACE_TYPES.RESEARCH]: RESEARCH_DIMENSIONS
}

export function getDimensionsForWorkspace(workspaceType) {
  return EVAL_DIMENSIONS[workspaceType] || CREATIVE_DIMENSIONS
}

export function getDimensionNames(workspaceType) {
  const dims = getDimensionsForWorkspace(workspaceType)
  return Object.keys(dims)
}

export function getDefaultThreshold(workspaceType) {
  const dims = getDimensionsForWorkspace(workspaceType)
  const values = Object.values(dims)
  if (values.length === 0) return 7
  return values.reduce((sum, d) => sum + d.defaultThreshold, 0) / values.length
}
