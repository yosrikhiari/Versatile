import { FIELD_LENGTH_CONSTRAINTS } from '../utils'

export function buildPrompt({ shapedBundle, schema, extraInstructions }: { shapedBundle: any; schema: any; extraInstructions: any }) {
  const {
    projectBlock,
    charactersBlock,
    locationsBlock,
    plotThreadsBlock,
    relationshipsBlock,
    manuscriptBlock
  } = shapedBundle

  const entitiesBlock = [charactersBlock, plotThreadsBlock, locationsBlock]
    .filter(Boolean)
    .join('\n')

  const dedupLine = entitiesBlock
    ? '\nIMPORTANT: Do NOT create duplicates of the existing entities listed above. Generate something completely new.'
    : ''

  const fieldGuidance = buildFieldGuidance(schema)

  const userPrompt =
    `Generate one ${schema.type} for this story.` +
    projectBlock +
    entitiesBlock +
    relationshipsBlock +
    manuscriptBlock +
    `\n\nReturn ONLY valid JSON. Keys: ${schema.promptKeys.join(', ')}. String values: ${schema.promptKeys.filter((k: any) => k !== 'traits').join(', ')}. traits is an array of strings. No markdown.` +
    dedupLine +
    (extraInstructions ? `\n\n${extraInstructions}` : '') +
    fieldGuidance

  return {
    userPrompt,
    systemPrompt: schema.systemPrompt
  }
}

function buildFieldGuidance(schema: any) {
  const constraints = (FIELD_LENGTH_CONSTRAINTS as Record<string, any>)[schema.fieldConstraints]
  if (!constraints) return ''
  const lines = schema.promptKeys
    .filter((key: any) => constraints[key])
    .map(
      (key: any) =>
        `- ${key}: max ${constraints[key].maxSentences} sentence(s), ~${constraints[key].maxWords} words (${constraints[key].guidance})`
    )
  return lines.length > 0 ? `\n\nFIELD CONSTRAINTS:\n${lines.join('\n')}` : ''
}
