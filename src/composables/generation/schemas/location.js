export const locationSchema = {
  type: 'location',
  systemPrompt: `You generate diverse, unique fictional locations. Vary: genre, time period, culture, environment type (urban, rural, underwater, airborne, underground, cosmic). Avoid generic fantasy tropes.`,
  modelKeys: ['name', 'description', 'notes'],
  promptKeys: ['name', 'description', 'notes'],
  fieldConstraints: 'location'
}
