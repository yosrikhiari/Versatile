import { onMounted, onUnmounted } from 'vue'

export function useClickOutside(targetRef, callback) {
  function handler(e) {
    const els = Array.isArray(targetRef.value) ? targetRef.value : [targetRef.value]
    const rendered = els.filter((el) => el != null)
    if (!rendered.length) return
    const clickedInside = rendered.some((el) => el.contains(e.target))
    if (!clickedInside) {
      callback()
    }
  }
  onMounted(() => document.addEventListener('click', handler))
  onUnmounted(() => document.removeEventListener('click', handler))
}
