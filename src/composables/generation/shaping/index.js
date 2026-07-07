import { sortByRelevance } from './relevance'
import { applyTokenBudget } from './tokenBudget'

const MAX_CHARACTERS = 8
const MAX_LOCATIONS = 6
const MAX_PLOT_THREADS = 5
const LABEL_HEADINGS = { characters: 'EXISTING CHARACTERS:', locations: 'EXISTING LOCATIONS:' }

export function shapeContext(rawContext, options = {}) {
  const { entities } = rawContext
  const entityType = rawContext.entityType || 'unknown'

  const totalCharacters = entities.characters?.length || 0
  const totalLocations = entities.locations?.length || 0
  const totalPlotThreads = entities.plotThreads?.length || 0

  const sortedCharacters = sortByRelevance(entities.characters, 'character').slice(
    0,
    MAX_CHARACTERS
  )
  const sortedLocations = sortByRelevance(entities.locations, 'location').slice(0, MAX_LOCATIONS)
  const sortedPlotThreads = sortByRelevance(entities.plotThreads, 'plotThread').slice(
    0,
    MAX_PLOT_THREADS
  )

  const charactersBlock = buildEntityBlock(sortedCharacters, 'characters', formatCharacter)
  const locationsBlock = buildEntityBlock(sortedLocations, 'locations', formatLocation)
  const plotThreadsBlock = buildEntityBlock(sortedPlotThreads, 'plotThreads', formatPlotThread)

  const projectBlock =
    rawContext.project.category || rawContext.project.description
      ? `\n\nPROJECT CONTEXT:\n${['Category', 'Description']
          .filter((k) => rawContext.project[k.toLowerCase()])
          .map((k) => `${k}: ${rawContext.project[k.toLowerCase()]}`)
          .join('\n')}`
      : ''

  const relationshipsBlock = rawContext.relationships || ''
  const manuscriptBlock = rawContext.manuscript
    ? `\n\nMANUSCRIPT EXCERPTS:\n${rawContext.manuscript}`
    : ''

  const bundle = {
    projectBlock,
    charactersBlock,
    locationsBlock,
    plotThreadsBlock,
    relationshipsBlock,
    manuscriptBlock
  }

  const result = applyTokenBudget(bundle, options.tokenBudget, options.systemPrompt)

  return result
}

function buildEntityBlock(entities, label, formatter) {
  if (entities.length === 0) return ''
  const heading = LABEL_HEADINGS[label] || 'ACTIVE PLOT THREADS:'
  return `\n\n${heading}\n${entities.map(formatter).join('\n')}`
}

function toTraitsArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string' && val)
    return val
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean)
  return []
}

function formatCharacter(c) {
  const roleSuffix = c.role ? ` (${c.role})` : ''
  const goalSuffix = c.goal ? ` — ${c.goal.slice(0, 80)}` : ''
  const traits = toTraitsArray(c.traits)
  const traitsSuffix = traits.length ? ` [${traits.join('; ')}]` : ''
  return `- "${c.name}"${roleSuffix}${goalSuffix}${traitsSuffix}`
}

function formatLocation(l) {
  const descSuffix = l.description ? `: ${l.description.slice(0, 80)}` : ''
  const traits = toTraitsArray(l.traits)
  const traitsSuffix = traits.length ? ` [${traits.join('; ')}]` : ''
  return `- "${l.name}"${descSuffix}${traitsSuffix}`
}

function formatPlotThread(t) {
  const notesSuffix = t.notes ? `: ${t.notes.slice(0, 80)}` : ''
  const traits = toTraitsArray(t.traits)
  const traitsSuffix = traits.length ? ` [${traits.join('; ')}]` : ''
  return `- "${t.title}"${notesSuffix}${traitsSuffix}`
}

export { buildEntityBlock, formatCharacter, formatLocation, formatPlotThread }
