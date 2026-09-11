/**
 * Director-scene → generator plan-scene mapping, extracted pure from
 * `useVolumeStoryGenerator` so the transit is testable.
 *
 * The generator rebuilds scenes field-by-field, so anything not named here
 * is dropped no matter what the director emitted (how `pov` stayed
 * undefined end-to-end, and how `threadIds` died here after surviving the
 * director's own mapper — silently disabling thread scoping downstream).
 */

export interface PlanSceneContext {
  singleChapter?: boolean
  structureSpec?: unknown
  effectiveWordTarget?: number
  sceneCount?: number
}

export function mapPlanScene(s: any, i: number, ctx: PlanSceneContext = {}): any {
  const { singleChapter, structureSpec, effectiveWordTarget = 0, sceneCount = 0 } = ctx
  return {
    sceneNumber: i + 1,
    sceneIndex: i + 1,
    title: s.title || `Scene ${i + 1}`,
    goal: s.emotionalGoal || '',
    obstacle: s.whatChanges || '',
    characters: s.charactersPresent || [],
    location: s.location || '',
    change: s.whatChanges || '',
    toneNote: s.tension || 'medium',
    tension: s.tension || 'medium',
    pacing: s.pacing || 'medium',
    estimatedWords:
      !structureSpec && singleChapter
        ? effectiveWordTarget
        : s.estimatedWords || Math.round(effectiveWordTarget / Math.max(sceneCount, 1)),
    emotionalGoal: s.emotionalGoal || '',
    whatChanges: s.whatChanges || '',
    charactersPresent: s.charactersPresent || [],
    characterWants: s.characterWants || {},
    setup: s.setup || '',
    payoff: s.payoff || 'none',
    sensoryAnchor: s.sensoryAnchor || '',
    arcPosition: s.arcPosition || '',
    threadIds: Array.isArray(s.threadIds)
      ? s.threadIds.filter((t: any) => typeof t === 'string')
      : [],
    // POV anchor: use the director's choice, else the first character present.
    // Keeps narration from drifting between viewpoints across a long draft.
    pov:
      s.pov ||
      s.povCharacter ||
      (Array.isArray(s.charactersPresent) ? s.charactersPresent[0] : '') ||
      ''
  }
}

export function mapPlanScenes(scenes: any[], ctx: PlanSceneContext = {}): any[] {
  return (scenes || []).map((s, i) => mapPlanScene(s, i, { ...ctx, sceneCount: scenes.length }))
}
