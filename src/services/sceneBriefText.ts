/**
 * Renders a planned scene as a one-line brief.
 *
 * Subsections were created with `description: "Scene 3"` — a placeholder that
 * threw away everything the planner had just decided about the scene. Two things
 * broke as a result: the outline showed a column of "Scene 1, Scene 2, Scene 3"
 * instead of what happens in them, and the next generation run re-read those
 * descriptions as evidence, so the model was handed `"The Arrival": Scene 1` as
 * its account of the existing manuscript.
 *
 * The brief is deliberately compact. It is read back into prompts, where it
 * competes for context with the prose it describes.
 */

export interface SceneBriefLike {
  sceneNumber?: number
  emotionalGoal?: string
  whatChanges?: string
  change?: string
  goal?: string
  obstacle?: string
  location?: string
  charactersPresent?: string[]
  characters?: string[]
  tension?: string
  pacing?: string
  arcPosition?: string
  pov?: string
}

/** Longest brief we will store; briefs are re-read into prompts. */
const MAX_LENGTH = 320

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function describeSceneBrief(scene: SceneBriefLike): string {
  if (!scene) return ''

  const parts: string[] = []

  // What the scene is FOR, in the planner's own terms.
  const intent = clean(scene.emotionalGoal) || clean(scene.goal)
  if (intent) parts.push(intent)

  const change = clean(scene.whatChanges) || clean(scene.change)
  if (change && change !== intent) parts.push(`Changes: ${change}`)

  const obstacle = clean(scene.obstacle)
  if (obstacle && !/^unspecified/i.test(obstacle)) parts.push(`Obstacle: ${obstacle}`)

  const cast = (scene.charactersPresent || scene.characters || []).filter(Boolean)
  const location = clean(scene.location)
  if (location && cast.length) parts.push(`${location} — ${cast.join(', ')}`)
  else if (location) parts.push(location)
  else if (cast.length) parts.push(cast.join(', '))

  const pov = clean(scene.pov)
  if (pov) parts.push(`POV: ${pov}`)

  const brief = parts.join('. ').replace(/\.\s*\.\s*/g, '. ').trim()
  if (!brief) {
    // Nothing usable in the plan — fall back to the old placeholder rather than
    // storing an empty description, so the outline still has a label.
    return scene.sceneNumber ? `Scene ${scene.sceneNumber}` : ''
  }

  if (brief.length <= MAX_LENGTH) return brief
  // Trim on a word boundary so the stored brief never ends mid-word.
  return brief.slice(0, MAX_LENGTH).replace(/\s+\S*$/, '') + '…'
}
