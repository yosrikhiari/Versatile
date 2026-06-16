import { vi } from 'vitest'

vi.mock('../services/aiService', () => ({
  aiGenerate: vi.fn()
}))

vi.mock('../stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    activeWorkspaceType: 'creative'
  }))
}))
