import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { analyzePolish } from '../composables/useOllama'
import { LENS_MAP } from '../config/statuses'
import {
  getAnnotations, addAnnotation, updateAnnotation, deleteAnnotation, clearAnnotations,
  getSnippets, addSnippet, updateSnippet, deleteSnippet, incrementSnippetWord
} from '../services/dbService'
import { STORAGE_KEYS } from '../config/storageKeys'

export const usePolishStore = defineStore('polish', () => {
  const annotations = ref([])
  const snippets = ref([])
  const isAnalyzing = ref(false)
  const selectedParagraphIndex = ref(null)
  const selectedParagraphText = ref('')
  const pendingParagraphText = ref('')
  const pendingParagraphIndex = ref(null)
  const activeLenses = ref({
    weakVerbs: true,
    repetition: true,
    pacing: true,
    clarity: true
  })
  const error = ref(null)

  // STORAGE_KEYS ref
  const savedLenses = localStorage.getItem(STORAGE_KEYS.ACTIVE_LENSES)
  if (savedLenses) {
    try {
      activeLenses.value = { ...activeLenses.value, ...JSON.parse(savedLenses) }
    } catch {}
  }
  watch(activeLenses, val => {
    // STORAGE_KEYS ref
    localStorage.setItem(STORAGE_KEYS.ACTIVE_LENSES, JSON.stringify(val))
  }, { deep: true })
  
  let debounceTimer = null

  async function loadAnnotations(projectId) {
    annotations.value = await getAnnotations(projectId)
  }

  async function loadSnippets(projectId) {
    snippets.value = await getSnippets(projectId)
  }

  function selectParagraph(text, index) {
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
  
  let projectStoreRef = null
  function setProjectStore(store) {
    projectStoreRef = store
  }

  async function analyzeNow(text, index, projectId) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    await doAnalyze(text, index, projectId)
  }

  async function analyzeParagraphDebounced(text, index) {
    if (!projectStoreRef) return
    const projectId = projectStoreRef.currentProjectId
    if (!projectId) return
    await doAnalyze(text, index, projectId)
  }

  async function doAnalyze(text, index, projectId) {
    isAnalyzing.value = true
    error.value = null
    selectedParagraphIndex.value = index
    selectedParagraphText.value = text

    const lenses = {}
    for (const [key, value] of Object.entries(activeLenses.value)) {
      lenses[LENS_MAP[key]] = value
    }

    try {
      const result = await analyzePolish(text, lenses)
      
      if (result.issues && result.issues.length > 0) {
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
      
      if (result.error) {
        error.value = result.overallNote
      }
      
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isAnalyzing.value = false
    }
  }

  async function acceptAnnotation(id, projectId, projectStore) {
    const annotation = annotations.value.find(a => a.id === id)
    if (annotation && annotation.suggestion && projectStore) {
      const content = projectStore.documentContent
      const updated = content.replace(annotation.original, annotation.suggestion)
      projectStore.updateContent(updated)
    }
    await updateAnnotation(id, { status: 'accepted' })
    annotations.value = await getAnnotations(projectId)
  }

  async function rejectAnnotation(id, projectId) {
    await updateAnnotation(id, { status: 'rejected' })
    annotations.value = await getAnnotations(projectId)
  }

  async function flagForLater(id, projectId) {
    await updateAnnotation(id, { status: 'flagged' })
    annotations.value = await getAnnotations(projectId)
  }

  async function clearAnnotationsData(projectId) {
    await clearAnnotations(projectId)
    annotations.value = []
  }

  async function removeSnippet(id, projectId) {
    await deleteSnippet(id)
    snippets.value = await getSnippets(projectId)
  }

  function setActiveLenses(lenses) {
    activeLenses.value = lenses
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
    setProjectStore
  }
})
