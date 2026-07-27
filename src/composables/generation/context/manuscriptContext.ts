export function getManuscriptContext(manuscriptContext: any) {
  if (!manuscriptContext?.contextText) return ''
  return manuscriptContext.contextText
}
