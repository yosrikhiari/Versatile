import { defineStore } from 'pinia'
import { 
  getVolumes, addVolume, updateVolume, deleteVolume,
  assignChapterToVolume, removeChapterFromVolume,
  getVolumeEntityCount
} from '../services/dbService'
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
  '#3b82f6',
]

const volumeColors = () => VOLUME_COLORS

export const useVolumeStore = defineStore('volume', () => {
  const { items: volumes, isLoading, load: loadVolumes } = useLoading(async (projectId) => {
    const vols = await getVolumes(projectId)
    await Promise.all(vols.map(async (vol) => {
      const counts = await getVolumeEntityCount(vol.id)
      vol.entityCounts = {
        total: counts,
        character: await getVolumeEntityCount(vol.id, 'character'),
        location: await getVolumeEntityCount(vol.id, 'location'),
        plotThread: await getVolumeEntityCount(vol.id, 'plotThread')
      }
    }))
    return vols
  })

  async function createVolume(projectId, data) {
    const id = await addVolume(projectId, data)
    volumes.value.push({ id, projectId, chapterIds: [], ...data })
    return id
  }

  async function updateVolumeData(id, data, _projectId) {
    await updateVolume(id, data)
    const index = volumes.value.findIndex(v => v.id === id)
    if (index !== -1) {
      volumes.value[index] = { ...volumes.value[index], ...data }
    }
  }

  async function deleteVolumeData(id, _projectId) {
    const volume = volumes.value.find(v => v.id === id)
    if (volume?.chapterIds) {
      for (const chapterId of volume.chapterIds) {
        await removeChapterFromVolume(chapterId)
      }
    }
    await deleteVolume(id)
    volumes.value = volumes.value.filter(v => v.id !== id)
  }

  async function assignChapter(chapterId, volumeId, _projectId) {
    await assignChapterToVolume(chapterId, volumeId)
    if (volumeId) {
      const volume = volumes.value.find(v => v.id === volumeId)
      if (volume && !volume.chapterIds.includes(chapterId)) {
        volume.chapterIds.push(chapterId)
      }
    }
    for (const vol of volumes.value) {
      if (vol.chapterIds && vol.id !== volumeId) {
        vol.chapterIds = vol.chapterIds.filter(id => id !== chapterId)
      }
    }
  }

  async function removeChapter(chapterId, _projectId) {
    await removeChapterFromVolume(chapterId)
    for (const vol of volumes.value) {
      if (vol.chapterIds) {
        vol.chapterIds = vol.chapterIds.filter(id => id !== chapterId)
      }
    }
  }

  function getVolumeForChapter(chapterId) {
    return volumes.value.find(v => v.chapterIds?.includes(chapterId))
  }

  function getNextColor() {
    const usedColors = volumes.value.map(v => v.color)
    const available = VOLUME_COLORS.filter(c => !usedColors.includes(c))
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
    assignChapter,
    removeChapter,
    getVolumeForChapter,
    getNextColor,
    VOLUME_COLORS
  }
})