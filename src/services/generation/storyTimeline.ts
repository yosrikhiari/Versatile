/**
 * The story on one axis.
 *
 * Until now the project had four separate notions of time and none of them met:
 * the Timeline view ordered plot threads by an integer a human dragged; scene
 * digests carried `chapterNumber` and were read only for contradiction checks;
 * the narrative spine carried per-chapter `keyFacts` and lived in a checkpoint;
 * and the relationship graph carried no time at all. The `# Timeline` document
 * handed to the writer was a list of plot threads in drag order.
 *
 * This assembles the one axis they should always have shared: chapters, in
 * order, each carrying what changed in it — who died, what broke, who learned
 * what, and which relationships reversed. Everything here is derived from
 * artifacts that already exist. Nothing calls a model.
 *
 * Both the Timeline view and the Timeline document render this, so what the
 * author sees and what the writer is told cannot drift apart.
 */

import { compareStatePosition, indexStatesByEntity, type EntityStateRecord } from './entityStates'
import { edgePairKey, type TemporalEdge } from './edgeTimeline'

export type TimelineEventKind =
  | 'status'
  | 'condition'
  | 'knowledge'
  | 'appearance'
  | 'relationship_opens'
  | 'relationship_ends'

export interface TimelineEvent {
  kind: TimelineEventKind
  /** What the event is about — a character, an object, or a pair of names. */
  subject: string
  /** One line, already phrased for display. */
  text: string
  /** For state events: the scene it was established in, so a view can link to it. */
  sceneId?: string
  /** The digest facts behind it, when there are any. */
  evidence?: string[]
}

export interface TimelineChapter {
  chapterNumber: number
  title: string
  summary: string
  charactersPresent: string[]
  locations: string[]
  events: TimelineEvent[]
}

export interface StoryTimeline {
  chapters: TimelineChapter[]
  /** Chapters that carry no derived data at all — useful for reporting coverage. */
  emptyChapters: number[]
  /** True when nothing in the project has a chapter number yet. */
  isEmpty: boolean
}

const STATUS_PHRASE: Record<string, string> = {
  dead: 'dies',
  injured: 'is wounded',
  alive: 'is alive again'
}

const CONDITION_PHRASE: Record<string, string> = {
  destroyed: 'is destroyed',
  lost: 'is lost',
  damaged: 'is damaged',
  intact: 'is recovered'
}

/**
 * State transitions, per entity, in story order.
 *
 * A transition — not a state. A character being alive in forty consecutive
 * chapters is not forty events; the chapter they die in is one.
 */
function stateEvents(states: EntityStateRecord[]): Map<number, TimelineEvent[]> {
  const byChapter = new Map<number, TimelineEvent[]>()
  const push = (chapter: number | null, event: TimelineEvent) => {
    if (chapter == null) return
    const list = byChapter.get(chapter)
    if (list) list.push(event)
    else byChapter.set(chapter, [event])
  }

  for (const [key, timeline] of indexStatesByEntity(states)) {
    const type = key.split(':')[0]
    let lastStatus = 'unknown'
    let lastCondition = 'unknown'
    const lastAttributes: Record<string, string> = {}
    const knownTopics = new Set<string>()

    for (const s of timeline) {
      if (type === 'character') {
        if (s.state.status !== 'unknown' && s.state.status !== lastStatus) {
          // "alive" is the resting state — only worth an event when it follows
          // a death, which is the one time it means something happened.
          const worthReporting = s.state.status !== 'alive' || lastStatus === 'dead'
          if (worthReporting) {
            push(s.chapterNumber, {
              kind: 'status',
              subject: s.entityName,
              text: `${s.entityName} ${STATUS_PHRASE[s.state.status] || s.state.status}`,
              sceneId: s.sceneId,
              evidence: s.sourceFacts
            })
          }
          lastStatus = s.state.status
        }

        for (const [attr, value] of Object.entries(s.state.attributes)) {
          if (lastAttributes[attr] && lastAttributes[attr] !== value) {
            push(s.chapterNumber, {
              kind: 'appearance',
              subject: s.entityName,
              text: `${s.entityName}'s ${attr.replace('_', ' ')} is described as ${value} (was ${lastAttributes[attr]})`,
              sceneId: s.sceneId,
              evidence: s.sourceFacts
            })
          }
          lastAttributes[attr] = value
        }

        for (const topic of s.state.knows) {
          if (knownTopics.has(topic)) continue
          knownTopics.add(topic)
          push(s.chapterNumber, {
            kind: 'knowledge',
            subject: s.entityName,
            text: `${s.entityName} learns ${topic}`,
            sceneId: s.sceneId,
            evidence: s.sourceFacts
          })
        }
      }

      if (type === 'object') {
        if (s.state.condition !== 'unknown' && s.state.condition !== lastCondition) {
          // Same reasoning as "alive": intact is the resting state.
          const worthReporting = s.state.condition !== 'intact' || lastCondition !== 'unknown'
          if (worthReporting) {
            push(s.chapterNumber, {
              kind: 'condition',
              subject: s.entityName,
              text: `${s.entityName} ${CONDITION_PHRASE[s.state.condition] || s.state.condition}`,
              sceneId: s.sceneId,
              evidence: s.sourceFacts
            })
          }
          lastCondition = s.state.condition
        }
      }
    }
  }

  return byChapter
}

