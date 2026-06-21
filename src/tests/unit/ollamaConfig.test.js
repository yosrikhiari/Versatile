import { describe, it, expect, beforeEach } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'

describe('Ollama config', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('getOllamaEndpoint returns default when nothing stored', async () => {
    const { getOllamaEndpoint } = await import('../../config/ollama')
    expect(getOllamaEndpoint()).toBe('/ollama')
  })

  it('setOllamaEndpoint stores and retrieves value', async () => {
    const { getOllamaEndpoint, setOllamaEndpoint } = await import('../../config/ollama')
    setOllamaEndpoint('http://localhost:11434')
    expect(getOllamaEndpoint()).toBe('http://localhost:11434')
    expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_ENDPOINT)).toBe('http://localhost:11434')
  })

  it('getOllamaModel returns default when nothing stored', async () => {
    const { getOllamaModel } = await import('../../config/ollama')
    expect(getOllamaModel()).toBe('dolphin-mistral:7b')
  })

  it('setOllamaModel stores and retrieves value', async () => {
    const { getOllamaModel, setOllamaModel } = await import('../../config/ollama')
    setOllamaModel('llama3:8b')
    expect(getOllamaModel()).toBe('llama3:8b')
    expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL)).toBe('llama3:8b')
  })
})
