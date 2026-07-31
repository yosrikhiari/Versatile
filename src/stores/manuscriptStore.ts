import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toPlain } from '../utils/toPlain'
import {
  getSections,
  addSection,
  updateSection,
  deleteSection,
  getSubsections,
  addSubsection,
  updateSubsection,
  deleteSubsection,
  reorderSubsections,
  reorderSections,
  getStoryElements,
  addStoryElement,
  addStoryElementsBatch,
  updateStoryElement,
  deleteStoryElement,
  getCharacterRelationships,
  addCharacterRelationship,
  updateCharacterRelationship,
  deleteCharacterRelationship
} from '../services/dbService'
// useStoryDocuments / useManuscriptContext orchestrate stores, so they're loaded
// lazily at call time (M-7.4) — a static import would couple the store to a
// composable and create a load-time cycle.
import { useProjectStore } from '../stores/projectStore'
import { useBranchStore } from '../stores/branchStore'

const STYLE_GUIDE_DEBOUNCE = 1500

export const useManuscriptStore = defineStore('manuscript', () => {
  const sections = ref<any[]>([])
  const subsections = ref<any[]>([])
  const storyElements = ref<any[]>([])
  const relationships = ref<any[]>([])
  const activeSectionId = ref<any | null>(null)
  const activeSubsectionId = ref<any | null>(null)
  const isLoading = ref(false)
  const loadError = ref<any | null>(null)
  const manuscriptContent = ref('')

  let styleGuideTimer: any = null

  function queueStyleGuideRegen() {
    if (styleGuideTimer) clearTimeout(styleGuideTimer)
    styleGuideTimer = setTimeout(async () => {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProjectId
      if (!projectId) return
      const { useStoryDocuments } = await import('../composables/useStoryDocuments')
      const storyDocs = useStoryDocuments()
      try {
        await storyDocs.regenerateDocument(projectId, 'style_guide')
      } catch (err: any) {
        console.error('[manuscriptStore] Failed to regenerate style guide:', err)
      }
    }, STYLE_GUIDE_DEBOUNCE)
  }

  const sortedSections = computed(() => {
    return [...sections.value].sort((a, b) => (a.order || 0) - (b.order || 0))
  })

  const activeSection = computed(() => {
    return sections.value.find((c) => c.id === activeSectionId.value)
  })

  const activeSubsection = computed(() => {
    return subsections.value.find((s) => s.id === activeSubsectionId.value)
  })

  const subsectionsBySection = computed(() => {
    const grouped: Record<string, any[]> = {}
    for (const subsection of subsections.value) {
      if (!grouped[subsection.sectionId]) {
        grouped[subsection.sectionId] = []
      }
      grouped[subsection.sectionId].push(subsection)
    }
    for (const key in grouped) {
      grouped[key].sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    return grouped
  })

  async function loadManuscript(projectId: any) {
    isLoading.value = true
    loadError.value = null
    try {
      const branchStore = useBranchStore()
      const branchId = (branchStore as any).activeBranch?.id
      sections.value = await getSections(projectId, branchId)
      subsections.value = await getSubsections(projectId, null, branchId)
      // Sorted by the canvas arrangement the author saved. Reading them back in
      // raw insertion order silently discarded any reordering they had done.
      // Elements predating `order` sort last but keep their relative order.
      storyElements.value = (await getStoryElements(projectId)).sort(
        (a: any, b: any) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
      )
      relationships.value = await getCharacterRelationships(projectId)
      import('../composables/useManuscriptContext')
        .then(({ warmEmbeddingCache }) => warmEmbeddingCache(projectId))
        .catch((err: any) => {
          console.error('Failed to warm embedding cache:', err)
        })
    } catch (e: any) {
      loadError.value = e.message
      console.error('[manuscriptStore] loadManuscript failed:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function addSectionData(projectId: any, data: any) {
    const branchStore = useBranchStore()
    const branchId = (branchStore as any).activeBranch?.id
    const order = sections.value.length
    const id = await addSection(projectId, toPlain({ ...data, order, status: 'planning', branchId }))
    sections.value.push({ id, projectId, order, status: 'planning', ...data })
    queueStyleGuideRegen()
    return id
  }

  async function updateSectionData(id: any, data: any, _projectId: any) {
    await updateSection(id, toPlain(data))
    const index = sections.value.findIndex((c) => c.id === id)
    if (index !== -1) {
      sections.value[index] = { ...sections.value[index], ...data }
    }
    queueStyleGuideRegen()
  }

  async function deleteSectionData(id: any, _projectId: any) {
    const sectionSubsections = subsections.value.filter((s) => s.sectionId === id)
    for (const subsection of sectionSubsections) {
      await deleteSubsection(subsection.id)
    }
    await deleteSection(id)
    sections.value = sections.value.filter((c) => c.id !== id)
    subsections.value = subsections.value.filter((s) => s.sectionId !== id)
    queueStyleGuideRegen()
  }

  async function reorderSectionsData(sectionIds: any, _projectId: any) {
    await reorderSections(sectionIds)
    sectionIds.forEach((id: any, index: any) => {
      const section = sections.value.find((c) => c.id === id)
      if (section) section.order = index
    })
  }

  async function addSubsectionData(projectId: any, sectionId: any, data: any) {
    const branchStore = useBranchStore()
    const branchId = (branchStore as any).activeBranch?.id
    const sectionSubsections = subsections.value.filter((s) => s.sectionId === sectionId)
    const order = sectionSubsections.length
    const id = await addSubsection(projectId, toPlain({ ...data, sectionId, order, branchId }))
    subsections.value.push({ id, projectId, sectionId, order, ...data })
    queueStyleGuideRegen()
    return id
  }

  async function updateSubsectionData(id: any, data: any, _projectId: any) {
    await updateSubsection(id, toPlain(data))
    const index = subsections.value.findIndex((s) => s.id === id)
    if (index !== -1) {
      subsections.value[index] = { ...subsections.value[index], ...data }
    }
    queueStyleGuideRegen()
  }

  async function deleteSubsectionData(id: any, _projectId: any) {
    await deleteSubsection(id)
    subsections.value = subsections.value.filter((s) => s.id !== id)
    queueStyleGuideRegen()
  }

  async function reorderSubsectionsData(subsectionIds: any, _projectId: any) {
    await reorderSubsections(subsectionIds)
    subsectionIds.forEach((id: any, index: any) => {
      const subsection = subsections.value.find((s) => s.id === id)
      if (subsection) subsection.order = index
    })
  }

  async function addStoryElementData(projectId: any, data: any) {
    const id = await addStoryElement(projectId, data)
    storyElements.value.push({ id, projectId, ...data })
    return id
  }

  /**
   * Add the canvas elements a generation run produced.
   *
   * Additive by construction — `planCanvasElements` has already filtered out
   * anything already on the canvas, so this never touches the author's layout.
   */
  async function addStoryElementsBatchData(projectId: any, dataList: any[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return []
    const ids = await addStoryElementsBatch(projectId, dataList)
    ids.forEach((id: any, i: any) => {
      storyElements.value.push({ id, projectId, ...dataList[i] })
    })
    return ids
  }

  async function updateStoryElementData(id: any, data: any, _projectId?: any) {
    await updateStoryElement(id, data)
    const index = storyElements.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      storyElements.value[index] = { ...storyElements.value[index], ...data }
    }
  }

  async function deleteStoryElementData(id: any, _projectId?: any) {
    await deleteStoryElement(id)
    storyElements.value = storyElements.value.filter((e) => e.id !== id)
  }

  async function addRelationshipData(projectId: any, data: any) {
    const id = await addCharacterRelationship(projectId, data)
    relationships.value.push({ id, projectId, ...data })
    return id
  }

  async function updateRelationshipData(id: any, data: any, _projectId: any) {
    await updateCharacterRelationship(id, data)
    const index = relationships.value.findIndex((r) => r.id === id)
    if (index !== -1) {
      relationships.value[index] = { ...relationships.value[index], ...data }
    }
  }

  async function deleteRelationshipData(id: any, _projectId: any) {
    await deleteCharacterRelationship(id)
    relationships.value = relationships.value.filter((r) => r.id !== id)
  }

  function setActiveSection(id: any) {
    activeSectionId.value = id
  }

  function setActiveSubsection(id: any) {
    activeSubsectionId.value = id
  }

  function setManuscriptContent(text: any) {
    manuscriptContent.value = text
  }

  function getFullText() {
    return manuscriptContent.value
  }

  function clearManuscript() {
    manuscriptContent.value = ''
  }

  return {
    sections,
    subsections,
    storyElements,
    relationships,
    activeSectionId,
    activeSubsectionId,
    sortedSections,
    activeSection,
    activeSubsection,
    subsectionsBySection,
    isLoading,
    loadError,
    loadManuscript,
    addSectionData,
    updateSectionData,
    deleteSectionData,
    reorderSectionsData,
    addSubsectionData,
    updateSubsectionData,
    deleteSubsectionData,
    reorderSubsectionsData,
    addStoryElementData,
    addStoryElementsBatchData,
    updateStoryElementData,
    deleteStoryElementData,
    addRelationshipData,
    updateRelationshipData,
    deleteRelationshipData,
    setActiveSection,
    setActiveSubsection,
    setManuscriptContent,
    getFullText,
    clearManuscript,
    triggerStyleGuideRegen: queueStyleGuideRegen
  }
})
