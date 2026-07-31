import { defineStore } from 'pinia'
import {
  getVolumes,
  addVolume,
  updateVolume,
  deleteVolume,
  assignSectionToVolume,
  removeSectionFromVolume,
  getSectionIdsByVolume,
  unassignAllSectionsFromVolume,
  getVolumeEntityCount
} from '../services/dbService'
import { useLoading } from '../utils/useLoading'

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

export interface VolumeEntityCounts {
  total: number
  character: number
  location: number
  plotThread: number
}

export interface Volume {
  id: string
  projectId: string
  title?: string
  description?: string
  color?: string
  sectionIds: string[]
  /** Legacy pre-v13 field; normalised into `sectionIds` on load and then deleted. */
  chapterIds?: string[]
  entityCounts?: VolumeEntityCounts
}

export const useVolumeStore = defineStore('volume', () => {
  const {
    items: volumes,
    isLoading,
    load: loadVolumes
  } = useLoading<Volume, [string]>(async (projectId: string) => {
    const vols: Volume[] = await getVolumes(projectId)
    // Membership is derived from the sections, which are where it is actually
    // persisted. Reading the volume row's own `sectionIds` gave an empty list on
    // every reload, because nothing had ever written it.
    const byVolume = await getSectionIdsByVolume(projectId)
    vols.forEach((v) => {
      delete v.chapterIds
      v.sectionIds = byVolume[v.id] || []
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

  async function createVolume(projectId: string, data: any) {
    const id = await addVolume(projectId, data)
    volumes.value.push({ id, projectId, sectionIds: [], ...data })
    return id
  }

  async function updateVolumeData(id: string, data: any, _projectId: string) {
    await updateVolume(id, data)
    const index = volumes.value.findIndex((v) => v.id === id)
    if (index !== -1) {
      volumes.value[index] = { ...volumes.value[index], ...data }
    }
  }

  async function deleteVolumeData(id: string, _projectId: string) {
    // Detach by querying the sections rather than trusting the in-memory list:
    // on a freshly loaded project that list was empty, and every section was
    // left carrying a volumeId pointing at a volume that no longer existed.
    await unassignAllSectionsFromVolume(id)
    await deleteVolume(id)
    volumes.value = volumes.value.filter((v) => v.id !== id)
  }

  async function assignSection(sectionId: string, volumeId: string | null, _projectId: string) {
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

  async function removeSection(sectionId: string, _projectId: string) {
    await removeSectionFromVolume(sectionId)
    for (const vol of volumes.value) {
      if (vol.sectionIds) {
        vol.sectionIds = vol.sectionIds.filter((id) => id !== sectionId)
      }
    }
  }

  function getVolumeForSection(sectionId: any) {
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
