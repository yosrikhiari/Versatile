import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getSections, addSection, updateSection, deleteSection,
  getSubsections, addSubsection, updateSubsection, deleteSubsection, reorderSubsections, reorderSections,
  getStoryElements, addStoryElement, updateStoryElement, deleteStoryElement,
  getCharacterRelationships, addCharacterRelationship, updateCharacterRelationship, deleteCharacterRelationship
} from '../services/dbService'
import { warmEmbeddingCache } from '../composables/useManuscriptContext'

export const useManuscriptStore = defineStore('manuscript', () => {
  const sections = ref([])
  const subsections = ref([])
  const storyElements = ref([])
  const relationships = ref([])
  const activeSectionId = ref(null)
  const activeSubsectionId = ref(null)

  const sortedSections = computed(() => {
    return [...sections.value].sort((a, b) => (a.order || 0) - (b.order || 0))
  })

  const activeSection = computed(() => {
    return sections.value.find(c => c.id === activeSectionId.value)
  })

  const activeSubsection = computed(() => {
    return subsections.value.find(s => s.id === activeSubsectionId.value)
  })

  const subsectionsBySection = computed(() => {
    const grouped = {}
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

  async function loadManuscript(projectId) {
    sections.value = await getSections(projectId)
    subsections.value = await getSubsections(projectId)
    storyElements.value = await getStoryElements(projectId)
    relationships.value = await getCharacterRelationships(projectId)
    warmEmbeddingCache(projectId).catch((err) => {
      console.error('Failed to warm embedding cache:', err)
    })
  }

  async function addSectionData(projectId, data) {
    const order = sections.value.length
    const id = await addSection(projectId, { ...data, order, status: 'planning' })
    sections.value.push({ id, projectId, order, status: 'planning', ...data })
    return id
  }

  async function updateSectionData(id, data, projectId) {
    await updateSection(id, data)
    const index = sections.value.findIndex(c => c.id === id)
    if (index !== -1) {
      sections.value[index] = { ...sections.value[index], ...data }
    }
  }

  async function deleteSectionData(id, projectId) {
    const sectionSubsections = subsections.value.filter(s => s.sectionId === id)
    for (const subsection of sectionSubsections) {
      await deleteSubsection(subsection.id)
    }
    await deleteSection(id)
    sections.value = sections.value.filter(c => c.id !== id)
    subsections.value = subsections.value.filter(s => s.sectionId !== id)
  }

  async function reorderSectionsData(sectionIds, projectId) {
    await reorderSections(sectionIds)
    sectionIds.forEach((id, index) => {
      const section = sections.value.find(c => c.id === id)
      if (section) section.order = index
    })
  }

  async function addSubsectionData(projectId, sectionId, data) {
    const sectionSubsections = subsections.value.filter(s => s.sectionId === sectionId)
    const order = sectionSubsections.length
    const id = await addSubsection(projectId, { ...data, sectionId, order })
    subsections.value.push({ id, projectId, sectionId, order, ...data })
    return id
  }

  async function updateSubsectionData(id, data, projectId) {
    await updateSubsection(id, data)
    const index = subsections.value.findIndex(s => s.id === id)
    if (index !== -1) {
      subsections.value[index] = { ...subsections.value[index], ...data }
    }
  }

  async function deleteSubsectionData(id, projectId) {
    await deleteSubsection(id)
    subsections.value = subsections.value.filter(s => s.id !== id)
  }

  async function reorderSubsectionsData(subsectionIds, projectId) {
    await reorderSubsections(subsectionIds)
    subsectionIds.forEach((id, index) => {
      const subsection = subsections.value.find(s => s.id === id)
      if (subsection) subsection.order = index
    })
  }

  async function addStoryElementData(projectId, data) {
    const id = await addStoryElement(projectId, data)
    storyElements.value.push({ id, projectId, ...data })
    return id
  }

  async function updateStoryElementData(id, data, projectId) {
    await updateStoryElement(id, data)
    const index = storyElements.value.findIndex(e => e.id === id)
    if (index !== -1) {
      storyElements.value[index] = { ...storyElements.value[index], ...data }
    }
  }

  async function deleteStoryElementData(id, projectId) {
    await deleteStoryElement(id)
    storyElements.value = storyElements.value.filter(e => e.id !== id)
  }

  async function addRelationshipData(projectId, data) {
    const id = await addCharacterRelationship(projectId, data)
    relationships.value.push({ id, projectId, ...data })
    return id
  }

  async function updateRelationshipData(id, data, projectId) {
    await updateCharacterRelationship(id, data)
    const index = relationships.value.findIndex(r => r.id === id)
    if (index !== -1) {
      relationships.value[index] = { ...relationships.value[index], ...data }
    }
  }

  async function deleteRelationshipData(id, projectId) {
    await deleteCharacterRelationship(id)
    relationships.value = relationships.value.filter(r => r.id !== id)
  }

  function setActiveSection(id) {
    activeSectionId.value = id
  }

  function setActiveSubsection(id) {
    activeSubsectionId.value = id
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
    updateStoryElementData,
    deleteStoryElementData,
    addRelationshipData,
    updateRelationshipData,
    deleteRelationshipData,
    setActiveSection,
    setActiveSubsection
  }
})
