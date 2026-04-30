import { defineStore } from 'pinia'
import { ref } from 'vue'
import { generateSparkPrompt, generateBlueprint, generateChapter, generateChapterStreaming, testOllamaConnection } from '../composables/useOllama'
import { addSparkHistory, getSparkHistory, clearSparkHistory } from '../services/dbService'

export const useSparkStore = defineStore('spark', () => {
  const history = ref([])
  const currentBlueprint = ref(null)
  const currentChapter = ref(null)
  const currentStreamingChapter = ref('')
  const isGenerating = ref(false)
  const selectedPromptType = ref('seed')
  const relateToProject = ref(false)
  const error = ref(null)
  const ollamaStatus = ref('unknown')

  async function loadHistory(projectId) {
    history.value = await getSparkHistory(projectId)
  }

  async function testConnection() {
    ollamaStatus.value = 'testing'
    const result = await testOllamaConnection()
    ollamaStatus.value = result.success ? 'connected' : 'disconnected'
    return result.success
  }

  async function generatePrompt(type, characterNames = [], manuscriptContext = null) {
    isGenerating.value = true
    error.value = null
    try {
      const promptText = await generateSparkPrompt(type, characterNames, relateToProject.value, manuscriptContext)
      const result = { type, prompt: promptText }
      history.value.unshift(result)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, result)
      }
      return promptText
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  async function generateBlueprintAction(idea, tone, characterNames = [], targetLength = 'full', manuscriptContext = null) {
    isGenerating.value = true
    error.value = null
    currentBlueprint.value = null
    try {
      const blueprint = await generateBlueprint(idea, tone, characterNames, targetLength, manuscriptContext)
      
      if (blueprint.error) {
        error.value = blueprint.error
        currentBlueprint.value = null
        return null
      }
      
      currentBlueprint.value = blueprint
      const result = { type: 'blueprint', prompt: idea, blueprint }
      history.value.unshift(result)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, result)
      }
      return blueprint
    } catch (err) {
      error.value = err.message
      currentBlueprint.value = null
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  async function generateChapterAction(idea, tone, characterNames = [], targetLength = 'short') {
    isGenerating.value = true
    error.value = null
    currentChapter.value = null
    try {
      const result = await generateChapter(idea, tone, characterNames, targetLength)
      
      if (result.error) {
        error.value = result.error
        currentChapter.value = null
        return null
      }
      
      currentChapter.value = result.text
      const historyItem = { type: 'chapter', prompt: idea, chapter: result.text }
      history.value.unshift(historyItem)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, historyItem)
      }
      return result.text
    } catch (err) {
      error.value = err.message
      currentChapter.value = null
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  async function generateChapterStreamingAction(idea, tone, characterNames = [], targetLength = 'short') {
    isGenerating.value = true
    error.value = null
    currentStreamingChapter.value = ''
    currentChapter.value = null
    try {
      const result = await generateChapterStreaming(
        idea, tone, characterNames, targetLength,
        (chunk, full) => {
          currentStreamingChapter.value = full
        }
      )
      
      if (result.error) {
        error.value = result.error
        currentStreamingChapter.value = ''
        return null
      }
      
      currentChapter.value = result.text
      const historyItem = { type: 'chapter', prompt: idea, chapter: result.text }
      history.value.unshift(historyItem)
      if (currentProjectId.value) {
        await addSparkHistory(currentProjectId.value, historyItem)
      }
      return result.text
    } catch (err) {
      error.value = err.message
      currentStreamingChapter.value = ''
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  function insertIntoFlow(text, projectStore) {
    projectStore.updateContent(projectStore.manuscriptContent + '\n\n' + text)
  }

  async function clearHistoryData(projectId) {
    await clearSparkHistory(projectId)
    history.value = []
  }

  const currentProjectId = ref(null)
  function setProjectId(id) {
    currentProjectId.value = id
  }

  return {
    history,
    currentBlueprint,
    currentChapter,
    currentStreamingChapter,
    currentProjectId,
    isGenerating,
    selectedPromptType,
    relateToProject,
    error,
    ollamaStatus,
    loadHistory,
    testConnection,
    generatePrompt,
    generateBlueprintAction,
    generateChapterAction,
    generateChapterStreamingAction,
    insertIntoFlow,
    clearHistoryData,
    setProjectId
  }
})
