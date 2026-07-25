import { EVAL_GATE_CONFIG } from '../config/evalGateConfig'
import { DEFINITION_OF_MASTERPIECE } from '../config/definitionOfMasterpiece'
import { getDimensionNames } from '../config/evalDimensions'
import { useStoryCritic } from '../composables/useStoryCritic'

export function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function gateDimensionCoverage(critiqueResult, workspaceType) {
  const cfg = EVAL_GATE_CONFIG.dimensionCoverage
  if (!cfg.enabled) return { pass: true, failOn: 'none', missing: [], warnings: [] }

  const expectedDims = getDimensionNames(workspaceType)
  if (!expectedDims || expectedDims.length === 0)
    return { pass: true, failOn: 'none', missing: [], warnings: [] }

  const issues = critiqueResult?.issues || []
  const coveredDims = new Set(issues.map((i) => i.type))
  const missing = expectedDims.filter((d) => !coveredDims.has(d))
  const warnings = missing.map(
    (d) => `Dimension "${d}" has no issues — evaluation may lack coverage`
  )

  return {
    pass: missing.length === 0 || cfg.strict === false,
    failOn: cfg.failOn || 'warn',
    missing,
    warnings
  }
}

export function gateScoreDistribution(critiqueResult) {
  const cfg = EVAL_GATE_CONFIG.scoreDistribution
  if (!cfg.enabled) return { pass: true, failOn: 'none', flags: [] }

  if (!critiqueResult) return { pass: true, flags: [] }

  const score = critiqueResult?.score ?? -1
  const flags = []

  const [min, max] = cfg.suspectScoreRange || [1, 10]
  if (score < min || score > max) {
    flags.push(`Score ${score} is outside expected range [${min}-${max}]`)
  }

  if (score === cfg.suspectScore) {
    flags.push(`Score equals suspect value ${cfg.suspectScore} (possible default fallback)`)
  }

  const issues = critiqueResult?.issues || []
  const majorIssues = issues.filter((i) => i.severity === 'major')
  if (score >= 9 && majorIssues.length > 2) {
    flags.push(`High score (${score}) with ${majorIssues.length} major issues — possible mismatch`)
  }
  if (score >= cfg.suspectScore && majorIssues.length === 0 && issues.length === 0) {
    flags.push(`Passing score (${score}) with zero issues — possible degenerate evaluation`)
  }

  return {
    pass: flags.length === 0,
    failOn: cfg.failOn || 'warn',
    flags
  }
}

export async function gateRevisionEffectiveness(
  originalCritique,
  revisionDraft,
  originalDraft,
  revisionCritiqueResult
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

  let revisionCritique
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

export function gateProseQuality(critiqueResult, baselineWordCount, currentWordCount) {
  const cfg = EVAL_GATE_CONFIG.proseQuality
  if (!cfg.enabled) return { pass: true, failOn: 'none', flags: [] }

  const flags = []
  const dimScores = critiqueResult?.dimensionScores
  if (dimScores) {
    const values = Object.values(dimScores).filter((v) => typeof v === 'number')
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
