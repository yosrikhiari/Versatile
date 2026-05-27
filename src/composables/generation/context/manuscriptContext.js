export function getManuscriptContext(manuscriptContext) {
  if (!manuscriptContext?.contextText) return ''
  return manuscriptContext.contextText
}
