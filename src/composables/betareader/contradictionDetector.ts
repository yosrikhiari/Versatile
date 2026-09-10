import { aiGenerateJson } from '../useAiService'
import { runDeterministicContradictionChecks, generateContradictionCandidates, buildCandidateLedgerText, indexScenesByChapter, DEFAULT_MAX_SCENES_PER_CHAPTER, type DeterministicContradiction } from '../../services/generation/deterministicContradictions'
import { runCrossChapterRuleChecks, checkVolumeDrift, checkVolumeInflux, orderVolumesByChapter } from '../../services/generation/crossChapterRules'
import { getProjectDigests, getProjectChapterDigests, getProjectVolumeDigests, getEntityStateTimeline } from '../../services/db-digests'
import type { SceneDigest } from '../../services/generation/sceneDigest'
import type { EntityStateRecord } from '../../services/generation/entityStates'

const CONTRADICTION_SCHEMA = {
  type: 'object',
  properties: {
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['error', 'warning'] },
          category: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          betweenScenes: { type: 'array', items: { type: 'string' } }
        },
        required: ['severity', 'category', 'title', 'description', 'betweenScenes']
      }
    }
  },
  required: ['contradictions']
}

const CONTRADICTION_PROMPT = `You are a manuscript continuity expert.
Given the fact ledger for specific scene pairs in a manuscript, identify any contradictions between them.

Categories to check:
- character_state: A character alive, dead, injured, or located inconsistently
- appearance: Physical description changes (eye color, hair, clothing)
- timeline: Events out of chronological order or impossible duration
- knowledge: Character knows something they shouldn't yet
- object_state: Object destroyed but later used, lost but later held
- location_geometry: Impossible spatial relationships between locations
- relationship: Character relationships that contradict earlier scenes

For each contradiction, specify severity (error = definite mistake, warning = likely mistake).
Include which scenes are in conflict by scene number.
Respond ONLY with valid JSON matching the schema.`

