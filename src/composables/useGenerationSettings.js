import { ref, computed } from 'vue'

// Reactive generation settings for the story generator (genre, tone, and the
// volumes×chapters×words structure). Extracted from StoryGeneratorPanel so the
// panel stays an orchestrator; returned as refs so the template's v-models keep
// working unchanged.
export function useGenerationSettings() {
  const genre = ref('')
  const tone = ref('')
  const wordTarget = ref(3500)
  const usePreciseStructure = ref(false)
  const volumes = ref(1)
  const chaptersPerVolume = ref(10)
  const wordsPerChapter = ref(2000)
  const scenesPerChapter = ref(3)

  const estimatedTotalWords = computed(
    () => volumes.value * chaptersPerVolume.value * wordsPerChapter.value
  )

  return {
    genre,
    tone,
    wordTarget,
    usePreciseStructure,
    volumes,
    chaptersPerVolume,
    wordsPerChapter,
    scenesPerChapter,
    estimatedTotalWords
  }
}
