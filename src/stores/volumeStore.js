import { defineStore } from 'pinia'
import { ref } from 'vue'
import { 
  getVolumes, addVolume, updateVolume, deleteVolume,
  assignChapterToVolume, removeChapterFromVolume,
  getVolumeEntityCount
} from '../services/dbService'

const VOLUME_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
]

const volumeColors = () => VOLUME_COLORS

export const useVolumeStore = defineStore('volume', () => {
  const volumes = ref([])
  const isLoading = ref(false)

  async function loadVolumes(projectId) {
    isLoading.value = true
    try {
      volumes.value = await getVolumes(projectId)
      // Load entity counts for each volume
      await Promise.all(volumes.value.map(async (vol) => {
        const counts = await getVolumeEntityCount(vol.id)
        vol.entityCounts = {
          total: counts,
          character: await getVolumeEntityCount(vol.id, 'character'),
          location: await getVolumeEntityCount(vol.id, 'location'),
          plotThread: await getVolumeEntityCount(vol.id, 'plotThread')
        }
      }))
    } finally {
      isLoading.value = false
    }
  }

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