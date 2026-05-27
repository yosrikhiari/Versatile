import { useProjectStore } from '../../../stores/projectStore'

export function getProjectContext() {
  const projectStore = useProjectStore()
  const parts = []
  if (projectStore.currentCategory) {
    parts.push(`Category: ${projectStore.currentCategory}`)
  }
  if (projectStore.currentDescription) {
    parts.push(`Description: ${projectStore.currentDescription}`)
  }
  return parts.length > 0 ? `\n\n${parts.join('\n')}` : ''
}
