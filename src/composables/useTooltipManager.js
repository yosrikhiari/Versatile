import { ref } from 'vue'

const activeTooltipId = ref(null)

export function useTooltipManager() {
  function setActive(id) {
    activeTooltipId.value = id
  }

  function clear() {
    activeTooltipId.value = null
  }

  function isActive(id) {
    return activeTooltipId.value === id
  }

  return { setActive, clear, isActive }
}
