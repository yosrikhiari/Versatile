import { aiGenerateJson } from '../generation/useAiService'

export function useRagSelfRefine() {

  async function refineProse(prose, sceneBrief, retrievalContext, writer, writeParams) {
    if (!retrievalContext || !retrievalContext.includes('[source:')) return prose

    const prompt = `You are a story continuity editor. The scene draft below has enriched context available that includes cited source material. Determine if the draft properly incorporates the key facts and lore from those sources.

Scene: ${sceneBrief.title || sceneBrief.summary?.slice(0, 300)}

Enriched Context:
${retrievalContext.slice(-4000)}

Draft:
${prose.slice(0, 3000)}

Respond with JSON:
{
  "missingKeyFacts": ["list each specific fact from the enriched context that the draft should reference but is missing"],
  "verdict": "covered" | "partially" | "missing"
}`

    const gaps = await aiGenerateJson(prompt, {
      temperature: 0.2,
      maxTokens: 500,
      system: 'You check story draft source coverage. Be concise. Prefer "covered" unless a meaningful gap exists.'
    })

    if (!gaps || gaps.verdict === 'covered') return prose

    const missingBlock = (gaps.missingKeyFacts || []).map((g) => `- ${g}`).join('\n')

    const result = await writer.writeSceneStructured({
      sceneBrief,
      storyArc: writeParams.storyArc,
      chapterLog: '',
      storyBible: writeParams.storyBibleDocs,
      spineContext: writeParams.spineContext || '',
      onChunk: () => {},
      embeddingContext: `Refinement pass for scene "${sceneBrief.title}". The previous draft omitted these cited facts:\n${missingBlock}\n\nRewrite to naturally weave them into the prose while keeping the same scene structure and pacing.`,
      storyContract: writeParams.storyContract,
      pastEvalResults: undefined
    })

    return result.prose || prose
  }

  return { refineProse }
}
