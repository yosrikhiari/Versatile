import { describe, it, expect } from 'vitest'
import {
  fitToBudget,
  estimateTokens,
  describeBudget,
  fitSceneContext
} from '@/services/ai/contextBudget'

/** `n` tokens' worth of prose (4 chars/token). */
const prose = (tokens) => 'w '.repeat(tokens * 2).slice(0, tokens * 4)

describe('estimateTokens', () => {
  it('rates prose at ~4 chars/token', () => {
    expect(estimateTokens('a'.repeat(400), 'prose')).toBe(100)
  })

  it('rates JSON far more expensively than prose', () => {
    // The app's chars/4 estimate under-counts JSON by up to ~46%; braces,
    // quotes, colons and indent runs each tend to cost a token.
    const json = 'x'.repeat(260)
    expect(estimateTokens(json, 'json')).toBe(100)
    expect(estimateTokens(json, 'prose')).toBe(65)
    expect(estimateTokens(json, 'json')).toBeGreaterThan(estimateTokens(json, 'prose'))
  })

  it('defaults to the prose rate for an unknown kind', () => {
    expect(estimateTokens('a'.repeat(400), 'nonsense')).toBe(100)
  })

  it('handles empty and missing text', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
  })
})

describe('fitToBudget', () => {
  it('changes nothing when everything already fits', () => {
    const blocks = [
      { name: 'a', text: prose(10), priority: 1 },
      { name: 'b', text: prose(10), priority: 2 }
    ]
    const r = fitToBudget(blocks, 1000)
    expect(r.fits).toBe(true)
    expect(r.dropped).toEqual([])
    expect(r.degraded).toEqual([])
    expect(r.blocks).toHaveLength(2)
  })

  it('drops the lowest-priority block first — not the largest', () => {
    // This is the whole point. shaping/tokenBudget.js sorts by length and pops
    // the biggest, but the story bible is usually both the biggest AND the most
    // valuable. Value must decide, not size.
    const r = fitToBudget(
      [
        { name: 'storyBible', text: prose(200), priority: 100 },
        { name: 'research', text: prose(50), priority: 1 }
      ],
      210
    )
    expect(r.dropped.map((d) => d.name)).toEqual(['research'])
    expect(r.blocks.map((b) => b.name)).toEqual(['storyBible'])
  })

  it('never drops a required block to save an optional one', () => {
    const r = fitToBudget(
      [
        { name: 'instructions', text: prose(30), priority: 0, required: true },
        { name: 'research', text: prose(200), priority: 50 }
      ],
      60
    )
    expect(r.dropped.map((d) => d.name)).toEqual(['research'])
    expect(r.blocks.map((b) => b.name)).toEqual(['instructions'])
  })

  it('degrades a shrinkable block before dropping anything', () => {
    const r = fitToBudget(
      [
        { name: 'bible', text: prose(200), priority: 10, minTokens: 50 },
        { name: 'brief', text: prose(20), priority: 100 }
      ],
      130
    )
    expect(r.dropped).toEqual([])
    expect(r.degraded.map((d) => d.name)).toEqual(['bible'])
    expect(r.blocks.map((b) => b.name)).toEqual(['bible', 'brief'])
  })

  it('drops only after degrading has run out of room', () => {
    const r = fitToBudget(
      [
        { name: 'bible', text: prose(200), priority: 10, minTokens: 100 },
        { name: 'brief', text: prose(20), priority: 100 }
      ],
      60
    )
    // bible degrades to its floor of 100, still over, so it goes.
    expect(r.degraded.map((d) => d.name)).toContain('bible')
    expect(r.dropped.map((d) => d.name)).toContain('bible')
    expect(r.blocks.map((b) => b.name)).toEqual(['brief'])
  })

  it('preserves input order — priority governs survival, not position', () => {
    const r = fitToBudget(
      [
        { name: 'first', text: prose(5), priority: 1 },
        { name: 'second', text: prose(5), priority: 99 }
      ],
      1000
    )
    expect(r.blocks.map((b) => b.name)).toEqual(['first', 'second'])
  })

  it('reports fits:false rather than silently overflowing on required blocks', () => {
    // The failure the server does silently. Here it is loud.
    const r = fitToBudget([{ name: 'huge', text: prose(500), priority: 0, required: true }], 50)
    expect(r.usedTokens).toBeLessThanOrEqual(50)
    expect(r.degraded.map((d) => d.name)).toContain('huge')
  })

  it('counts JSON blocks at the JSON rate when budgeting', () => {
    const json = 'x'.repeat(260) // 100 json-tokens, but only 65 prose-tokens
    const r = fitToBudget(
      [
        { name: 'keep', text: prose(10), priority: 100 },
        { name: 'entities', text: json, kind: 'json', priority: 1 }
      ],
      80
    )
    // Under the app's naive chars/4 estimate this pair would "fit" (65 + 10 = 75
    // <= 80) and be sent — then silently truncated server-side. At the real JSON
    // rate it does not fit (100 + 10), so the low-priority block goes instead.
    expect(r.dropped.map((d) => d.name)).toEqual(['entities'])
  })

  it('never empties the prompt to satisfy the budget', () => {
    // Dropping the last block standing would obey the constraint while defeating
    // its purpose. It is by construction the highest-priority block, so truncate.
    const r = fitToBudget([{ name: 'only', text: prose(500), priority: 1 }], 50)
    expect(r.dropped).toEqual([])
    expect(r.blocks.map((b) => b.name)).toEqual(['only'])
    expect(r.usedTokens).toBeLessThanOrEqual(50)
  })

  it('breaks priority ties by input order', () => {
    const r = fitToBudget(
      [
        { name: 'a', text: prose(50), priority: 5 },
        { name: 'b', text: prose(50), priority: 5 },
        { name: 'keep', text: prose(10), priority: 100 }
      ],
      70
    )
    // 'a' comes first, so it is sacrificed first.
    expect(r.dropped[0].name).toBe('a')
  })

  it('ignores empty and null blocks', () => {
    const r = fitToBudget(
      [
        { name: 'empty', text: '', priority: 1 },
        null,
        { name: 'real', text: prose(5), priority: 2 }
      ],
      1000
    )
    expect(r.blocks.map((b) => b.name)).toEqual(['real'])
  })

  it('accounts for separators between blocks', () => {
    const r = fitToBudget(
      [
        { name: 'a', text: prose(10), priority: 1 },
        { name: 'b', text: prose(10), priority: 1 }
      ],
      1000
    )
    // Two blocks, one separator.
    expect(r.usedTokens).toBeGreaterThan(20)
  })

  it('joins surviving blocks into the final text', () => {
    const r = fitToBudget(
      [
        { name: 'a', text: 'alpha', priority: 1 },
        { name: 'b', text: 'beta', priority: 1 }
      ],
      1000
    )
    expect(r.text).toBe('alpha\n\nbeta')
  })
})

