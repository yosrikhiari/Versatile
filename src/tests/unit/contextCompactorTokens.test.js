import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vue', () => ({
  ref: (v) => ({ value: v })
}))

// Heuristic stand-in for the BPE tokenizer: ~4 chars per token. `isExact` is
// the switch the token trigger gates on, so tests drive it directly.
let exact = true
const preloadSpy = vi.fn(() => Promise.resolve(true))

vi.mock('../../services/ai/tokenizer', () => ({
  countTokens: (text) => Math.ceil((text || '').length / 4),
  isExact: () => exact,
  preloadTokenizer: (...args) => preloadSpy(...args),
  heuristicTokens: (text) => Math.ceil((text || '').length / 4)
}))

let contextWindow = 1000
vi.mock('../../services/ai/modelBudget', () => ({
  getContextWindow: () => contextWindow
}))

const aiGenerate = vi.fn(() => Promise.resolve('A short summary.'))
vi.mock('../../composables/useAiService', () => ({
  aiGenerate: (...args) => aiGenerate(...args)
}))

async function create(options) {
  const mod = await import('../../composables/useContextCompactor')
  return mod.useContextCompactor(options)
}

function addTurns(compactor, callId, count, content) {
  for (let i = 0; i < count; i++) {
    compactor.addTurn(callId, 'user', typeof content === 'function' ? content(i) : content)
  }
}

describe('useContextCompactor — token-aware trigger', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    exact = true
    contextWindow = 1000
  })

  it('derives the budget from the model context window and ratio', async () => {
    const compactor = await create({ model: 'gpt-4o-mini', budgetRatio: 0.75 })
    // 1000 * 0.75
    expect(compactor.getTokenBudget()).toBe(750)
  })

  it('falls back to a default window when no model is set', async () => {
    contextWindow = null
    const compactor = await create()
    // 8192 * 0.75
    expect(compactor.getTokenBudget()).toBe(6144)
  })

  it('fires below the turn threshold when tokens exceed the budget', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    // 5 turns — under the 8-turn threshold — but token-dense.
    addTurns(compactor, 'c1', 5, 'x'.repeat(2000))

    expect(compactor.getTurns('c1')).toHaveLength(5)
    expect(compactor.shouldSuggestCompact('c1')).toBe(true)
  })

  it('does not fire on token pressure while the tokenizer is only heuristic', async () => {
    exact = false
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 5, 'x'.repeat(2000))

    // Heuristic counts are unreliable for conversational text, so the turn
    // threshold stays the sole trigger until the real tokenizer loads.
    expect(compactor.shouldSuggestCompact('c1')).toBe(false)
  })

  it('does not fire on token pressure below the minimum turn count', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    // 3 turns: dense, but too early to judge.
    addTurns(compactor, 'c1', 3, 'x'.repeat(5000))

    expect(compactor.shouldSuggestCompact('c1')).toBe(false)
  })

  it('still fires on turn count alone for a token-light conversation', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 9, 'hi')

    expect(compactor.shouldSuggestCompact('c1')).toBe(true)
  })

  it('a large context window keeps a dense conversation under budget', async () => {
    contextWindow = 200000
    const compactor = await create({ model: 'claude-sonnet-4-5' })
    addTurns(compactor, 'c1', 5, 'x'.repeat(2000))

    expect(compactor.shouldSuggestCompact('c1')).toBe(false)
  })

  it('setModel preloads the tokenizer for the new encoding family', async () => {
    const compactor = await create()
    compactor.setModel('gpt-4o-mini')

    expect(preloadSpy).toHaveBeenCalledWith('gpt-4o-mini')
    expect(compactor.activeModel.value).toBe('gpt-4o-mini')
  })

  it('setModel can skip the preload', async () => {
    const compactor = await create()
    compactor.setModel('gpt-4o-mini', { preload: false })

    expect(preloadSpy).not.toHaveBeenCalled()
  })

  it('getCompactionPressure reports tokens against budget', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 4, 'x'.repeat(400))

    const pressure = compactor.getCompactionPressure('c1')
    expect(pressure.turns).toBe(4)
    expect(pressure.budget).toBe(750)
    expect(pressure.tokens).toBeGreaterThan(0)
    expect(pressure.ratio).toBeCloseTo(pressure.tokens / pressure.budget, 5)
    expect(pressure.exactTokenizer).toBe(true)
  })
})

describe('useContextCompactor — post-compaction re-check', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    exact = true
    contextWindow = 1000
  })

  it('returns token accounting alongside the compacted turns', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 8, (i) => `turn ${i}`)

    const result = await compactor.compactConversation('c1')

    expect(result.compacted).toBe(true)
    expect(result.tokenBudget).toBe(750)
    expect(typeof result.tokensAfter).toBe('number')
    expect(result.droppedTurns).toBe(0)
    expect(result.stillOverBudget).toBe(false)
    expect(result.warning).toBeNull()
  })

  it('drops the oldest kept turns when summarization did not compress enough', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    // Old turns get summarized away, but the three kept turns are each huge —
    // summarizing the middle alone cannot get this under budget.
    addTurns(compactor, 'c1', 5, 'old content')
    compactor.addTurn('c1', 'user', 'K'.repeat(1500))
    compactor.addTurn('c1', 'user', 'L'.repeat(1500))
    compactor.addTurn('c1', 'user', 'M'.repeat(1500))

    const result = await compactor.compactConversation('c1')

    expect(result.compacted).toBe(true)
    expect(result.droppedTurns).toBeGreaterThan(0)
  })

  it('never drops the summary or the most recent turn', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 5, 'old content')
    compactor.addTurn('c1', 'user', 'K'.repeat(9000))
    compactor.addTurn('c1', 'user', 'L'.repeat(9000))
    compactor.addTurn('c1', 'user', 'FINAL-TURN'.repeat(900))

    const result = await compactor.compactConversation('c1')

    // Even when nothing can bring it under budget, the summary and the latest
    // exchange survive — dropping those would lose the conversation entirely.
    expect(result.turns).toHaveLength(2)
    expect(result.turns[0].role).toBe('system')
    expect(result.turns[0].content).toContain('Compacted summary')
    expect(result.turns[1].content).toContain('FINAL-TURN')
  })

  it('warns when the conversation is still over budget after escalation', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 5, 'old content')
    compactor.addTurn('c1', 'user', 'K'.repeat(9000))
    compactor.addTurn('c1', 'user', 'L'.repeat(9000))
    compactor.addTurn('c1', 'user', 'M'.repeat(9000))

    const result = await compactor.compactConversation('c1')

    expect(result.stillOverBudget).toBe(true)
    expect(result.warning).toContain('still')
    expect(result.warning).toContain('Consider starting a new conversation')
  })

  it('persists the compacted turns back onto the conversation', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 8, (i) => `turn ${i}`)

    const result = await compactor.compactConversation('c1')

    expect(compactor.getTurns('c1')).toEqual(result.turns)
  })

  it('still refuses to compact below the minimum turn count', async () => {
    const compactor = await create({ model: 'gpt-4o-mini' })
    addTurns(compactor, 'c1', 4, 'short')

    const result = await compactor.compactConversation('c1')

    expect(result.compacted).toBe(false)
    expect(aiGenerate).not.toHaveBeenCalled()
  })
})
