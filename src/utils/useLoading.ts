import { ref, type Ref } from 'vue'

/**
 * Minimal async-list loading helper (migrated to TypeScript — M-7.1).
 * Wraps a loader and tracks an `isLoading` flag around it.
 */
export function useLoading<T, A extends unknown[] = unknown[]>(loadFn: (...args: A) => Promise<T[]>): {
  items: Ref<T[]>
  isLoading: Ref<boolean>
  load: (...args: A) => Promise<void>
} {
  const items = ref<T[]>([]) as Ref<T[]>
  const isLoading = ref(false)

  async function load(...args: A): Promise<void> {
    isLoading.value = true
    try {
      items.value = await loadFn(...args)
    } finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, load }
}
