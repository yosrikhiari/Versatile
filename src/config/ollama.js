const MODEL_STORAGE_KEY = 'versatile_ollama_model'
const ENDPOINT_STORAGE_KEY = 'versatile_ollama_endpoint'
const DEFAULT_MODEL = 'dolphin-mistral:7b'
const DEFAULT_ENDPOINT = '/ollama'

export function getOllamaEndpoint() {
  return localStorage.getItem(ENDPOINT_STORAGE_KEY) || DEFAULT_ENDPOINT
}

export function setOllamaEndpoint(url) {
  localStorage.setItem(ENDPOINT_STORAGE_KEY, url)
}

export function getOllamaModel() {
  return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL
}

export function setOllamaModel(model) {
  localStorage.setItem(MODEL_STORAGE_KEY, model)
}