/**
 * Relationship openings and closures, placed at their chapter.
 *
 * This is the payoff of giving edges a validity window. A pair whose claim ends
 * at chapter 12 and whose replacement opens at 13 renders as a reversal the
 * author can see — the event that, before the window existed, was silently
 * dropped as a duplicate of whatever chapter 1 asserted.
 */
function relationshipEvents(
  edges: TemporalEdge[],
  resolveName: (type: string, id: any) => string
): Map<number, TimelineEvent[]> {
  const byChapter = new Map<number, TimelineEvent[]>()
  const push = (chapter: number | null | undefined, event: TimelineEvent) => {
    if (chapter == null) return
    const list = byChapter.get(chapter)
    if (list) list.push(event)
    else byChapter.set(chapter, [event])
  }

  // What replaced what, so a closure can name its successor instead of just
  // reporting that something stopped being true.
  const successorByPair = new Map<string, TemporalEdge[]>()
  for (const e of edges) {
    const key = edgePairKey(e)
    const list = successorByPair.get(key)
    if (list) list.push(e)
    else successorByPair.set(key, [e])
  }

  for (const e of edges) {
    const a = resolveName(e.sourceType, e.sourceId)
    const b = resolveName(e.targetType, e.targetId)
    if (!a || !b) continue
    const pair = `${a} — ${b}`
    const rel = e.relationshipType || 'connected'

    // An edge with no window is a legacy claim: true for the whole story, and
    // not an event that happens anywhere in particular.
    if (e.validFromChapter != null && e.validFromChapter > 1) {
      const replaced = (successorByPair.get(edgePairKey(e)) || []).find(
        (o) => o.validUntilChapter != null && o.validUntilChapter === e.validFromChapter! - 1
      )
      push(e.validFromChapter, {
        kind: 'relationship_opens',
        subject: pair,
        text: replaced
          ? `${pair}: ${replaced.relationshipType} → ${rel}`
          : `${pair}: ${rel} begins`
      })
    }

    if (e.validUntilChapter != null) {
      const replacedBy = (successorByPair.get(edgePairKey(e)) || []).find(
        (o) => o.validFromChapter != null && o.validFromChapter === e.validUntilChapter! + 1
      )
      // A closure whose successor opens next chapter is already reported as the
      // opening above; reporting both would double every reversal.
      if (!replacedBy) {
        push(e.validUntilChapter, {
          kind: 'relationship_ends',
          subject: pair,
          text: `${pair}: ${rel} ends`
        })
      }
    }
  }

  return byChapter
}

