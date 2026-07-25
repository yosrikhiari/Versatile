import { ref, onMounted } from 'vue'

const THEME_KEY = 'versatile-theme'

const isDark = ref(true)
let initialized = false

function apply(dark) {
  isDark.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
}

export function useTheme() {
  function initTheme() {
    if (initialized) return
    initialized = true
    const stored = localStorage.getItem(THEME_KEY)
    const dark = stored ? stored === 'dark' : true
    apply(dark)
  }

  function toggleTheme() {
    initTheme()
    apply(!isDark.value)
  }

  return { isDark, initTheme, toggleTheme }
}
