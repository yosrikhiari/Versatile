import { watch, onScopeDispose } from 'vue'
import { createFocusTrap } from 'focus-trap'

export function useFocusTrap(targetRef, options = {}) {
  let trap = null

  function activate() {
    if (targetRef.value && !trap) {
      trap = createFocusTrap(targetRef.value, {
        escapeDeactivates: false,
        allowOutsideClick: true,
        ...options
      })
      trap.activate()
    }
  }

  function deactivate() {
    if (trap) {
      trap.deactivate()
      trap = null
    }
  }

  watch(targetRef, (el) => {
    if (el) {
      activate()
    } else {
      deactivate()
    }
  }, { immediate: true })

  onScopeDispose(deactivate)

  return { activate, deactivate }
}
