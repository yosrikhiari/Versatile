import { FIELD_LENGTH_CONSTRAINTS } from '../utils'
import { debugSnapshot } from '../../../services/debugSnapshot'

export function buildPrompt({ shapedBundle, schema, extraInstructions }) {
  const { projectBlock, charactersBlock, locationsBlock, plotThreadsBlock, relationshipsBlock, manuscriptBlock } = shapedBundle

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
    `\n\nReturn ONLY valid JSON. Keys: ${schema.promptKeys.join(', ')}. String values: ${schema.promptKeys.filter(k => k !== 'traits').join(', ')}. traits is an array of strings. No markdown.` +
    dedupLine +
    (extraInstructions ? `\n\n${extraInstructions}` : '') +
    fieldGuidance

  debugSnapshot(`prompt-${schema.type}-blocks`, {
    entityType: schema.type,
    blockSizes: {
      projectBlock: projectBlock?.length || 0,
      charactersBlock: charactersBlock?.length || 0,
      plotThreadsBlock: plotThreadsBlock?.length || 0,
      locationsBlock: locationsBlock?.length || 0,
      relationshipsBlock: relationshipsBlock?.length || 0,
      manuscriptBlock: manuscriptBlock?.length || 0,
      entitiesBlock: entitiesBlock?.length || 0,
      dedupLine: dedupLine?.length || 0,
      fieldGuidance: fieldGuidance?.length || 0,
      extraInstructions: extraInstructions?.length || 0,
      totalUserPrompt: userPrompt.length
    },
    hasDedup: !!dedupLine,
    hasExtraInstructions: !!extraInstructions,
    hasFieldGuidance: !!fieldGuidance
  })

  return {
    userPrompt,
    systemPrompt: schema.systemPrompt
  }
}

function buildFieldGuidance(schema) {
  const constraints = FIELD_LENGTH_CONSTRAINTS[schema.fieldConstraints]
  if (!constraints) return ''
  const lines = schema.promptKeys
    .filter(key => constraints[key])
    .map(key => `- ${key}: max ${constraints[key].maxSentences} sentence(s), ~${constraints[key].maxWords} words (${constraints[key].guidance})`)
  return lines.length > 0 ? `\n\nFIELD CONSTRAINTS:\n${lines.join('\n')}` : ''
}
