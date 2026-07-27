import { defineStore } from 'pinia'
import { ref } from 'vue'
import { analyzePolish } from '../services/generation/polishAnalysis'
import { LENS_MAP } from '../config/statuses'
import {
  getAnnotations,
  addAnnotation,
  updateAnnotation,
  clearAnnotations,
  getSnippets,
  deleteSnippet,
  incrementSnippetWord
} from '../services/dbService'
import { useLocalStorage } from '../utils/useLocalStorage'
import { STORAGE_KEYS } from '../config/storageKeys'

export const usePolishStore = defineStore('polish', () => {
  const annotations = ref<any[]>([])
  const snippets = ref<any[]>([])
  const isAnalyzing = ref(false)
  const selectedParagraphIndex = ref<any | null>(null)
  const selectedParagraphText = ref('')
  const pendingParagraphText = ref('')
  const pendingParagraphIndex = ref<any | null>(null)
  const activeLenses = useLocalStorage(STORAGE_KEYS.ACTIVE_LENSES, {
    weakVerbs: true,
    repetition: true,
    pacing: true,
    clarity: true
  })
  const error = ref<any | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function loadAnnotations(projectId: any) {
    annotations.value = await getAnnotations(projectId)
  }

  async function loadSnippets(projectId: any) {
    snippets.value = await getSnippets(projectId)
  }

  function selectParagraph(text: any, index: any) {
    pendingParagraphText.value = text
    pendingParagraphIndex.value = index

    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      if (projectStoreRef && pendingParagraphIndex.value !== null) {
        analyzeParagraphDebounced(pendingParagraphText.value, pendingParagraphIndex.value)
      }
    }, 800)
  }

  let projectStoreRef: any = null
  function setProjectStore(store: any) {
    projectStoreRef = store
  }

  async function analyzeNow(text: any, index: any, projectId: any) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    await doAnalyze(text, index, projectId)
  }

  async function analyzeParagraphDebounced(text: any, index: any) {
    if (!projectStoreRef) return
    const projectId = projectStoreRef.currentProjectId
    if (!projectId) return
    await doAnalyze(text, index, projectId)
  }

  async function doAnalyze(text: any, index: any, projectId: any) {
    isAnalyzing.value = true
    error.value = null
    selectedParagraphIndex.value = index
    selectedParagraphText.value = text

    const lenses: Record<string, any> = {}
    for (const [key, value] of Object.entries(activeLenses.value)) {
      lenses[LENS_MAP[key as keyof typeof LENS_MAP]] = value
    }

    try {
      const result = await analyzePolish(text, lenses)

      if (result.issues?.length > 0) {
        for (const issue of result.issues) {
          await addAnnotation(projectId, {
            paragraphIndex: index,
            type: issue.type,
            original: issue.original,
            suggestion: issue.suggestion,
            reason: issue.reason,
            status: 'pending',
            overallNote: result.overallNote
          })

          if (issue.type === 'repetition' && projectId) {
            const words = issue.original.split(/\s+/)
            for (const word of words) {
              const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '')
              if (cleanWord.length > 2) {
                await incrementSnippetWord(projectId, cleanWord)
              }
            }
          }
        }

        annotations.value = await getAnnotations(projectId)
        snippets.value = await getSnippets(projectId)
      }

      if ((result as any).error) {
        error.value = result.overallNote
      }

      return result
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isAnalyzing.value = false
    }
  }

  async function acceptAnnotation(id: any, projectId: any, projectStore: any) {
    const annotation = annotations.value.find((a) => a.id === id)
    if (annotation?.suggestion && projectStore) {
      const content = projectStore.documentContent
      const updated = content.replace(annotation.original, annotation.suggestion)
      projectStore.updateContent(updated)
    }
    await updateAnnotation(id, { status: 'accepted' })
    annotations.value = await getAnnotations(projectId)
  }

  async function rejectAnnotation(id: any, projectId: any) {
    await updateAnnotation(id, { status: 'rejected' })
    annotations.value = await getAnnotations(projectId)
  }

  async function flagForLater(id: any, projectId: any) {
    await updateAnnotation(id, { status: 'flagged' })
    annotations.value = await getAnnotations(projectId)
  }

  async function clearAnnotationsData(projectId: any) {
    await clearAnnotations(projectId)
    annotations.value = []
  }

  async function removeSnippet(id: any, projectId: any) {
    await deleteSnippet(id)
    snippets.value = await getSnippets(projectId)
  }

  function setActiveLenses(lenses: any) {
    activeLenses.value = lenses
  }

  function destroy() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  return {
    annotations,
    snippets,
    isAnalyzing,
    selectedParagraphIndex,
    selectedParagraphText,
    activeLenses,
    error,
    loadAnnotations,
    loadSnippets,
    selectParagraph,
    analyzeNow,
    acceptAnnotation,
    rejectAnnotation,
    flagForLater,
    clearAnnotationsData,
    removeSnippet,
    setActiveLenses,
    setProjectStore,
    destroy
  }
})
