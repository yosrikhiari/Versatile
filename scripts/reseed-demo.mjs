import 'fake-indexeddb/auto'
import { db } from '../src/services/db-core'
import { seedDemoStory } from '../src/services/seedDemoStory'

await db.open()
const { projectId, title } = await seedDemoStory({ force: true })

const [volumes, sections, subs, characters, locations, threads, groups, edges] = await Promise.all([
  db.volumes.where('projectId').equals(projectId).toArray(),
  db.sections.where('projectId').equals(projectId).toArray(),
  db.subsections.where('projectId').equals(projectId).toArray(),
  db.characters.where('projectId').equals(projectId).toArray(),
  db.locations.where('projectId').equals(projectId).toArray(),
  db.plotThreads.where('projectId').equals(projectId).toArray(),
  db.graphGroupsV2.where('projectId').equals(projectId).toArray(),
  db.graphEdges.where('projectId').equals(projectId).toArray()
])
const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()

console.log(`\n=== Regenerated: ${title} ===`)
console.log(`volumes=${volumes.length} chapters=${sections.length} scenes=${subs.length}`)
console.log(`bible: ${characters.length} characters / ${locations.length} locations / ${threads.length} threads`)
console.log(`manuscript word count: ${manuscript.wordCount}`)
console.log(`distinct chapter titles: ${new Set(sections.map((s) => s.title)).size}`)
console.log(`distinct scene titles: ${new Set(subs.map((s) => s.title)).size}`)

// Network — edges store RAW entity ids (the canvas re-applies the
// `char-`/`loc-`/`thread-` prefix itself), so the connectivity check uses raw ids.
const expectedIds = new Set([
  ...characters.map((c) => c.id),
  ...locations.map((l) => l.id),
  ...threads.map((t) => t.id)
])
const endpoints = new Set()
for (const e of edges) {
  endpoints.add(e.sourceId)
  endpoints.add(e.targetId)
}
const dangling = [...expectedIds].filter((id) => !endpoints.has(id))
const relHistogram = {}
for (const e of edges) relHistogram[e.relationshipType] = (relHistogram[e.relationshipType] || 0) + 1

console.log(`\n=== Story Network ===`)
console.log(`groups=${groups.length} edges=${edges.length}`)
console.log(`dangling nodes: ${dangling.length === 0 ? 'NONE' : dangling.join(', ')}`)
console.log('relationship types:', JSON.stringify(relHistogram))
console.log(`thread spine (leads_to): ${edges.filter((e) => e.relationshipType === 'leads_to').length} edges`)
console.log(`enemy links: ${edges.filter((e) => e.relationshipType === 'enemy').length}`)
console.log(`location↔location: ${edges.filter((e) => e.sourceType === 'location' && e.targetType === 'location').length}`)

// Seam continuity + cast rotation sample (volume 8 = The Long Siege, 9-char cast)
const siege = volumes.find((v) => v.title === 'The Long Siege')
const siegeChapters = sections.filter((s) => s.volumeId === siege.id).sort((a, b) => a.order - b.order)
const castSets = new Set()
let seamOk = true
for (let i = 0; i < siegeChapters.length; i++) {
  const cast = [...new Set(subs.filter((s) => s.sectionId === siegeChapters[i].id).flatMap((s) => s.charactersPresent))]
  castSets.add(cast.join('|'))
  if (i > 0) {
    const prev = new Set(subs.filter((s) => s.sectionId === siegeChapters[i - 1].id).flatMap((s) => s.charactersPresent))
    if (!cast.some((c) => prev.has(c))) seamOk = false
  }
}
console.log(`\n=== Volume "The Long Siege" (rotating 9-char cast) ===`)
console.log(`distinct chapter casts: ${castSets.size} (of 10 chapters)`)
console.log(`seam continuity across chapters: ${seamOk ? 'OK' : 'BROKEN'}`)
console.log('sample casts:')
siegeChapters.slice(0, 4).forEach((sec) => {
  const cast = [...new Set(subs.filter((s) => s.sectionId === sec.id).flatMap((s) => s.charactersPresent))]
  console.log(`  ${sec.title} → ${cast.join(', ')}`)
})
