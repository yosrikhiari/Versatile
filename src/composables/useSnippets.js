import { computed } from 'vue'

export function useSnippets(snippets) {
  const sortedSnippets = computed(() => {
    return [...snippets.value].sort((a, b) => b.count - a.count)
  })

  function getTopSnippets(limit = 10) {
    return sortedSnippets.value.slice(0, limit)
  }

  function hasSnippets() {
    return snippets.value.length > 0
  }

  return {
    sortedSnippets,
    getTopSnippets,
    hasSnippets
  }
}
