// Mock Dexie database for unit tests
export const mockDb = {
  projects: {
    toArray: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    add: vi.fn(),
    delete: vi.fn(),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    first: vi.fn(),
    count: vi.fn()
  },
  manuscripts: {
    get: vi.fn(),
    put: vi.fn(),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    first: vi.fn()
  },
  chapters: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    count: vi.fn()
  },
  scenes: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  characters: {
    toArray: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  locations: {
    toArray: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  plotThreads: {
    toArray: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  sparkHistory: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn(),
    add: vi.fn(),
    delete: vi.fn()
  },
  annotations: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  snapshots: {
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toArray: vi.fn(),
    add: vi.fn(),
    delete: vi.fn()
  },
  version: vi.fn().mockReturnThis(),
  stores: vi.fn().mockReturnThis(),
  open: vi.fn().mockResolvedValue(true)
}

// Helper to reset all mocks
export function resetDbMocks() {
  Object.values(mockDb).forEach(value => {
    if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(fn => {
        if (typeof fn === 'function' && fn.mockReset) {
          fn.mockReset()
        }
      })
    }
  })
}
