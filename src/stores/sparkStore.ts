import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  generateSparkPrompt,
  generateOutline,
  generateContent,
  generateContentStreaming
} from '../services/generation/sparkGeneration'
import { testOllamaConnection } from '../services/ollamaService'
import { addSparkHistory, getSparkHistory, clearSparkHistory } from '../services/dbService'
import { STORAGE_KEYS } from '../config/storageKeys'
import { useLocalStorage } from '../utils/useLocalStorage'

export const useSparkStore = defineStore('spark', () => {
  const history = ref<any[]>([])
  const currentOutline = ref<any | null>(null)
  const currentContent = ref<any | null>(null)
  const currentStreamingContent = ref('')
  const isGenerating = ref(false)
  const selectedPromptType = useLocalStorage(STORAGE_KEYS.SPARK_PROMPT_TYPE, 'seed')
  const relateToProject = useLocalStorage(STORAGE_KEYS.SPARK_RELATE_PROJECT, false)
  const error = ref<any | null>(null)
  const ollamaStatus = ref('unknown')

  async function loadHistory(projectId: any) {
    history.value = await getSparkHistory(projectId)
  }

  async function testConnection() {
    ollamaStatus.value = 'testing'
    const result = await testOllamaConnection()
    ollamaStatus.value = result.success ? 'connected' : 'disconnected'
    return result.success
  }

  async function generatePrompt(type: any, characterNames: any[] = [], manuscriptContext: any | null = null) {
    isGenerating.value = true
    error.value = null
    try {
      const promptText = await generateSparkPrompt(
        type,
        characterNames,
        relateToProject.value,
        manuscriptContext
      )
      const result = { type, prompt: promptText }
      history.value.unshift(result)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, result)
      }
      return promptText
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  async function generateOutlineAction(
    idea: any,
    tone: any,
    characterNames: any[] = [],
    targetLength: any = 'full',
    manuscriptContext: any | null = null
  ) {
    isGenerating.value = true
    error.value = null
    currentOutline.value = null
    try {
      const outline = await generateOutline(
        idea,
        tone,
        characterNames,
        targetLength,
        manuscriptContext
      )

      currentOutline.value = outline
      const result = { type: 'outline', prompt: idea, outline: outline }
      history.value.unshift(result)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, result)
      }
      return outline
    } catch (err: any) {
      error.value = err.message
      currentOutline.value = null
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  async function generateContentAction(
    idea: any,
    tone: any,
    characterNames: any[] = [],
    targetLength: any = 'short',
    manuscriptContext: any | null = null
  ) {
    isGenerating.value = true
    error.value = null
    currentContent.value = null
    try {
      const result = await generateContent(
        idea,
        tone,
        characterNames,
        targetLength,
        manuscriptContext
      )

      if (result.error) {
        error.value = result.error
        currentContent.value = null
        return null
      }

      currentContent.value = result.text
      const historyItem = { type: 'content', prompt: idea, content: result.text }
      history.value.unshift(historyItem)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, historyItem)
      }
      return result.text
    } catch (err: any) {
      error.value = err.message
      currentContent.value = null
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  async function generateContentStreamingAction(
    idea: any,
    tone: any,
    characterNames: any[] = [],
    targetLength: any = 'short',
    manuscriptContext: any | null = null
  ) {
    isGenerating.value = true
    error.value = null
    currentStreamingContent.value = ''
    currentContent.value = null
    try {
      const result = await generateContentStreaming(
        idea,
        tone,
        characterNames,
        targetLength,
        (text: string) => {
          currentStreamingContent.value = text
        },
        manuscriptContext
      )

      if (result.error) {
        error.value = result.error
        currentStreamingContent.value = ''
        return null
      }

      currentContent.value = result.text
      const historyItem = { type: 'content', prompt: idea, content: result.text }
      history.value.unshift(historyItem)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, historyItem)
      }
      return result.text
    } catch (err: any) {
      error.value = err.message
      currentStreamingContent.value = ''
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  function insertIntoFlow(text: any, projectStore: any) {
    projectStore.updateContent(projectStore.documentContent + '\n\n' + text)
  }

  async function clearHistoryData(projectId: any) {
    await clearSparkHistory(projectId)
    history.value = []
  }

  const currentProjectId = ref(null)
  function setProjectId(id: any) {
    currentProjectId.value = id
  }

  return {
    history,
    currentOutline,
    currentContent,
    currentStreamingContent,
    currentProjectId,
    isGenerating,
    selectedPromptType,
    relateToProject,
    error,
    ollamaStatus,
    loadHistory,
    testConnection,
    generatePrompt,
    generateOutlineAction,
    generateContentAction,
    generateContentStreamingAction,
    insertIntoFlow,
    clearHistoryData,
    setProjectId,
    currentBlueprint: computed(() => currentOutline.value),
    currentChapter: computed(() => currentContent.value),
    currentStreamingChapter: computed(() => currentStreamingContent.value)
  }
})
