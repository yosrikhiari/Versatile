import { EVAL_GATE_CONFIG } from '../config/evalGateConfig'
import { DEFINITION_OF_MASTERPIECE } from '../config/definitionOfMasterpiece'
import { getDimensionNames } from '../config/evalDimensions'
import { useStoryCritic } from '../composables/useStoryCritic'

export function countWords(text: string) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Words remaining after duplicate sentences are removed.
 *
 * A model stuck in a loop produces MORE words, not fewer, so a raw word-count
 * gate rewards the worst failure it can see. Measured on a live run: a scene
 * whose closing sentence repeated 131 times counted 1,866 words against a 1,200
 * target and passed comfortably, while its genuine content was 575 words — 52%
 * of target. The healthiest scene in the same run was the one closest to being
 * flagged as too short. Counting unique content instead of tokens makes the gate
 * measure what the author actually receives.
 */
export function countUniqueWords(text: string) {
  if (!text) return 0
  const seen = new Set<string>()
  const kept: string[] = []
  for (const raw of text.split(/(?<=[.!?])\s+/)) {
    const sentence = raw.trim()
    if (!sentence) continue
    const key = sentence.toLowerCase().replace(/\s+/g, ' ')
    // Very short fragments ("Yes.", "He ran.") legitimately recur in dialogue,
    // so they are never treated as padding.
    if (key.split(' ').length >= 5) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    kept.push(sentence)
  }
  return countWords(kept.join(' '))
}

/** Share of the text that is duplicated sentences, 0..1. */
export function duplicateRatio(text: string) {
  const total = countWords(text)
  if (total === 0) return 0
  return Math.max(0, 1 - countUniqueWords(text) / total)
}

/**
 * Above this, the prose is padded rather than written. Deliberate refrain and
 * repeated dialogue beats live comfortably below it; a decoding loop does not.
 */
export const MAX_DUPLICATE_RATIO = 0.15

export function gateDimensionCoverage(critiqueResult: any, workspaceType: string) {
  const cfg = EVAL_GATE_CONFIG.dimensionCoverage
  if (!cfg.enabled) return { pass: true, failOn: 'none', missing: [], warnings: [] }

  const expectedDims = getDimensionNames(workspaceType)
  if (!expectedDims || expectedDims.length === 0)
    return { pass: true, failOn: 'none', missing: [], warnings: [] }

  const issues = critiqueResult?.issues || []
  const coveredDims = new Set(issues.map((i: { type: string }) => i.type))
  const missing = expectedDims.filter((d: string) => !coveredDims.has(d))
  const warnings = missing.map(
    (d: string) => `Dimension "${d}" has no issues — evaluation may lack coverage`
  )

  return {
    pass: missing.length === 0 || cfg.strict === false,
    failOn: cfg.failOn || 'warn',
    missing,
    warnings
  }
}

export function gateScoreDistribution(critiqueResult: any) {
  const cfg = EVAL_GATE_CONFIG.scoreDistribution
  if (!cfg.enabled) return { pass: true, failOn: 'none', flags: [] }

  if (!critiqueResult) return { pass: true, failOn: cfg.failOn || 'warn', flags: [] as string[] }

  // Skip score distribution check if evaluation was unavailable
  if (critiqueResult.evalUnavailable)
    return { pass: true, failOn: cfg.failOn || 'warn', flags: [] as string[] }

  const flags: string[] = []

  // A missing score is a missing score, not a score of -1. The old `?? -1`
  // sentinel was reported to the user as "Score -1 is outside expected range
  // [1-10]", which reads like the critic judged the prose catastrophically bad
  // when in fact it never produced a number at all — and -1 then propagated into
  // dimension averaging.
  if (critiqueResult.score == null) {
    return {
      pass: false,
      failOn: cfg.failOn || 'warn',
      flags: ['Critic returned no score — evaluation did not produce a usable verdict']
    }
  }

  const score = critiqueResult.score

  const [min, max] = cfg.suspectScoreRange || [1, 10]
  if (score < min || score > max) {
    flags.push(`Score ${score} is outside expected range [${min}-${max}]`)
  }

  if (score === cfg.suspectScore) {
    flags.push(`Score equals suspect value ${cfg.suspectScore} (possible default fallback)`)
  }

  const issues = critiqueResult?.issues || []
  const majorIssues = issues.filter((i: { severity: string }) => i.severity === 'major')
  if (score >= 9 && majorIssues.length > 2) {
    flags.push(`High score (${score}) with ${majorIssues.length} major issues — possible mismatch`)
  }
  // Zero issues is the signal; the score is not. This used to require
  // `score >= cfg.suspectScore` (7), so a critic returning 6.8 with no issues on
  // every fixture in the suite — six of six, which is what a non-discriminating
  // critic looks like — slipped under the one check written to catch it.
  if (issues.length === 0) {
    flags.push(
      `Score ${score} with zero issues — possible degenerate evaluation (the critic found nothing at all)`
    )
  }

  return {
    pass: flags.length === 0,
    failOn: cfg.failOn || 'warn',
    flags
  }
}

