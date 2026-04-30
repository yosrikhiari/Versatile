import { useSettingsStore } from '../stores/settingsStore'

let settingsStore = null

function getSettingsStore() {
  if (!settingsStore) {
    try {
      const { useSettingsStore } = require('../stores/settingsStore')
      settingsStore = useSettingsStore()
    } catch (e) {
      return null
    }
  }
  return settingsStore
}

const MODEL_STORAGE_KEY = 'versatile_ollama_model'
const DEFAULT_MODEL = 'dolphin-mistral:7b'

export function getOllamaEndpoint() {
  const store = getSettingsStore()
  if (store) {
    return store.ollamaEndpoint
  }
  return localStorage.getItem('versatile_ollama_endpoint') || 'http://localhost:11434'
}

export function setOllamaEndpoint(url) {
  localStorage.setItem('versatile_ollama_endpoint', url)
  const store = getSettingsStore()
  if (store) {
    store.setOllamaEndpoint(url)
  }
}

export function getOllamaModel() {
  const store = getSettingsStore()
  if (store) {
    return store.ollamaModel
  }
  return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL
}

export function setOllamaModel(model) {
  localStorage.setItem(MODEL_STORAGE_KEY, model)
  const store = getSettingsStore()
  if (store) {
    store.setOllamaModel(model)
  }
}

export function getOpenAIKey() {
  const store = getSettingsStore()
  if (store) {
    return store.openaiApiKey
  }
  return localStorage.getItem('versatile_openai_key') || ''
}

export function setOpenAIKey(key) {
  localStorage.setItem('versatile_openai_key', key)
  const store = getSettingsStore()
  if (store) {
    store.setOpenaiApiKey(key)
  }
}

export const OLLAMA_MODEL = getOllamaModel()
export const OLLAMA_BASE_URL = getOllamaEndpoint()