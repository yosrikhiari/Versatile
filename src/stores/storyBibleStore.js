import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getCharacters, addCharacter, updateCharacter, deleteCharacter,
  getLocations, addLocation, updateLocation, deleteLocation,
  getPlotThreads, addPlotThread, updatePlotThread, deletePlotThread
} from '../services/dbService'

export const useStoryBibleStore = defineStore('storyBible', () => {
  const characters = ref([])
  const locations = ref([])
  const plotThreads = ref([])

  async function loadAll(projectId) {
    characters.value = await getCharacters(projectId)
    locations.value = await getLocations(projectId)
    plotThreads.value = await getPlotThreads(projectId)
  }

  async function addCharacterData(projectId, data) {
    const id = await addCharacter(projectId, data)
    characters.value.push({ id, projectId, ...data })
    return id
  }

  async function updateCharacterData(id, data, projectId) {
    await updateCharacter(id, data)
    const index = characters.value.findIndex(c => c.id === id)
    if (index !== -1) {
      characters.value[index] = { ...characters.value[index], ...data }
    }
  }

  async function deleteCharacterData(id, projectId) {
    await deleteCharacter(id)
    characters.value = characters.value.filter(c => c.id !== id)
  }

  async function addLocationData(projectId, data) {
    const id = await addLocation(projectId, data)
    locations.value.push({ id, projectId, ...data })
    return id
  }

  async function updateLocationData(id, data, projectId) {
    await updateLocation(id, data)
    const index = locations.value.findIndex(l => l.id === id)
    if (index !== -1) {
      locations.value[index] = { ...locations.value[index], ...data }
    }
  }

  async function deleteLocationData(id, projectId) {
    await deleteLocation(id)
    locations.value = locations.value.filter(l => l.id !== id)
  }

  async function addPlotThreadData(projectId, data) {
    const id = await addPlotThread(projectId, data)
    plotThreads.value.push({ id, projectId, ...data })
    return id
  }

  async function updatePlotThreadData(id, data, projectId) {
    await updatePlotThread(id, data)
    const index = plotThreads.value.findIndex(t => t.id === id)
    if (index !== -1) {
      plotThreads.value[index] = { ...plotThreads.value[index], ...data }
    }
  }

  async function deletePlotThreadData(id, projectId) {
    await deletePlotThread(id)
    plotThreads.value = plotThreads.value.filter(t => t.id !== id)
  }

  async function updateThreadStatus(id, status, projectId) {
    await updatePlotThread(id, { status })
    const index = plotThreads.value.findIndex(t => t.id === id)
    if (index !== -1) {
      plotThreads.value[index].status = status
    }
  }

  function getCharacterNames() {
    return characters.value.map(c => c.name)
  }

  return {
    characters,
    locations,
    plotThreads,
    loadAll,
    addCharacterData,
    updateCharacterData,
    deleteCharacterData,
    addLocationData,
    updateLocationData,
    deleteLocationData,
    addPlotThreadData,
    updatePlotThreadData,
    deletePlotThreadData,
    updateThreadStatus,
    getCharacterNames
  }
})