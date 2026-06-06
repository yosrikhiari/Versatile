export const characterSchema = {
  type: 'character',
  systemPrompt: `You generate diverse, unique fictional characters. Vary: genre (fantasy, sci-fi, noir, romance, horror, historical), time period, culture, personality type, and naming conventions. Names should be culturally appropriate and distinct. Avoid clichés.`,
  modelKeys: ['name', 'role', 'goal', 'voice', 'notes', 'sampleDialogue', 'traits'],
  promptKeys: ['name', 'role', 'goal', 'voice', 'notes', 'sampleDialogue', 'traits'],
  fieldConstraints: 'character'
}