export async function gateRevisionEffectiveness(
  originalCritique: any,
  revisionDraft: string,
  originalDraft: string,
  revisionCritiqueResult: any
) {
  const cfg = EVAL_GATE_CONFIG.revisionEffectiveness
  if (!cfg.enabled) return { pass: true, failOn: 'none', delta: 0, regressions: [] }

  const regressions = []

  if (revisionDraft === originalDraft) {
    const hadIssues = (originalCritique?.issues || []).length > 0
    if (hadIssues) {
      regressions.push('Revision unchanged from original despite issues being reported')
    }
    return { pass: regressions.length === 0, delta: 0, regressions }
  }

  const origWords = countWords(originalDraft)
  const revWords = countWords(revisionDraft)
  if (origWords > 0) {
    const pctChange = Math.abs(revWords - origWords) / origWords
    if (pctChange > 0.15) {
      regressions.push(`Word count changed ${Math.round(pctChange * 100)}% (tolerance: 15%)`)
    }
  }

  let revisionCritique: any
  if (revisionCritiqueResult) {
    revisionCritique = revisionCritiqueResult
  } else {
    try {
      const critic = useStoryCritic()
      revisionCritique = await critic.evaluateScene({
        draft: revisionDraft,
        sceneBrief: {},
        storyBible: '',
        chapterLog: ''
      })
    } catch {
      revisionCritique = { score: 7, issues: [], strengths: [] }
    }
  }

  const delta = (revisionCritique?.score || 0) - (originalCritique?.score || 0)
  if (delta < 0) {
    regressions.push(`Score decreased by ${Math.abs(delta)} points after revision`)
  }
  return { pass: regressions.length === 0, failOn: cfg.failOn || 'block', delta, regressions }
}

/**
 * @param targetWordCount The scene's own word target. Optional, and the reason
 *   this parameter exists: the gate used to judge length only against a global
 *   absolute range and against the *first attempt's* own word count. Both can
 *   pass while the scene sits far below what the author actually asked for —
 *   1095 words against a 1200-word target raised nothing, because 1095 is inside
 *   the global range and attempt 2 was not shorter than attempt 1.
 */
export function gateProseQuality(
  critiqueResult: any,
  baselineWordCount: number,
  currentWordCount: number,
  targetWordCount = 0,
  proseText = ''
) {
  const cfg = EVAL_GATE_CONFIG.proseQuality
  if (!cfg.enabled) return { pass: true, failOn: 'none', flags: [] as string[] }

  // Skip prose quality check if evaluation was unavailable
  if (critiqueResult?.evalUnavailable)
    return { pass: true, failOn: cfg.failOn || 'block', flags: [] as string[] }

  const flags: string[] = []

  // Every length comparison below runs against unique content when the caller
  // supplies the text. Without this the gate can be satisfied by repetition.
  if (proseText) {
    const dupRatio = duplicateRatio(proseText)
    if (dupRatio > MAX_DUPLICATE_RATIO) {
      flags.push(
        `${Math.round(dupRatio * 100)}% of the prose is duplicate sentences (max ${Math.round(MAX_DUPLICATE_RATIO * 100)}%) — the model is likely looping`
      )
    }
    currentWordCount = countUniqueWords(proseText)
  }
  const dimScores = critiqueResult?.dimensionScores
  if (dimScores) {
    const values = Object.values(dimScores).filter((v) => typeof v === 'number') as number[]
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const threshold = DEFINITION_OF_MASTERPIECE.proseQuality.minAvgDimensionScore
      if (avg < threshold) {
        flags.push(`Average dimension score ${avg.toFixed(1)} below threshold ${threshold}`)
      }
    }
  }

  const domBaseline = DEFINITION_OF_MASTERPIECE.proseBaseline
  if (domBaseline && currentWordCount > 0) {
    if (currentWordCount < domBaseline.minWordCount) {
      flags.push(
        `Prose length ${currentWordCount} words below absolute minimum ${domBaseline.minWordCount}`
      )
    } else if (currentWordCount > domBaseline.maxWordCount) {
      flags.push(
        `Prose length ${currentWordCount} words exceeds absolute maximum ${domBaseline.maxWordCount}`
      )
    }
  }

  // Same tolerance the writer's continuation pass uses, so the gate and the
  // fixer agree on what "short" means. Reaching here means continuation ran and
  // still could not close the gap — worth surfacing rather than silently
  // accepting.
  if (targetWordCount > 0 && currentWordCount > 0) {
    const floor = Math.floor(targetWordCount * 0.85)
    if (currentWordCount < floor) {
      flags.push(
        `Prose length ${currentWordCount} words is below ${floor} (85% of the ${targetWordCount}-word target)`
      )
    }
  }

  if (baselineWordCount > 0 && currentWordCount > 0 && baselineWordCount !== currentWordCount) {
    const ratio = currentWordCount / baselineWordCount
    const { min, max } = DEFINITION_OF_MASTERPIECE.proseQuality.lengthRatio
    if (ratio < min) {
      flags.push(
        `Word count ratio ${ratio.toFixed(2)} below minimum ${min} — prose may be truncated`
      )
    } else if (ratio > max) {
      flags.push(
        `Word count ratio ${ratio.toFixed(2)} exceeds maximum ${max} — prose may be bloated`
      )
    }
  }

  return {
    pass: flags.length === 0,
    failOn: cfg.failOn || 'block',
    flags
  }
}
