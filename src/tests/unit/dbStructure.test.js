import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeWhereChain(result) {
  const chain = {
    equals: vi.fn(() => chain),
    sortBy: vi.fn().mockResolvedValue(result),
    toArray: vi.fn().mockResolvedValue(result),
    filter: vi.fn(() => chain)
  }
  return chain
}

const mockDb = {
  sections: {
    where: vi.fn(() => makeWhereChain([])),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn()
  },
  subsections: {
    where: vi.fn(() => makeWhereChain([])),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  chapters: {
    where: vi.fn(() => makeWhereChain([])),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  scenes: {
    where: vi.fn(() => makeWhereChain([])),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  volumes: {
    where: vi.fn(() => makeWhereChain([])),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}

vi.mock('@/services/db-core', () => ({ db: mockDb }))
vi.mock('@/utils/textUtils', () => ({ countWords: vi.fn((s) => s.split(/\s+/).length) }))
vi.mock('@/services/ollamaService', () => ({ getEmbedding: vi.fn() }))

let dbStructure
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  dbStructure = await import('@/services/db-structure')
})

describe('assignSectionToVolume', () => {
  it('updates section with volumeId when section exists', async () => {
    const chain = makeWhereChain([{ id: 'sec1', title: 'Chapter 1' }])
    mockDb.sections.where.mockReturnValue({ equals: vi.fn(() => chain) })
    mockDb.sections.update.mockResolvedValue(1)

    await dbStructure.assignSectionToVolume('sec1', 'vol1')
    expect(mockDb.sections.update).toHaveBeenCalledWith('sec1', { volumeId: 'vol1' })
  })

  it('does nothing when section not found', async () => {
    const chain = makeWhereChain([])
    mockDb.sections.where.mockReturnValue({ equals: vi.fn(() => chain) })

    await dbStructure.assignSectionToVolume('nonexistent', 'vol1')
    expect(mockDb.sections.update).not.toHaveBeenCalled()
  })
})

describe('removeSectionFromVolume', () => {
  it('removes volumeId from section when section exists', async () => {
    const chain = makeWhereChain([{ id: 'sec1' }])
    mockDb.sections.where.mockReturnValue({ equals: vi.fn(() => chain) })
    mockDb.sections.update.mockResolvedValue(1)

    await dbStructure.removeSectionFromVolume('sec1')
    expect(mockDb.sections.update).toHaveBeenCalledWith('sec1', { volumeId: null })
  })
})

describe('getSections', () => {
  it('retrieves sections by projectId', async () => {
    const chain = makeWhereChain([{ id: 'sec1' }])
    mockDb.sections.where.mockReturnValue({ equals: vi.fn(() => chain) })

    const result = await dbStructure.getSections('proj1')
    expect(result).toEqual([{ id: 'sec1' }])
  })
})

describe('addSection', () => {
  it('adds a section with projectId', async () => {
    mockDb.sections.add.mockResolvedValue('sec1')
    const result = await dbStructure.addSection('proj1', { title: 'Chapter 1' })
    expect(mockDb.sections.add).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj1', title: 'Chapter 1' })
    )
    expect(result).toBe('sec1')
  })
})

describe('getSubsections', () => {
  it('retrieves subsections by projectId and sectionId', async () => {
    const chain = makeWhereChain([{ id: 'sub1' }])
    mockDb.subsections.where.mockReturnValue(chain)

    const result = await dbStructure.getSubsections('proj1', 'sec1')
    expect(mockDb.subsections.where).toHaveBeenCalledWith({ projectId: 'proj1', sectionId: 'sec1' })
    expect(result).toEqual([{ id: 'sub1' }])
  })
})

describe('getSectionWordCounts', () => {
  it('calculates word counts per section', async () => {
    const sections = [{ id: 'sec1', title: 'Chapter 1', status: 'draft', summary: 'summary' }]
    const subsections = [
      { id: 'sub1', sectionId: 'sec1', content: 'hello world' },
      { id: 'sub2', sectionId: 'sec1', content: 'foo bar baz' }
    ]

    const secChain = makeWhereChain(sections)
    mockDb.sections.where.mockReturnValue({ equals: vi.fn(() => secChain) })

    const subChain = makeWhereChain(subsections)
    mockDb.subsections.where.mockReturnValue({ equals: vi.fn(() => subChain) })

    const result = await dbStructure.getSectionWordCounts('proj1')
    expect(result.sectionCounts.sec1.wordCount).toBe(5)
    expect(result.totalWords).toBe(5)
  })
})

describe('volume operations', () => {
  it('adds a volume with defaults', async () => {
    mockDb.volumes.add.mockResolvedValue('v1')
    const result = await dbStructure.addVolume('proj1', { title: 'Vol 1' })
    expect(mockDb.volumes.add).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj1', title: 'Vol 1' })
    )
    expect(result).toBe('v1')
  })
})
