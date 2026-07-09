import { ref, computed } from 'vue'

// Research-source selection for the story generator: which imported documents
// inform the plan. Extracted from StoryGeneratorPanel.vue so that component can
// stay an orchestrator. DOM-free; the only dependency is a getter for the
// current project id, so the selection logic is unit-testable in isolation.
export function useResearchScope(getProjectId) {
  const researchDocs = ref([]) // [{ id, fileName, chunkCount }]
  const useResearch = ref(true)
  const selectedResearchDocIds = ref(new Set())

  const hasResearchDocs = computed(() => researchDocs.value.length > 0)
  const selectedResearchCount = computed(() => {
    let n = 0
    for (const d of researchDocs.value) if (selectedResearchDocIds.value.has(d.id)) n++
    return n
  })

  async function loadResearchSources() {
    const projectId = getProjectId?.()
    if (!projectId) return
    try {
      const { getAllResearchDocuments, getAllChunksForProject } =
        await import('../services/researchDb')
      const [docs, chunks] = await Promise.all([
        getAllResearchDocuments(projectId),
        getAllChunksForProject(projectId)
      ])
      const counts = new Map()
      for (const c of chunks) counts.set(c.documentId, (counts.get(c.documentId) || 0) + 1)
      researchDocs.value = docs.map((d) => ({
        id: d.id,
        fileName: d.fileName || 'Untitled source',
        chunkCount: counts.get(d.id) || 0
      }))
      // Default: every source selected (narrow, don't opt-in).
      selectedResearchDocIds.value = new Set(researchDocs.value.map((d) => d.id))
    } catch {
      // Research sources are optional context; a load failure just means none.
      researchDocs.value = []
    }
  }

  function toggleResearchDoc(id) {
    const next = new Set(selectedResearchDocIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedResearchDocIds.value = next
  }

  function selectAllResearch() {
    selectedResearchDocIds.value = new Set(researchDocs.value.map((d) => d.id))
  }

  function selectNoResearch() {
    selectedResearchDocIds.value = new Set()
  }

  // The scope object passed to the generator. `documentIds: []` means "use all"
  // per the director contract, so we only send explicit IDs when the user has
  // deselected at least one source.
  function buildResearchScope() {
    if (!hasResearchDocs.value) return undefined
    // Toggle off, or on but with nothing selected → no research context.
    if (!useResearch.value || selectedResearchCount.value === 0) {
      return { enabled: false, documentIds: [] }
    }
    const allSelected = selectedResearchCount.value === researchDocs.value.length
    // documentIds: [] is the director's "use all" signal; only send explicit IDs
    // once the user has narrowed the set.
    return {
      enabled: true,
      documentIds: allSelected ? [] : [...selectedResearchDocIds.value]
    }
  }

  return {
    researchDocs,
    useResearch,
    selectedResearchDocIds,
    hasResearchDocs,
    selectedResearchCount,
    loadResearchSources,
    toggleResearchDoc,
    selectAllResearch,
    selectNoResearch,
    buildResearchScope
  }
}
