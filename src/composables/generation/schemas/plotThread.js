export const plotThreadSchema = {
  type: 'plotThread',
  systemPrompt: `You create original plot threads that belong in the specific story provided below. Study the project description, existing characters, and manuscript excerpts carefully. Every plot thread you generate must fit seamlessly into the story's established world, tone, genre, and existing conflicts. The plot thread should feel like it was always part of this narrative — not transplanted from another genre or setting. Avoid generic tropes. Give each thread clear stakes, moral complexity, and a reason to exist in this particular story.

CONSISTENCY (critical): The thread must be consistent with how the existing characters are already described and related. Do NOT cast devoted allies as secret conspirators against each other, or frame a loyal character as a traitor, unless an existing character trait or note already plants that seed. If you introduce a betrayal or hidden agenda, it must build on something already established — not contradict it.`,
  modelKeys: ['title', 'notes', 'traits'],
  promptKeys: ['title', 'notes', 'traits'],
  fieldConstraints: 'plotThread'
}
