import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../services/db-core'
import { seedDemoStory } from '../../services/seedDemoStory'

describe('seedDemoStory (dev seeder)', () => {
  beforeAll(async () => {
    await db.open()
  })

  it('creates a 100-chapter / 10-volume / 300-scene story with a connected network', async () => {
    const { projectId } = await seedDemoStory({ force: true })

    const project = await db.projects.get(projectId)
    expect(project).toBeTruthy()
    expect(project.name).toContain('The Lighthouse Watch')

    const volumes = await db.volumes.where('projectId').equals(projectId).toArray()
    expect(volumes.length).toBe(10)
    for (const v of volumes) expect(v.sectionIds.length).toBe(10)

    const sections = await db.sections.where('projectId').equals(projectId).toArray()
    expect(sections.length).toBe(100)

    const subs = await db.subsections.where('projectId').equals(projectId).toArray()
    expect(subs.length).toBe(300)
    // Each scene carries the fields the consistency pipeline reads.
    expect(subs[0].charactersPresent?.length).toBeGreaterThan(0)
    expect(subs[0].location).toBeTruthy()

    const characters = await db.characters.where('projectId').equals(projectId).toArray()
    expect(characters.length).toBe(10)
    const locations = await db.locations.where('projectId').equals(projectId).toArray()
    expect(locations.length).toBe(8)
    const threads = await db.plotThreads.where('projectId').equals(projectId).toArray()
    expect(threads.length).toBe(10)

    // Story Network must be connected, not empty.
    const nodeInstances = await db.graphNodeInstances.where('projectId').equals(projectId).toArray()
    expect(nodeInstances.length).toBe(28) // 10 characters + 8 locations + 10 plot threads
    const graphEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
    expect(graphEdges.length).toBeGreaterThan(0)

    const groups = await db.graphGroupsV2.where('projectId').equals(projectId).toArray()
    expect(groups.length).toBe(10)
    for (const g of groups) expect(g.volumeId).toBeTruthy()

    // Dashboard word count is populated.
    const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
    expect(manuscript).toBeTruthy()
    expect(manuscript.wordCount).toBeGreaterThan(0)
  })

  it('produces varied, non-degenerate chapter content', async () => {
    const { projectId } = await seedDemoStory({ force: true })

    // The manuscript carries real prose, not a one-line summary, so the dashboard
    // word count reflects an actual ~300-word scene per subsection.
    const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
    expect(manuscript.wordCount).toBeGreaterThan(30000)

    const sections = await db.sections.where('projectId').equals(projectId).toArray()
    const subs = await db.subsections.where('projectId').equals(projectId).toArray()

    // Chapter titles are distinct, not all identical.
    expect(new Set(sections.map((s) => s.title)).size).toBeGreaterThan(10)

    // Scene titles are distinct across the manuscript (not "Scene 1..3").
    expect(new Set(subs.map((s) => s.title)).size).toBeGreaterThan(5)

    // A large-cast volume rotates its cast across chapters (not identical every chapter).
    const volumes = await db.volumes.where('projectId').equals(projectId).toArray()
    const siege = volumes.find((vol) => vol.title === 'The Long Siege')
    expect(siege).toBeTruthy()
    const siegeSections = sections.filter((s) => s.volumeId === siege.id)
    const castSets = new Set()
    for (const sec of siegeSections) {
      const cast = subs
        .filter((s) => s.sectionId === sec.id)
        .flatMap((s) => s.charactersPresent)
        .sort()
      castSets.add(cast.join('|'))
    }
    expect(castSets.size).toBeGreaterThan(1)

    // Seam continuity: consecutive chapters in that volume share >= 1 character.
    const ordered = siegeSections.sort((a, b) => a.order - b.order)
    let seamOk = true
    for (let i = 1; i < ordered.length; i++) {
      const prev = new Set(
        subs.filter((s) => s.sectionId === ordered[i - 1].id).flatMap((s) => s.charactersPresent)
      )
      const cur = subs
        .filter((s) => s.sectionId === ordered[i].id)
        .flatMap((s) => s.charactersPresent)
      if (!cur.some((c) => prev.has(c))) {
        seamOk = false
        break
      }
    }
    expect(seamOk).toBe(true)
  })

  it('builds a connected, organised story network', async () => {
    const { projectId } = await seedDemoStory({ force: true })

    const characters = await db.characters.where('projectId').equals(projectId).toArray()
    const locations = await db.locations.where('projectId').equals(projectId).toArray()
    const threads = await db.plotThreads.where('projectId').equals(projectId).toArray()
    // Edges store RAW entity ids (see getEntityBaseId in StoryNetwork.vue), so the
    // connectivity check compares against the raw ids, not the `char-`/`loc-`/`thread-` keys.
    const expectedIds = new Set([
      ...characters.map((c) => c.id),
      ...locations.map((l) => l.id),
      ...threads.map((t) => t.id)
    ])

    const edges = await db.graphEdges.where('projectId').equals(projectId).toArray()
    expect(edges.length).toBeGreaterThan(50)

    const endpoints = new Set()
    for (const e of edges) {
      endpoints.add(e.sourceId)
      endpoints.add(e.targetId)
    }
    // No node left dangling: every character, location and thread participates in
    // at least one edge. Edges store raw ids (not `char-`/`loc-`/`thread-` keys);
    // the canvas re-applies the prefix itself.
    for (const id of expectedIds) {
      expect(endpoints.has(id), `node ${id} is unlinked`).toBe(true)
    }

    const relTypes = new Set(edges.map((e) => e.relationshipType))
    // Threads form one spine rather than ten isolated clusters.
    expect(relTypes.has('leads_to')).toBe(true)
    // Antagonist pairs are typed as enemies, not allies.
    expect(relTypes.has('enemy')).toBe(true)
  })

  it('is idempotent without force (does not duplicate the project)', async () => {
    const first = await seedDemoStory()
    const second = await seedDemoStory()
    expect(second.projectId).toBe(first.projectId)

    const all = await db.projects.where('name').equals(first.title).toArray()
    expect(all.length).toBe(1)
  })
})
