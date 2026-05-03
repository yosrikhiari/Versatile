import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { simpleEncrypt, simpleDecrypt } from '../services/ollamaService'

const STORAGE_KEY = 'versatile_settings'

const DEFAULT_SETTINGS = {
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'dolphin-mistral:7b',
  openaiApiKey: '',
  autoSaveInterval: 5
}

export const useSettingsStore = defineStore('settings', () => {
  const ollamaEndpoint = ref(DEFAULT_SETTINGS.ollamaEndpoint)
  const ollamaModel = ref(DEFAULT_SETTINGS.ollamaModel)
  const openaiApiKey = ref(DEFAULT_SETTINGS.openaiApiKey)
  const autoSaveInterval = ref(DEFAULT_SETTINGS.autoSaveInterval)

  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        if (data.ollamaEndpoint) ollamaEndpoint.value = data.ollamaEndpoint
        if (data.ollamaModel) ollamaModel.value = data.ollamaModel
        if (data.autoSaveInterval) autoSaveInterval.value = data.autoSaveInterval
      }
      // Load API key from encrypted localStorage
      const encryptedKey = localStorage.getItem('versatile_openai_key')
      if (encryptedKey) {
        try {
          openaiApiKey.value = simpleDecrypt(encryptedKey)
        } catch {
          openaiApiKey.value = ''
        }
      }
    } catch (e) {
      console.warn('Failed to load settings:', e)
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ollamaEndpoint: ollamaEndpoint.value,
        ollamaModel: ollamaModel.value,
        openaiApiKey: openaiApiKey.value,
        autoSaveInterval: autoSaveInterval.value
      }))
    } catch (e) {
      console.warn('Failed to save settings:', e)
    }
  }

  function setOllamaEndpoint(url) {
    ollamaEndpoint.value = url
    saveSettings()
  }

  function setOllamaModel(model) {
    ollamaModel.value = model
    saveSettings()
  }

  function setOpenaiApiKey(key) {
    openaiApiKey.value = key
    // Save encrypted to localStorage for persistence
    if (key) {
      localStorage.setItem('versatile_openai_key', simpleEncrypt(key))
    } else {
      localStorage.removeItem('versatile_openai_key')
    }
    saveSettings()
  }

  function setAutoSaveInterval(minutes) {
    autoSaveInterval.value = minutes
    saveSettings()
  }

  function resetToDefaults() {
    ollamaEndpoint.value = DEFAULT_SETTINGS.ollamaEndpoint
    ollamaModel.value = DEFAULT_SETTINGS.ollamaModel
    openaiApiKey.value = ''
    autoSaveInterval.value = DEFAULT_SETTINGS.autoSaveInterval
    saveSettings()
  }

  async function testOllamaConnection() {
    try {
      const response = await fetch(`${ollamaEndpoint.value}/api/tags`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })
      if (response.ok) {
        return { success: true, message: 'Connection successful' }
      }
      return { success: false, message: `Server returned ${response.status}` }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  loadSettings()

  return {
    ollamaEndpoint,
    ollamaModel,
    openaiApiKey,
    autoSaveInterval,
    loadSettings,
    saveSettings,
    setOllamaEndpoint,
    setOllamaModel,
    setOpenaiApiKey,
    setAutoSaveInterval,
    resetToDefaults,
    testOllamaConnection
  }
})