import { countTokens, type TokenKind } from './tokenizer'

const CHARS_PER_TOKEN: Record<string, number> = {
  prose: 4.0,
  json: 2.6
}

export function estimateTokens(text: string, kind: string = 'prose'): number {
  return countTokens(text, (kind as TokenKind) || 'prose')
}

/**
 * Cut `text` down to `maxTokens`, preferring a sentence or line boundary.
 *
 * The character ratio is used to *place* the cut, then the result is verified
 * against the real count and re-cut if the ratio under-estimated. Seeking the
 * exact boundary by re-tokenizing a shrinking prefix would be O(n) tokenizations
 * per trim; one corrective pass gets within a token or two for a fraction of it.
 */
export function trimToTokens(text: string, maxTokens: number, kind: string = 'prose'): string {
  if (maxTokens <= 0) return ''
  if (estimateTokens(text, kind) <= maxTokens) return text

  const rate = CHARS_PER_TOKEN[kind] || CHARS_PER_TOKEN.prose
  let maxChars = Math.floor(maxTokens * rate)

  // Dense text (JSON, non-Latin script, heavy punctuation) tokenizes at fewer
  // characters per token than the ratio assumes, so the first cut can still be
  // over. Contract until it fits or the text is too small to matter.
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = cutAtBoundary(text, maxChars)
    if (estimateTokens(candidate, kind) <= maxTokens || maxChars <= 32) return candidate
    maxChars = Math.floor(maxChars * 0.8)
  }
  return cutAtBoundary(text, maxChars)
}

function cutAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'))
  return boundary > maxChars * 0.5 ? cut.slice(0, boundary + 1) : cut
}

interface Block {
  name: string
  text: string
  priority: number
  kind?: 'prose' | 'json'
  required?: boolean
  minTokens?: number
}

interface BlockInternal {
  name: string
  text: string
  kind: 'prose' | 'json'
  priority: number
  required: boolean
  minTokens: number | undefined
  order: number
  tokens: number
}

interface BudgetResult {
  blocks: Block[]
  text: string
  usedTokens: number
  budgetTokens: number
  dropped: { name: string; tokens: number }[]
  degraded: { name: string; from: number; to: number }[]
  fits: boolean
}

export function fitToBudget(blocks: Block[], budgetTokens: number, options: { separator?: string } = {}): BudgetResult {
  const separator = options.separator ?? '\n\n'
  const sepTokens = estimateTokens(separator)

  const working: BlockInternal[] = blocks
    .filter((b) => b && b.text)
    .map((b, i) => ({
      name: b.name,
      text: b.text,
      kind: b.kind || 'prose',
      priority: b.priority ?? 0,
      required: !!b.required,
      minTokens: b.minTokens,
      order: i,
      tokens: estimateTokens(b.text, b.kind || 'prose')
    }))

  const dropped: { name: string; tokens: number }[] = []
  const degraded: { name: string; from: number; to: number }[] = []

  const total = () =>
    working.reduce((sum, b) => sum + b.tokens, 0) + Math.max(0, working.length - 1) * sepTokens

  const sacrificeOrder = () =>
    [...working].sort((a, b) => a.priority - b.priority || a.order - b.order)

  for (const block of sacrificeOrder()) {
    if (total() <= budgetTokens) break
    if (block.minTokens === undefined || block.tokens <= block.minTokens) continue
    const over = total() - budgetTokens
    const target = Math.max(block.minTokens, block.tokens - over)
    if (target >= block.tokens) continue
    const before = block.tokens
    block.text = trimToTokens(block.text, target, block.kind)
    block.tokens = estimateTokens(block.text, block.kind)
    degraded.push({ name: block.name, from: before, to: block.tokens })
  }

  for (const block of sacrificeOrder()) {
    if (total() <= budgetTokens) break
    if (block.required) continue
    if (working.length <= 1) break
    const idx = working.indexOf(block)
    if (idx === -1) continue
    working.splice(idx, 1)
    dropped.push({ name: block.name, tokens: block.tokens })
  }

  let fits = total() <= budgetTokens
  if (!fits && working.length) {
    const overflow = total() - budgetTokens
    const shrinkable = working.reduce((sum, b) => sum + b.tokens, 0)
    if (shrinkable > 0) {
      for (const block of working) {
        const share = block.tokens / shrinkable
        const target = Math.max(1, Math.floor(block.tokens - overflow * share))
        const before = block.tokens
        block.text = trimToTokens(block.text, target, block.kind)
        block.tokens = estimateTokens(block.text, block.kind)
        if (block.tokens < before)
          degraded.push({ name: block.name, from: before, to: block.tokens })
      }
    }
    fits = total() <= budgetTokens
  }

  const ordered = working.sort((a, b) => a.order - b.order)
  return {
    blocks: ordered.map(({ name, text, kind, priority, required }) => ({
      name,
      text,
      kind,
      priority,
      required
    })),
    text: ordered.map((b) => b.text).join(separator),
    usedTokens: total(),
    budgetTokens,
    dropped,
    degraded,
    fits
  }
}