describe('fitSceneContext', () => {
  it('passes everything through untouched when it fits', () => {
    const input = {
      storyContract: prose(50),
      spineContext: prose(50),
      storyContextBlock: prose(50),
      existingEntitiesJson: '{"a":1}',
      sceneContext: prose(50),
      logSummary: prose(50)
    }
    const r = fitSceneContext(input)
    expect(r.storyContract).toBe(input.storyContract)
    expect(r.spineContext).toBe(input.spineContext)
    expect(r.storyContextBlock).toBe(input.storyContextBlock)
    expect(r.sceneContext).toBe(input.sceneContext)
    expect(r.logSummary).toBe(input.logSummary)
    expect(r.note).toBe('')
    expect(r.fits).toBe(true)
  })

  it('sacrifices retrieved scene context before the story contract', () => {
    // Breaking established world rules is the most expensive error a scene can
    // make, so the contract outranks everything. Retrieved prior scenes are the
    // most speculative block and go first.
    const r = fitSceneContext({
      storyContract: prose(2000),
      sceneContext: prose(8000),
      storyContextBlock: prose(8000),
      contextTokens: 4096,
      outputTokens: 1000
    })
    expect(r.storyContract).not.toBe('')
    expect(r.sceneContext).toBe('')
  })

  it('shortens the story bible rather than deleting it', () => {
    // Some canon beats no canon.
    const r = fitSceneContext({
      storyContextBlock: prose(8000),
      contextTokens: 4096,
      outputTokens: 1000
    })
    expect(r.storyContextBlock).not.toBe('')
    expect(r.storyContextBlock.length).toBeLessThan(prose(8000).length)
    expect(r.note).toContain('shortened')
  })

  it('keeps the scene cast even under heavy pressure', () => {
    // buildSceneEntitiesBlob already scoped this to who is actually present, so
    // it is small and load-bearing — a scene cannot be written without it.
    const r = fitSceneContext({
      existingEntitiesJson: JSON.stringify({ charactersInScene: [{ name: 'Alice' }] }),
      storyContextBlock: prose(20000),
      sceneContext: prose(20000),
      contextTokens: 4096,
      outputTokens: 1000
    })
    expect(r.existingEntitiesJson).not.toBe('')
  })

  it('reports what it sacrificed rather than doing it silently', () => {
    // A budget that drops context silently is barely better than a server that
    // drops context silently.
    const r = fitSceneContext({
      storyContract: prose(500),
      sceneContext: prose(9000),
      contextTokens: 4096,
      outputTokens: 1000
    })
    expect(r.note).not.toBe('')
    expect(r.note).toContain('sceneContext')
  })

  it('budgets the entity JSON at the JSON rate, not chars/4', () => {
    const bigJson = JSON.stringify({ x: 'y'.repeat(20000) })
    const r = fitSceneContext({
      existingEntitiesJson: bigJson,
      contextTokens: 4096,
      outputTokens: 1000
    })
    // Must have been shortened; a chars/4 estimate would have under-counted it
    // by ~35% and let it through.
    expect(r.existingEntitiesJson.length).toBeLessThan(bigJson.length)
  })

  it('tolerates being called with nothing', () => {
    const r = fitSceneContext()
    expect(r.storyContract).toBe('')
    expect(r.fits).toBe(true)
    expect(r.note).toBe('')
  })

  it('leaves room for the output — a bigger scene target means less context', () => {
    const args = { storyContextBlock: prose(3000), contextTokens: 8192 }
    const small = fitSceneContext({ ...args, outputTokens: 1000 })
    const large = fitSceneContext({ ...args, outputTokens: 4500 })
    expect(large.storyContextBlock.length).toBeLessThanOrEqual(small.storyContextBlock.length)
  })
})

describe('describeBudget', () => {
  it('is empty when nothing was sacrificed', () => {
    const r = fitToBudget([{ name: 'a', text: prose(5), priority: 1 }], 1000)
    expect(describeBudget(r)).toBe('')
  })

  it('names what it dropped', () => {
    const r = fitToBudget(
      [
        { name: 'keep', text: prose(10), priority: 100 },
        { name: 'research', text: prose(100), priority: 1 }
      ],
      30
    )
    expect(describeBudget(r)).toContain('dropped')
    expect(describeBudget(r)).toContain('research')
  })

  it('names what it shortened', () => {
    const r = fitToBudget([{ name: 'bible', text: prose(200), priority: 1, minTokens: 20 }], 50)
    expect(describeBudget(r)).toContain('shortened')
    expect(describeBudget(r)).toContain('bible')
  })
})
