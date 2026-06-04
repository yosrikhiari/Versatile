import { customRef } from 'vue'

/**
 * A robust composable for reading and writing to localStorage with reactivity.
 * Automatically handles JSON serialization and parsing errors.
 * 
 * @param {string} key - The localStorage key
 * @param {*} defaultValue - The default value if the key doesn't exist or parsing fails
 * @returns {import('vue').Ref} A reactive ref synced with localStorage
 */
export function useLocalStorage(key, defaultValue) {
  return customRef((track, trigger) => {
    return {
      get() {
        track()
        try {
          const item = localStorage.getItem(key)
          if (item === null) return defaultValue
          
          // Special case for plain strings that aren't valid JSON strings
          if (typeof defaultValue === 'string' && !item.startsWith('"') && !item.startsWith('{') && !item.startsWith('[')) {
             return item
          }
          
          return JSON.parse(item)
        } catch (error) {
          console.warn(`[useLocalStorage] Error parsing key "${key}":`, error)
          return defaultValue
        }
      },
      set(newValue) {
        try {
          if (newValue === null || newValue === undefined) {
            localStorage.removeItem(key)
          } else if (typeof newValue === 'string' && typeof defaultValue === 'string') {
            localStorage.setItem(key, newValue)
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
