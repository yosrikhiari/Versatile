import { getDimensionsForWorkspace } from '../../../src/config/evalDimensions.js'
import { callModel, selectJudge } from './providers.js'

export function buildJudgePrompt(output, test) {
  const wsType = test.workspaceType || 'creative'
  const dims = getDimensionsForWorkspace(wsType)
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

  return `You are an expert evaluator of ${wsType} text. Score the following output on each dimension using the provided rubrics.

TEST CONTEXT:
Name: ${test.name}
Synopsis: ${test.synopsis}

OUTPUT TO EVALUATE:
"""
${output}
"""

RUBRICS (1-10 scale):
${rubricSections}

Return ONLY valid JSON with no surrounding text or markdown:
{
  "dimensionScores": { ${dimKeys} },
  "issues": [],
  "rationale": "one-sentence explanation of the overall assessment"
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
  const dims = getDimensionsForWorkspace(test.workspaceType || 'creative')
  const dimensionScores = {}
  for (const key of Object.keys(dims)) {
    dimensionScores[key] = 5
  }
  const values = Object.values(dimensionScores)
  const overallScore =
    values.length > 0
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : null
  return {
    score: overallScore,
    dimensionScores,
    issues: [],
    wordCount: 0
  }
}

export async function judgeOutput(output, test) {
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

  const prompt = buildJudgePrompt(output, test)
  const systemPrompt =
    'You are a strict evaluator. Return ONLY valid JSON. No explanations outside the JSON structure.'

  try {
    const result = await callModel(judge.providerId, prompt, systemPrompt, judge.model)
    const parsed = parseJudgeResponse(result)

    const dims = getDimensionsForWorkspace(test.workspaceType || 'creative')
    const dimensionScores = {}
    const dimKeys = Object.keys(dims)

    for (const key of dimKeys) {
      const score = parsed.dimensionScores?.[key]
      dimensionScores[key] =
        typeof score === 'number' && score >= 1 && score <= 10 ? Math.round(score) : 5
    }

    const values = Object.values(dimensionScores)
    const overallScore =
      values.length > 0
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
        : null

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
