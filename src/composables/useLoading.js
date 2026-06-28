import { ref } from 'vue'

export function useLoading(loadFn) {
  const items = ref([])
  const isLoading = ref(false)

  async function load(...args) {
    isLoading.value = true
    try {
      items.value = await loadFn(...args)
    } finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, load }
}
