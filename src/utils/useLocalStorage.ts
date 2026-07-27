import { customRef, type Ref } from 'vue'

export function useLocalStorage<T>(key: string, defaultValue: T): Ref<T> {
  return customRef<T>((track, trigger) => {
    return {
      get() {
        track()
        try {
          const item = localStorage.getItem(key)
          if (item === null) return defaultValue

          if (
            typeof defaultValue === 'string' &&
            !item.startsWith('"') &&
            !item.startsWith('{') &&
            !item.startsWith('[')
          ) {
            return item as unknown as T
          }

          return JSON.parse(item) as T
        } catch (error) {
          console.warn(`[useLocalStorage] Error parsing key "${key}":`, error)
          return defaultValue
        }
      },
      set(newValue: T) {
        try {
          if (newValue === null || newValue === undefined) {
            localStorage.removeItem(key)
          } else if (typeof newValue === 'string' && typeof defaultValue === 'string') {
            localStorage.setItem(key, newValue as string)
          } else {
            localStorage.setItem(key, JSON.stringify(newValue))
          }
          trigger()
        } catch (error) {
          console.error(`[useLocalStorage] Error setting key "${key}":`, error)
        }
      }
    }
  })
}