export async function detectContradictions(
  sceneLedgers: any,
  scenes: any,
  aiOptions: any,
  deps?: { generateJson?: typeof aiGenerateJson }
) {
  const generateJson = deps?.generateJson ?? aiGenerateJson
  // Phase 2: Hierarchical contradiction detection
  // 1. Get scene digests for deterministic rule checking
  const projectId = scenes[0]?.projectId
  let sceneDigests: SceneDigest[] = []
  let entityStates: EntityStateRecord[] = []
  let chapterDigests: Array<{ chapterNumber: number; summary: string }> = []
  let volumeDigests: Array<{ volumeId: string; charactersPresent?: string[] | null; locations?: string[] | null }> = []
  if (projectId) {
    sceneDigests = await getProjectDigests(projectId)
    // The entity-state timeline is what the deterministic rules actually run on.
    // Absent (a project analysed before the state layer had a writer) it degrades
    // to the digest-only rules rather than failing the pass.
    entityStates = await getEntityStateTimeline(projectId).catch(() => [])
    // Chapter rollups are newer than both. Absent, ledger text renders every
    // candidate scene verbatim exactly as before.
    chapterDigests = await getProjectChapterDigests(projectId).catch(() => [])
    // Volume rollups are newest. Absent, Pass 2 simply has no drift input.
    volumeDigests = await getProjectVolumeDigests(projectId).catch(() => [])
  }

  // 2. Pass 1: chapter groups. The shared scene→chapter index first
  // (states, then scenes array); unresolvable scenes are absent from it.
  const chapterByScene = indexScenesByChapter(entityStates, scenes)
  // Rules, candidates and the LLM batch all run per group; the null group
  // run per group; the null group holds whatever no chapter resolves
  // (states, digests and ledgers alike) so nothing is ever dropped for
  // lack of a chapter. Group order is numeric chapters first, null last.
  const groupOfSceneId = (sid: unknown): number | null =>
    chapterByScene.get(String(sid)) ?? null
  const digestsByGroup = new Map<number | null, SceneDigest[]>()
  for (const d of sceneDigests) {
    const k = typeof d.chapterNumber === 'number' ? d.chapterNumber : null
    if (!digestsByGroup.has(k)) digestsByGroup.set(k, [])
    digestsByGroup.get(k)!.push(d)
  }
  const statesByGroup = new Map<number | null, EntityStateRecord[]>()
  for (const s of entityStates) {
    const k = groupOfSceneId(s.sceneId)
    if (!statesByGroup.has(k)) statesByGroup.set(k, [])
    statesByGroup.get(k)!.push(s)
  }
  const groupKeys = [...new Set([...digestsByGroup.keys(), ...statesByGroup.keys()])].sort(
    (a, b) => (a === null ? 1 : b === null ? -1 : a - b)
  )

  // Deterministic findings across Pass 1 (per group, in group order) and
  // Pass 2 (whole-timeline cross-chapter rules). Pass 1 is chapter-scoped
  // so spanning pairs are invisible to it — Pass 2 owns those and skips
  // same-chapter pairs, so no finding is ever reported twice.
  const pass1Findings: DeterministicContradiction[] = []
  const candidatesByGroup = new Map<number | null, Array<{ sceneA: string; sceneB: string; reason: string }>>()
  for (const g of groupKeys) {
    const groupDigests = digestsByGroup.get(g) ?? []
    const groupStates = statesByGroup.get(g) ?? []
    // One rule run per group: findings and their candidate pairs both come
    // from this group's own pass, never the merged list.
    const groupFindings = await runDeterministicContradictionChecks(
      groupDigests,
      scenes,
      groupStates
    )
    pass1Findings.push(...groupFindings)
    candidatesByGroup.set(
      g,
      generateContradictionCandidates(groupDigests, groupFindings, groupStates)
    )
  }
  const pass2Findings = await runCrossChapterRuleChecks(entityStates)
  // Volume drift is display-only rollup analysis: order volumes by lowest
  // chapter (chapter digests supply labels), then pairwise drift + influx.
  const chaptersByVolume = new Map<string, number[]>()
  for (const d of chapterDigests as Array<{ volumeId?: string | null; chapterNumber?: number | null }>) {
    if (d?.volumeId == null || typeof d.chapterNumber !== 'number') continue
    if (!chaptersByVolume.has(d.volumeId)) chaptersByVolume.set(d.volumeId, [])
    chaptersByVolume.get(d.volumeId)!.push(d.chapterNumber)
  }
  const orderedVolumes = orderVolumesByChapter(volumeDigests, chapterDigests as Array<{ volumeId?: string | null; chapterNumber?: number | null }>)
  pass2Findings.push(
    ...checkVolumeDrift(orderedVolumes, chaptersByVolume),
    ...checkVolumeInflux(orderedVolumes)
  )
  const allDeterministic = [...pass1Findings, ...pass2Findings]
  
  // Deterministic findings are normalised ONCE, here, and reused on both exits.
  // Previously only the no-candidates path built `betweenScenes` and `action`,
  // so as soon as a single candidate pair existed every deterministic finding
  // lost its scene references and its "Jump to Scene" — exactly the findings
  // that carry precise scene ids in the first place.
  // Pass-1 grouping: findings are attributed to the chapter of their first
  // scene (states first, scenes array second). Ids gain a chapter prefix
  // ONLY when findings genuinely span chapters; single-chapter runs keep
  // the legacy `contradiction-{i}` ids byte-identical.
  const distinctChapters = new Set(chapterByScene.values())
  // Prefixing activates when the RUN spans chapters (not merely when
  // findings do): a lone ch1→ch2 finding in a two-chapter book is still
  // addressed to its chapter.
  const multiChapter = distinctChapters.size > 1
  const perChapterIndex = new Map<number, number>()
  const nextId = (sceneIds: string[], fallback: number): string => {
    const key = sceneIds.length ? (chapterByScene.get(String(sceneIds[0])) ?? null) : null
    if (multiChapter && key !== null) {
      const n = perChapterIndex.get(key) ?? 0
      perChapterIndex.set(key, n + 1)
      return `contradiction-${key}-${n}`
    }
    return `contradiction-${fallback}`
  }
  let detIndex = 0
  const deterministicResults = allDeterministic.map((c) => {
    const id = nextId(c.sceneIds, detIndex++)
    return {
      id,
    severity: c.severity,
    category: c.type,
    pass: 'contradictions',
    title: c.description.split('.')[0],
    description: c.description,
    // The facts the rule fired on. A deterministic finding an author can't
    // trace back to a sentence reads as a false positive whether or not it is.
    evidence: c.evidence ?? [],
    betweenScenes: c.sceneIds.map(
      (sid) => `Scene ${scenes.find((s: any) => s.id === sid)?.sceneNumber ?? '?'}`
    ),
    action:
      c.sceneIds.length > 0
        ? {
            label: 'Jump to Scene',
            type: 'open-section',
            payload: { subsectionId: c.sceneIds[0] },
            sceneId: c.sceneIds[0]
          }
        : null
    }
  })

  // 3. Per-group candidate pairs and LLM verification. A group with no
  // candidates skips its model call entirely, as the flat pipeline did.
  // Ledger substitution counts within the group — the group is the unit
  // the model actually sees.
  const llmContradictions: any[] = []
  let llmFallback = allDeterministic.length
  const sceneByNumber: Record<number, any> = {}
  for (const s of scenes as any[]) {
    sceneByNumber[s.sceneNumber] = s
  }
  for (const g of groupKeys) {
    const candidates = candidatesByGroup.get(g) ?? []
    if (candidates.length === 0) continue

    const candidateSceneIds = new Set<string>()
    for (const c of candidates) {
      candidateSceneIds.add(c.sceneA)
      candidateSceneIds.add(c.sceneB)
    }
    const relevantLedgers = sceneLedgers.filter((l: any) =>
      candidateSceneIds.has(l.sceneId ?? l.id)
    )
    const ledgerText = buildCandidateLedgerText({
      ledgers: relevantLedgers,
      scenes,
      entityStates,
      chapterDigests,
      maxScenesPerChapter: DEFAULT_MAX_SCENES_PER_CHAPTER
    })
    const prompt = `Focused fact ledger for specific scene pairs (deterministic rules already checked):\n\n${ledgerText}`
    const parsed = await generateJson(prompt, CONTRADICTION_PROMPT, {
      ...aiOptions,
      schema: CONTRADICTION_SCHEMA,
      schemaName: 'contradiction_detection'
    }).catch(() => null) as { contradictions?: any[] } | null
    if (!parsed?.contradictions) continue

    for (const c of parsed.contradictions) {
      const sceneIds = (c.betweenScenes || [])
        .map((num: any) => {
          const match = num.match(/\d+/)
          return match ? sceneByNumber[parseInt(match[0])]?.id : null
        })
        .filter(Boolean)

      llmContradictions.push({
        id: nextId(sceneIds, llmFallback++),
        severity: c.severity,
        category: c.category || 'contradiction',
        pass: 'contradictions',
        title: c.title,
        description: c.description,
        betweenScenes: c.betweenScenes || [],
        action:
          sceneIds.length > 0
            ? {
                label: 'Jump to Scene',
                type: 'open-section',
                payload: { subsectionId: sceneIds[0] },
                sceneId: sceneIds[0]
              }
            : null
      })
    }
  }

  // Combine deterministic (Pass 1 groups, then Pass 2) + LLM results.
  return [...deterministicResults, ...llmContradictions]
}
