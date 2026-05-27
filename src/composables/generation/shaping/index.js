import { sortByRelevance } from './relevance'
import { applyTokenBudget } from './tokenBudget'

const MAX_CHARACTERS = 8
const MAX_LOCATIONS = 6
const MAX_PLOT_THREADS = 5

export function shapeContext(rawContext, options = {}) {
  const { entities } = rawContext

  const sortedCharacters = sortByRelevance(entities.characters, 'character').slice(0, MAX_CHARACTERS)
  const sortedLocations = sortByRelevance(entities.locations, 'location').slice(0, MAX_LOCATIONS)
  const sortedPlotThreads = sortByRelevance(entities.plotThreads, 'plotThread').slice(0, MAX_PLOT_THREADS)

  const charactersBlock = buildEntityBlock(sortedCharacters, 'characters', formatCharacter)
  const locationsBlock = buildEntityBlock(sortedLocations, 'locations', formatLocation)
  const plotThreadsBlock = buildEntityBlock(sortedPlotThreads, 'plotThreads', formatPlotThread)

  const projectBlock = rawContext.project.category || rawContext.project.description
    ? `\n\nPROJECT CONTEXT:\n${['Category', 'Description']
        .filter(k => rawContext.project[k.toLowerCase()])
        .map(k => `${k}: ${rawContext.project[k.toLowerCase()]}`)
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

  return applyTokenBudget(bundle, options.tokenBudget)
}

function buildEntityBlock(entities, label, formatter) {
  if (entities.length === 0) return ''
  return `\n\n${label === 'characters' ? 'EXISTING CHARACTERS:' : label === 'locations' ? 'EXISTING LOCATIONS:' : 'ACTIVE PLOT THREADS:'}\n${entities.map(formatter).join('\n')}`
}

function formatCharacter(c) {
  return `- "${c.name}"${c.role ? ` (${c.role})` : ''}${c.goal ? ` — ${c.goal.slice(0, 80)}` : ''}`
}

function formatLocation(l) {
  return `- "${l.name}"${l.description ? `: ${l.description.slice(0, 80)}` : ''}`
}

function formatPlotThread(t) {
  return `- "${t.title}"${t.notes ? `: ${t.notes.slice(0, 80)}` : ''}`
}
