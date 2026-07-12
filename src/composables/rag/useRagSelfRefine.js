import { aiGenerateJson } from '../useAiService'

const SYSTEM_CHECK = `You are a fiction editor checking a draft scene against research sources.
Given the scene text and the author's research notes, decide if the scene adequately reflects the research.
Return JSON: { "needsRevision": boolean, "reason": string, "missingElements": string[] }
Set needsRevision to true if the scene ignores or contradicts research sources.
Be strict — if important details from the sources are missing or wrong, flag them.`

const SYSTEM_REWRITE = `You are a fiction writer revising a scene to better incorporate research sources.
Rewrite the scene to naturally weave in the missing research details without breaking the narrative flow.
Return JSON: { "revisedScene": string }
Preserve the original tone, POV, and style. Do not add information not present in the sources.`

const MAX_REFINEMENT_ROUNDS = 2
const MIN_CONTEXT_WORDS = 30

export async function useRagSelfRefine(sceneText, contextBlock) {
  if (!sceneText || !contextBlock || contextBlock.split(/\s+/).length < MIN_CONTEXT_WORDS) {
    return { revisedText: sceneText, rounds: 0 }
  }

  let currentText = sceneText
  let totalRounds = 0

  for (let round = 0; round < MAX_REFINEMENT_ROUNDS; round++) {
    const judgePrompt = [
      `Scene:\n${currentText}`,
      '',
      `Research references:\n${contextBlock}`,
      '',
      'Does this scene adequately use the research references?'
    ].join('\n')

    let verdict
    try {
      verdict = await aiGenerateJson(judgePrompt, SYSTEM_CHECK)
    } catch {
      break
    }

    if (!verdict.needsRevision) break

    totalRounds++

    const rewritePrompt = [
      `Scene:\n${currentText}`,
      '',
      `Research references:\n${contextBlock}`,
      '',
      `Editor's note: ${verdict.reason || ''}`,
      `Missing elements: ${(verdict.missingElements || []).join(', ')}`,
      '',
      'Please revise the scene.'
    ].join('\n')

    try {
      const revised = await aiGenerateJson(rewritePrompt, SYSTEM_REWRITE)
      currentText = revised.revisedScene || currentText
    } catch {
      break
    }
  }

  return { revisedText: currentText, rounds: totalRounds }
}