const SCENE_PRIORITY: Record<string, number> = {
  storyContract: 100,
  entities: 80,
  storyBible: 60,
  spine: 50,
  chapterLog: 30,
  sceneContext: 10
}

const DEFAULT_CONTEXT_TOKENS = 16384
const SCAFFOLD_RESERVE_TOKENS = 1500

export function fitSceneContext({
  storyContract = '',
  spineContext = '',
  storyContextBlock = '',
  existingEntitiesJson = '',
  sceneContext = '',
  logSummary = '',
  outputTokens = 2240,
  contextTokens = DEFAULT_CONTEXT_TOKENS
}: {
  storyContract?: string
  spineContext?: string
  storyContextBlock?: string
  existingEntitiesJson?: string
  sceneContext?: string
  logSummary?: string
  outputTokens?: number
  contextTokens?: number
} = {}): {
  storyContract: string
  existingEntitiesJson: string
  storyContextBlock: string
  spineContext: string
  logSummary: string
  sceneContext: string
  note: string
  fits: boolean
} {
  const budget = Math.max(1000, contextTokens - outputTokens - SCAFFOLD_RESERVE_TOKENS)

  const result = fitToBudget(
    [
      {
        name: 'storyContract',
        text: storyContract,
        priority: SCENE_PRIORITY.storyContract,
        required: true
      },
      {
        name: 'entities',
        text: existingEntitiesJson,
        kind: 'json',
        priority: SCENE_PRIORITY.entities,
        minTokens: 400
      },
      {
        name: 'storyBible',
        text: storyContextBlock,
        priority: SCENE_PRIORITY.storyBible,
        minTokens: 400
      },
      { name: 'spine', text: spineContext, priority: SCENE_PRIORITY.spine, minTokens: 200 },
      { name: 'chapterLog', text: logSummary, priority: SCENE_PRIORITY.chapterLog },
      { name: 'sceneContext', text: sceneContext, priority: SCENE_PRIORITY.sceneContext }
    ],
    budget
  )

  const pick = (name: string) => result.blocks.find((b) => b.name === name)?.text || ''

  return {
    storyContract: pick('storyContract'),
    existingEntitiesJson: pick('entities'),
    storyContextBlock: pick('storyBible'),
    spineContext: pick('spine'),
    logSummary: pick('chapterLog'),
    sceneContext: pick('sceneContext'),
    note: describeBudget(result),
    fits: result.fits
  }
}

export function describeBudget(result: BudgetResult): string {
  if (!result) return ''
  const parts: string[] = []
  if (result.dropped.length) {
    parts.push(`dropped ${result.dropped.map((d) => `${d.name} (~${d.tokens} tok)`).join(', ')}`)
  }
  if (result.degraded.length) {
    parts.push(
      `shortened ${result.degraded.map((d) => `${d.name} (${d.from}→${d.to} tok)`).join(', ')}`
    )
  }
  if (!result.fits) {
    parts.push(`STILL OVER BUDGET (${result.usedTokens}/${result.budgetTokens} tok)`)
  }
  return parts.join('; ')
}
