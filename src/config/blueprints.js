import DATA from './blueprints.json'

export const BLUEPRINTS = DATA.reduce((acc, { type, id, name, description, sections }) => {
  if (!acc[type]) acc[type] = []
  acc[type].push({ id, name, description, sections })
  return acc
}, {})
