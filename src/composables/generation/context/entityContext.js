import { useStoryBibleStore } from '../../../stores/storyBibleStore'

export function getEntityContext() {
  const storyBible = useStoryBibleStore()
  return {
    characters: storyBible.characters,
    locations: storyBible.locations,
    plotThreads: storyBible.plotThreads
  }
}
