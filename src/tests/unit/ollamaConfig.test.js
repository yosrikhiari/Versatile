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
    expect(getOllamaModel()).toBe('qwen3:8b')
  })

  it('utility work has its own default, independent of the prose choice', async () => {
    // Almost everything besides prose is schema-constrained JSON — skeletons,
    // title repair, cast expansion, the relationship network. The utility
    // default must never *inherit* the prose model: an author who switches prose
    // to the uncensored model (weaker at grammar-bound output) must not drag
    // every schema-bound call along with it.
    const { STORAGE_KEYS } = await import('../../config/storageKeys')
    const { getOllamaModel, getOllamaUtilityModel, UNCENSORED_MODEL } =
      await import('../../config/ollama')
    expect(getOllamaUtilityModel()).toBe('qwen3:8b')
    localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, UNCENSORED_MODEL)
    expect(getOllamaModel()).toBe('dolphin-mistral:7b')
    expect(getOllamaUtilityModel()).toBe('qwen3:8b')
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
