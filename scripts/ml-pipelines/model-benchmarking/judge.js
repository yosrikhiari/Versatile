import { getDimensionsForWorkspace } from '../../../src/config/evalDimensions.js'
import { getDimensionsForTaskType } from './task-eval-dimensions.js'
import { callModel, selectJudge } from './providers.js'

function resolveDimensions(test) {
  if (test.taskType) {
    const dims = getDimensionsForTaskType(test.taskType)
    if (dims) return dims
  }
  return getDimensionsForWorkspace(test.workspaceType || 'creative')
}

export function buildJudgePrompt(output, test, taskInstruction) {
  const dims = resolveDimensions(test)
  const dimEntries = Object.entries(dims)

  const rubricSections = dimEntries
    .map(([key, dim]) => {
      const levels = Object.entries(dim.rubric)
        .map(([score, desc]) => `  ${score}: ${desc}`)
        .join('\n')
      return `"${key}" (${dim.label}, weight: ${dim.weight}):\n${levels}`
    })
    .join('\n\n')

  const dimKeys = dimEntries.map(([k]) => `"${k}"`).join(', ')

  const evalType = test.taskType || test.workspaceType || 'creative'

  const instructionSection = taskInstruction
    ? `\nTASK GIVEN TO THE MODEL (the instruction it was asked to satisfy):\n"""\n${taskInstruction}\n"""\n`
    : ''

  return `You are an expert evaluator of ${evalType} text. Score the following output on each dimension using the provided rubrics. Use the full 1-10 range — reserve 9-10 for genuinely excellent work and 1-3 for clear failures.

TEST CONTEXT:
Name: ${test.name}
Synopsis: ${test.synopsis}
${instructionSection}
OUTPUT TO EVALUATE:
"""
${output}
"""

RUBRICS (1-10 scale):
${rubricSections}

Return ONLY valid JSON with no surrounding text or markdown. Write "rationale" FIRST (reason before scoring), then the scores it justifies:
{
  "rationale": "one-sentence explanation of the overall assessment",
  "issues": [],
  "dimensionScores": { ${dimKeys} }
}`
}

export function parseJudgeResponse(text) {
  const cleaned = text.trim()

  try {
    return JSON.parse(cleaned)
  } catch {}

  const blockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1].trim())
    } catch {}
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*"dimensionScores"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {}
  }

  const dimensionScores = {}
  const scorePattern = /"(\w+)"\s*:\s*(\d+)/g
  let match
  while ((match = scorePattern.exec(cleaned)) !== null) {
    const val = parseInt(match[2], 10)
    if (val >= 1 && val <= 10) {
      dimensionScores[match[1]] = val
    }
  }

  return {
    dimensionScores: Object.keys(dimensionScores).length > 0 ? dimensionScores : null,
    issues: []
  }
}

function midpointFallback(test) {
  const dims = resolveDimensions(test)
  const dimensionScores = {}
  const dimKeys = Object.keys(dims)
  for (const key of dimKeys) {
    dimensionScores[key] = 5
  }
  const weightedSum = dimKeys.reduce((sum, key) => {
    return sum + 5 * (dims[key].weight || 1.0)
  }, 0)
  const totalWeight = dimKeys.reduce((sum, key) => sum + (dims[key].weight || 1.0), 0)
  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null
  return {
    score: overallScore,
    dimensionScores,
    issues: [],
    wordCount: 0
  }
}

export async function judgeOutput(output, test, taskInstruction) {
  const wordCount = output.trim().split(/\s+/).filter(Boolean).length

  if (wordCount < 5) {
    const fallback = midpointFallback(test)
    return {
      ...fallback,
      wordCount,
      issues: [
        { type: 'length', severity: 'major', message: `Output too short (${wordCount} words)` }
      ]
    }
  }

  const judge = selectJudge()
  if (!judge) {
    const fallback = midpointFallback(test)
    return {
      ...fallback,
      wordCount,
      issues: [
        {
          type: 'judge',
          severity: 'major',
          message: 'No judge provider available; using midpoint scores'
        }
      ]
    }
  }

  const prompt = buildJudgePrompt(output, test, taskInstruction)
  const systemPrompt =
    'You are a strict evaluator. Return ONLY valid JSON. No explanations outside the JSON structure.'

  try {
    // Judge deterministically (temperature 0) so the same output scores
    // identically across runs — a benchmark judged at 0.7 is not reproducible.
    const result = await callModel(judge.providerId, prompt, systemPrompt, judge.model, {
      temperature: 0
    })
    const parsed = parseJudgeResponse(result)

    const dims = resolveDimensions(test)
    const dimensionScores = {}
    const dimKeys = Object.keys(dims)

    for (const key of dimKeys) {
      const score = parsed.dimensionScores?.[key]
      dimensionScores[key] =
        typeof score === 'number' && score >= 1 && score <= 10 ? Math.round(score) : 5
    }

    const weightedSum = dimKeys.reduce((sum, key) => {
      const weight = dims[key].weight || 1.0
      return sum + (dimensionScores[key] || 5) * weight
    }, 0)
    const totalWeight = dimKeys.reduce((sum, key) => sum + (dims[key].weight || 1.0), 0)
    const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null

    return {
      score: overallScore,
      dimensionScores,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      wordCount,
      judgeRationale: parsed.rationale || null
    }
  } catch (err) {
    const fallback = midpointFallback(test)
    return {
      ...fallback,
      wordCount,
      issues: [
        { type: 'judge_error', severity: 'major', message: `Judge call failed: ${err.message}` }
      ]
    }
  }
}