function uniqueStrings(values: any[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}

/**
 * Assemble the timeline.
 *
 * Chapters come from whatever source knows about them — chapter digests when a
 * rollup has run, the entity states themselves otherwise. A project mid-way
 * through its first draft has states long before it has digests, and a timeline
 * that appears only after a rollup is a timeline nobody sees.
 */
export function buildStoryTimeline({
  chapterDigests = [],
  entityStates = [],
  edges = [],
  chapterTitles = {},
  resolveName = () => ''
}: {
  chapterDigests?: any[]
  entityStates?: EntityStateRecord[]
  edges?: TemporalEdge[]
  /** chapterNumber → title, from the manuscript's own sections. */
  chapterTitles?: Record<number, string>
  resolveName?: (type: string, id: any) => string
}): StoryTimeline {
  const stateEventsByChapter = stateEvents(entityStates)
  const relEventsByChapter = relationshipEvents(edges, resolveName)

  const digestByChapter = new Map<number, any>()
  for (const d of chapterDigests) {
    if (typeof d?.chapterNumber === 'number') digestByChapter.set(d.chapterNumber, d)
  }

  const chapterNumbers = new Set<number>([
    ...digestByChapter.keys(),
    ...stateEventsByChapter.keys(),
    ...relEventsByChapter.keys(),
    ...entityStates.map((s) => s.chapterNumber).filter((n): n is number => n != null),
    ...Object.keys(chapterTitles).map(Number).filter((n) => Number.isFinite(n))
  ])

  if (chapterNumbers.size === 0) {
    return { chapters: [], emptyChapters: [], isEmpty: true }
  }

  // Presence and locations come from the states rather than the digest rollup,
  // so a chapter reads correctly before any rollup has run.
  const presenceByChapter = new Map<number, { characters: string[]; locations: string[] }>()
  for (const s of [...entityStates].sort(compareStatePosition)) {
    if (s.chapterNumber == null || !s.state.present) continue
    const entry = presenceByChapter.get(s.chapterNumber) || { characters: [], locations: [] }
    if (s.entityType === 'character') entry.characters.push(s.entityName)
    if (s.entityType === 'location') entry.locations.push(s.entityName)
    presenceByChapter.set(s.chapterNumber, entry)
  }

  const emptyChapters: number[] = []
  const chapters = [...chapterNumbers]
    .sort((a, b) => a - b)
    .map((chapterNumber) => {
      const digest = digestByChapter.get(chapterNumber)
      const presence = presenceByChapter.get(chapterNumber) || { characters: [], locations: [] }
      const events = [
        ...(stateEventsByChapter.get(chapterNumber) || []),
        ...(relEventsByChapter.get(chapterNumber) || [])
      ]
      const chapter: TimelineChapter = {
        chapterNumber,
        title: chapterTitles[chapterNumber] || `Chapter ${chapterNumber}`,
        summary: String(digest?.summary || ''),
        charactersPresent: uniqueStrings([...(digest?.charactersPresent || []), ...presence.characters]),
        locations: uniqueStrings([...(digest?.locations || []), ...presence.locations]),
        events
      }
      if (!chapter.summary && !chapter.events.length && !chapter.charactersPresent.length) {
        emptyChapters.push(chapterNumber)
      }
      return chapter
    })

  return { chapters, emptyChapters, isEmpty: false }
}

/** The Timeline document body. Empty string when there is no chapter data yet. */
export function renderTimelineMarkdown(timeline: StoryTimeline): string {
  if (timeline.isEmpty) return ''
  const parts: string[] = []

  for (const c of timeline.chapters) {
    // A chapter with nothing derived would render as a bare heading, which in a
    // prompt reads as "this chapter is empty" rather than "not analysed yet".
    if (!c.summary && !c.events.length && !c.charactersPresent.length) continue

    const lines = [`## Chapter ${c.chapterNumber}${c.title ? ` — ${c.title}` : ''}`]
    if (c.summary) lines.push(c.summary)
    if (c.charactersPresent.length) lines.push(`Present: ${c.charactersPresent.join(', ')}`)
    if (c.locations.length) lines.push(`Where: ${c.locations.join(', ')}`)
    if (c.events.length) {
      lines.push('Changes:')
      for (const e of c.events) lines.push(`- ${e.text}`)
    }
    parts.push(lines.join('\n'))
  }

  return parts.length ? parts.join('\n\n') : ''
}
