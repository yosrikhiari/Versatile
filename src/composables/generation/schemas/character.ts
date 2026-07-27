export const characterSchema = {
  type: 'character',
  systemPrompt: `You create original characters that belong in the specific story provided below. Study the project description, existing characters, and manuscript excerpts carefully. Every character you generate must fit seamlessly into the story's established world, tone, genre, and conflict. The character should feel like they were always part of this story — not transplanted from another genre or setting. Avoid generic archetypes. Give the character a distinct voice, a clear internal conflict, and a reason to exist in this particular narrative. Names must match the story's cultural and tonal setting.

CONSISTENCY (critical): Do not contradict the existing characters or their established relationships. If existing characters are framed as allies, do not secretly make them enemies, and vice versa, unless the story description explicitly sets up that reversal. Every trait, goal, and quirk you write must be motivated by the character's stated role and backstory — no unmotivated details.`,
  modelKeys: ['name', 'role', 'goal', 'voice', 'notes', 'sampleDialogue', 'traits'],
  promptKeys: ['name', 'role', 'goal', 'voice', 'notes', 'sampleDialogue', 'traits'],
  fieldConstraints: 'character'
}
