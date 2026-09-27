import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSparkStore } from '@/stores/sparkStore'

// Spark generation moved to services/generation/sparkGeneration and the
// connection test to services/ollamaService (M-7.4).
vi.mock('@/services/generation/sparkGeneration', () => ({
  generateSparkPrompt: vi.fn().mockResolvedValue('Test prompt'),
  generateOutline: vi.fn().mockResolvedValue({ outline: 'Test outline' }),
  generateContent: vi.fn().mockResolvedValue({ text: 'Test content' }),
  generateContentStreaming: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/services/ollamaService', () => ({
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
    // The mocked module itself: importing the useOllama barrel to reach it
    // loaded every generation module and, on a busy machine, ran past the
    // 15 s test limit (full-suite flake, 27 Sep).
    const spark = await import('@/services/generation/sparkGeneration')
    spark.generateSparkPrompt.mockRejectedValue(new Error('AI error'))

    try {
      await store.generatePrompt('seed', [], null)
    } catch {
      // Expected
    }

    expect(store.error).toContain('AI error')
    expect(store.isGenerating).toBe(false)
  })
})
