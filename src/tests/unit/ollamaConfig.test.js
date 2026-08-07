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

  it('utility work defaults to a different model than prose', async () => {
    // The two fail in opposite directions. The prose default is uncensored and
    // correspondingly weaker at grammar-bound output, and almost everything else
    // in this pipeline is schema-constrained JSON — skeletons, title repair,
    // cast expansion, the relationship network. Inheriting the prose model for
    // those would put every schema-bound call on the model least able to satisfy
    // a schema.
    const { getOllamaModel, getOllamaUtilityModel } = await import('../../config/ollama')
    expect(getOllamaUtilityModel()).toBe('qwen3:8b')
    expect(getOllamaUtilityModel()).not.toBe(getOllamaModel())
  })

  it('an explicit utility choice still wins over the default', async () => {
    const { STORAGE_KEYS } = await import('../../config/storageKeys')
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, 'phi4-mini:3.8b')
    const { getOllamaUtilityModel } = await import('../../config/ollama')
    expect(getOllamaUtilityModel()).toBe('phi4-mini:3.8b')
  })

  it('setOllamaModel stores and retrieves value', async () => {
    const { getOllamaModel, setOllamaModel } = await import('../../config/ollama')
    setOllamaModel('llama3:8b')
    expect(getOllamaModel()).toBe('llama3:8b')
    expect(localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL)).toBe('llama3:8b')
  })
})
