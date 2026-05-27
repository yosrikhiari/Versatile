export const plotThreadSchema = {
  type: 'plotThread',
  systemPrompt: `You generate diverse, compelling plot conflicts. Vary: genre, stakes (personal, societal, cosmic), type (mystery, heist, survival, romance, betrayal, discovery), and moral complexity. Avoid tired tropes.`,
  modelKeys: ['title', 'notes'],
  promptKeys: ['title', 'notes'],
  fieldConstraints: 'plotThread'
}
