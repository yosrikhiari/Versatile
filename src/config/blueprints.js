import DATA from './blueprints.json'
// DEPENDENCY DIRECTION: blueprints → workspace (one-way, DO NOT reverse).
// workspace.js must never import from this file.
import { CREATIVE_WORKSPACE_TYPES } from './workspace'

export const BLUEPRINTS = DATA.reduce((acc, { type, id, name, description, sections }) => {
  if (!acc[type]) acc[type] = []
  acc[type].push({ id, name, description, sections })
  return acc
}, {})

export const CREATIVE_BLUEPRINTS = Object.fromEntries(
  Object.entries(BLUEPRINTS).filter(([type]) => CREATIVE_WORKSPACE_TYPES.includes(type))
)
