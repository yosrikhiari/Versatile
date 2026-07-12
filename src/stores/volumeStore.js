import { defineStore } from 'pinia'
import {
  getVolumes,
  addVolume,
  updateVolume,
  deleteVolume,
  assignSectionToVolume,
  removeSectionFromVolume,
  getVolumeEntityCount
} from '../services/dbService'
// eslint-disable-next-line no-restricted-imports
import { useLoading } from '../composables/useLoading'

const VOLUME_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6'
]

const volumeColors = () => VOLUME_COLORS

export const useVolumeStore = defineStore('volume', () => {
  const {
    items: volumes,
    isLoading,
    load: loadVolumes
  } = useLoading(async (projectId) => {
    const vols = await getVolumes(projectId)
    vols.forEach((v) => {
      if (v.chapterIds && !v.sectionIds) v.sectionIds = v.chapterIds
      delete v.chapterIds
    })
    await Promise.all(
      vols.map(async (vol) => {
        const counts = await getVolumeEntityCount(vol.id)
        vol.entityCounts = {
          total: counts,
          character: await getVolumeEntityCount(vol.id, 'character'),
          location: await getVolumeEntityCount(vol.id, 'location'),
          plotThread: await getVolumeEntityCount(vol.id, 'plotThread')
        }
      })
    )
    return vols
  })

  async function createVolume(projectId, data) {
    const id = await addVolume(projectId, data)
    volumes.value.push({ id, projectId, sectionIds: [], ...data })
    return id
  }

  async function updateVolumeData(id, data, _projectId) {
    await updateVolume(id, data)
    const index = volumes.value.findIndex((v) => v.id === id)
    if (index !== -1) {
      volumes.value[index] = { ...volumes.value[index], ...data }
    }
  }

  async function deleteVolumeData(id, _projectId) {
    const volume = volumes.value.find((v) => v.id === id)
    if (volume?.sectionIds) {
      for (const sectionId of volume.sectionIds) {
        await removeSectionFromVolume(sectionId)
      }
    }
    await deleteVolume(id)
    volumes.value = volumes.value.filter((v) => v.id !== id)
  }

  async function assignSection(sectionId, volumeId, _projectId) {
    await assignSectionToVolume(sectionId, volumeId)
    if (volumeId) {
      const volume = volumes.value.find((v) => v.id === volumeId)
      if (volume && !volume.sectionIds.includes(sectionId)) {
        volume.sectionIds.push(sectionId)
      }
    }
    for (const vol of volumes.value) {
      if (vol.sectionIds && vol.id !== volumeId) {
        vol.sectionIds = vol.sectionIds.filter((id) => id !== sectionId)
      }
    }
  }

  async function removeSection(sectionId, _projectId) {
    await removeSectionFromVolume(sectionId)
    for (const vol of volumes.value) {
      if (vol.sectionIds) {
        vol.sectionIds = vol.sectionIds.filter((id) => id !== sectionId)
      }
    }
  }

  function getVolumeForSection(sectionId) {
    return volumes.value.find((v) => v.sectionIds?.includes(sectionId))
  }

  function getNextColor() {
    const usedColors = volumes.value.map((v) => v.color)
    const available = VOLUME_COLORS.filter((c) => !usedColors.includes(c))
    return available[0] || VOLUME_COLORS[volumes.value.length % VOLUME_COLORS.length]
  }

  return {
    volumes,
    isLoading,
    volumeColors,
    loadVolumes,
    createVolume,
    updateVolumeData,
    deleteVolumeData,
    assignSection,
    removeSection,
    getVolumeForSection,
    getNextColor,
    VOLUME_COLORS
  }
})
