/**
 * Cross-chapter deterministic rules — zero LLM calls.
 *
 * Pass 2 of the tree traversal. Pass 1 scopes the scene-level rules to one
 * chapter at a time, so any pair spanning chapters is invisible to them;
 * these rules own those pairs. They read the entity-state timeline
 * partitioned by chapter boundaries — chapter digests carry no state
 * semantics (presence lists and summaries only), so they contribute
 * display text, never verdicts.
 *
 * Same output shape and precision bias as the scene rules: every finding
 * carries its evidence and boundary scenes, and anything that cannot be
 * proven cross-chapter (unplaced states, same-chapter pairs) is left to
 * Pass 1, never reported twice.
 */

import type { EntityStateRecord } from './entityStates'
import { indexStatesByEntity } from './entityStates'
import { positionLabel, type DeterministicContradiction } from './deterministicContradictions'

function chapterOf(s: EntityStateRecord): number | null {
  return typeof s.chapterNumber === 'number' ? s.chapterNumber : null
}

/**
 * Death in one chapter, unexplained presence in a later one.
 *
 * Mirrors the scene rule's scan (one report per death; an explicit revival
 * clears it) lifted to chapter granularity, and reports only the spanning
 * case: same-chapter pairs belong to Pass 1. Severity is warning, not
 * error — at chapter distance a flashback or off-page survival is
 * plausible and the states cannot distinguish it.
 */
export function checkCrossChapterResurrection(
  states: EntityStateRecord[]
): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []

  for (const [key, timeline] of indexStatesByEntity(states)) {
    if (!key.startsWith('character:')) continue

    let death: EntityStateRecord | null = null
    for (const s of timeline) {
      if (s.state.status === 'dead') {
        death = s
        continue
      }
      if (!death) continue
      const revived = s.state.status === 'alive' && s.sourceFacts.length > 0
      if (revived) {
        death = null
        continue
      }
      if (s.state.present) {
        const deathChapter = chapterOf(death)
        const presenceChapter = chapterOf(s)
        // Same-chapter pairs (including both-unplaced, which Pass 1 runs
        // together as one group) belong to the scene rule — skip them so
        // no finding is ever reported twice. Everything else is
        // invisible to Pass 1's scoped groups: a null↔placed span can
        // only be a backfill gap, so it reports as a warning with the
        // legacy id rather than vanishing silently.
        const sameScope =
          deathChapter === presenceChapter ||
          (deathChapter === null && presenceChapter === null)
        if (!sameScope) {
          out.push({
            type: 'dead_then_alive',
            severity: 'warning',
            entityType: 'character',
            entityId: s.entityId,
            entityName: s.entityName,
            sceneIds: [death.sceneId, s.sceneId],
            description: `"${s.entityName}" is established dead in ${positionLabel(death)} but appears again in ${positionLabel(s)}.`,
            evidence: [...death.sourceFacts, ...s.sourceFacts]
          })
        }
        death = null
      }
    }
  }

  return out
}

/** All Pass-2 rules over the full (unscoped) state timeline. */
export async function runCrossChapterRuleChecks(
  entityStates: EntityStateRecord[] = []
): Promise<DeterministicContradiction[]> {
  return [...checkCrossChapterResurrection(entityStates)]
}
