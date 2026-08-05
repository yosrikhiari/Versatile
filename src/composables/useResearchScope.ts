import { ref, computed } from 'vue'

// Research-source selection for the story generator: which imported documents
// inform the plan. Extracted from StoryGeneratorPanel.vue so that component can
// stay an orchestrator. DOM-free; the only dependency is a getter for the
// current project id, so the selection logic is unit-testable in isolation.
export function useResearchScope(getProjectId: any) {
  const researchDocs = ref<any[]>([]) // [{ id, fileName, chunkCount }]
  const useResearch = ref(true)
  const selectedResearchDocIds = ref(new Set())

  const hasResearchDocs = computed(() => researchDocs.value.length > 0)
  const selectedResearchCount = computed(() => {
    let n = 0
    for (const d of researchDocs.value) if (selectedResearchDocIds.value.has(d.id)) n++
    return n
  })

  // Reloadable: the panel calls this on mount AND whenever the project changes,
  // because a document imported after the panel mounted was otherwise invisible
  // to the generator — the list stayed empty, so buildResearchScope() returned
  // undefined and the run silently used no research at all.
  let hasLoadedOnce = false

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
      const previous = researchDocs.value
      const previouslySelected = selectedResearchDocIds.value
      researchDocs.value = docs.map((d: any) => ({
        id: d.id,
        fileName: d.fileName || 'Untitled source',
        chunkCount: counts.get(d.id) || 0
      }))

      if (!hasLoadedOnce) {
        // Default: every source selected (narrow, don't opt-in).
        selectedResearchDocIds.value = new Set(researchDocs.value.map((d) => d.id))
        hasLoadedOnce = true
        return
      }

      // A reload must not silently discard the user's choices. Keep what they
      // picked, drop ids that no longer exist, and select anything new — a
      // document imported mid-session should behave like one that was there.
      const known = new Set(previous.map((d: any) => d.id))
      const next = new Set()
      for (const d of researchDocs.value) {
        if (!known.has(d.id) || previouslySelected.has(d.id)) next.add(d.id)
      }
      selectedResearchDocIds.value = next
    } catch {
      // Research sources are optional context; a load failure just means none.
      researchDocs.value = []
    }
  }

  function toggleResearchDoc(id: any) {
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
