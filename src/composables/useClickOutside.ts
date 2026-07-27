import { onMounted, onUnmounted } from 'vue'

export function useClickOutside(targetRef: any, callback: any) {
  function handler(e: any) {
    const els = Array.isArray(targetRef.value) ? targetRef.value : [targetRef.value]
    const rendered = els.filter((el: any) => el != null)
    if (!rendered.length) return
    const clickedInside = rendered.some((el: any) => el.contains(e.target))
    if (!clickedInside) {
      callback()
    }
  }
  onMounted(() => document.addEventListener('click', handler))
  onUnmounted(() => document.removeEventListener('click', handler))
}
