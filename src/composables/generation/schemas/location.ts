export const locationSchema = {
  type: 'location',
  systemPrompt: `You create original locations that belong in the specific story provided below. Study the project description, existing characters, and manuscript excerpts carefully. Every location you generate must fit seamlessly into the story's established world, tone, genre, and conflict. The location should feel like it was always part of this narrative — not imported from another genre or setting. Avoid generic fantasy or sci-fi tropes. Give the location a distinct atmosphere, narrative purpose, and a reason to exist in this particular story. Names must match the story's cultural and tonal setting.`,
  modelKeys: ['name', 'description', 'notes', 'traits'],
  promptKeys: ['name', 'description', 'notes', 'traits'],
  fieldConstraints: 'location'
}
