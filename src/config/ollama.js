import { STORAGE_KEYS } from './storageKeys'

const DEFAULT_MODEL = 'dolphin-mistral:7b'
const DEFAULT_ENDPOINT = '/ollama'

export function getOllamaEndpoint() {
  // STORAGE_KEYS ref
  return localStorage.getItem(STORAGE_KEYS.OLLAMA_ENDPOINT) || DEFAULT_ENDPOINT
}

export function setOllamaEndpoint(url) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, url)
}

export function getOllamaModel() {
  // STORAGE_KEYS ref
  return localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL) || DEFAULT_MODEL
}

export function setOllamaModel(model) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, model)
}

