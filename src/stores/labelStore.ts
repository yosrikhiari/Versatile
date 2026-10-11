import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SceneLabel, SceneLabelInput } from '../types/label'
import {
  saveSceneLabel,
  getSceneLabelsByStory,
  getSceneLabelsByReviewer,
  deleteSceneLabel as deleteLabel,
  clearSceneLabels as clearLabels
} from '../services/db-labels'

export const useLabelStore = defineStore('label', () => {
  const labels = ref<SceneLabel[]>([])
  const loading = ref(false)

  async function loadByStory(storyId: string) {
    loading.value = true
    try {
      labels.value = await getSceneLabelsByStory(storyId)
    } finally {
      loading.value = false
    }
  }

  async function loadByReviewer(reviewerName: string) {
    loading.value = true
    try {
      labels.value = await getSceneLabelsByReviewer(reviewerName)
    } finally {
      loading.value = false
    }
  }

  async function upsert(input: SceneLabelInput) {
    const saved = await saveSceneLabel(input)
    const idx = labels.value.findIndex((l) => l.id === saved.id)
    if (idx >= 0) labels.value[idx] = saved as SceneLabel
    else labels.value.push(saved as SceneLabel)
    return saved
  }

  async function remove(id: string) {
    await deleteLabel(id)
    labels.value = labels.value.filter((l) => l.id !== id)
  }

  async function clear() {
    await clearLabels()
    labels.value = []
  }

  return { labels, loading, loadByStory, loadByReviewer, upsert, remove, clear }
})
