import DATA from './blueprints.json'
// DEPENDENCY DIRECTION: blueprints → workspace (one-way, DO NOT reverse).
// workspace.js must never import from this file.
import { CREATIVE_WORKSPACE_TYPES } from './workspace'

interface Blueprint {
  id: string
  name: string
  description: string
  sections: unknown
}

export const BLUEPRINTS = (DATA as Array<Blueprint & { type: string }>).reduce(
  (acc: Record<string, Blueprint[]>, { type, id, name, description, sections }) => {
    if (!acc[type]) acc[type] = []
    acc[type].push({ id, name, description, sections })
    return acc
  },
  {}
)

export const CREATIVE_BLUEPRINTS = Object.fromEntries(
  Object.entries(BLUEPRINTS).filter(([type]) =>
    (CREATIVE_WORKSPACE_TYPES as readonly string[]).includes(type)
  )
)
