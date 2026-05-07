import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSparkStore } from '@/stores/sparkStore'

// We need to mock the composable and service modules
vi.mock('@/composables/useOllama', () => ({
  generateSparkPrompt: vi.fn().mockResolvedValue('Test prompt'),
  generateOutline: vi.fn().mockResolvedValue({ outline: 'Test outline' }),
  generateContent: vi.fn().mockResolvedValue({ text: 'Test content' }),
  generateContentStreaming: vi.fn().mockResolvedValue(undefined),
  testOllamaConnection: vi.fn().mockResolvedValue({ success: true })
}))

vi.mock('@/services/dbService', () => ({
  addSparkHistory: vi.fn().mockResolvedValue('history-1'),
  getSparkHistory: vi.fn().mockResolvedValue([]),
  clearSparkHistory: vi.fn().mockResolvedValue(undefined)
}))

describe('sparkStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useSparkStore()
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    expect(store.history).toEqual([])
    expect(store.isGenerating).toBe(false)
    expect(store.error).toBeNull()
    expect(store.selectedPromptType).toBe('seed')
    expect(store.ollamaStatus).toBe('unknown')
  })

  it('should load history', async () => {
    const mockHistory = [{ id: '1', type: 'seed', prompt: 'Test' }]
    const dbService = await import('@/services/dbService')
    dbService.getSparkHistory.mockResolvedValue(mockHistory)

    await store.loadHistory('project-1')

    expect(store.history).toEqual(mockHistory)
  })

  it('should handle generation', async () => {
    await store.generatePrompt('seed', ['Hero'], null)

    expect(store.isGenerating).toBe(false)
    expect(store.error).toBeNull()
  })

  it('should handle generation error', async () => {
    const ollama = await import('@/composables/useOllama')
    ollama.generateSparkPrompt.mockRejectedValue(new Error('AI error'))

    try {
      await store.generatePrompt('seed', [], null)
    } catch (e) {
      // Expected
    }

    expect(store.error).toContain('AI error')
    expect(store.isGenerating).toBe(false)
  })
})
