import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * useAnimations — single source of truth for motion tokens.
 *
 * Centralizes durations, easings, and named presets so components stop
 * hand-rolling one-off `transition:` strings and keyframes. Every value is
 * reduced-motion aware: when the user prefers reduced motion, durations
 * collapse to (near) zero and transforms are dropped.
 *
 * Usage:
 *   const { preset, duration, prefersReducedMotion } = useAnimations()
 *   // in <Transition> via v-bind:
 *   <Transition v-bind="preset('fade')">…</Transition>
 */

// --- tokens -----------------------------------------------------------------

export const DURATIONS = {
  instant: 80,
  fast: 150,
  base: 220,
  slow: 320,
  slower: 480
}

export const EASINGS = {
  // Matches tailwind.config.js transitionTimingFunction entries.
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  outExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',
  outQuart: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear'
}

// Named Vue <Transition> presets → the class/hook names Vue expects.
// Each preset resolves to CSS classes defined in style.css (`.anim-*`).
const PRESETS = {
  fade: 'anim-fade',
  'fade-up': 'anim-fade-up',
  'fade-down': 'anim-fade-down',
  scale: 'anim-scale',
  'slide-left': 'anim-slide-left',
  'slide-right': 'anim-slide-right'
}

// --- reactive reduced-motion state (shared singleton) -----------------------

const prefersReducedMotion = ref(false)
let mql = null
let refCount = 0

function sync(e) {
  prefersReducedMotion.value = e.matches
}

export function useAnimations() {
  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    if (!mql) {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      prefersReducedMotion.value = mql.matches
      mql.addEventListener('change', sync)
    }
    refCount++
  })

  onUnmounted(() => {
    refCount--
    if (refCount <= 0 && mql) {
      mql.removeEventListener('change', sync)
      mql = null
      refCount = 0
    }
  })

  /** Duration in ms for a named token, honoring reduced-motion. */
  function duration(name = 'base') {
    if (prefersReducedMotion.value) return 0
    return DURATIONS[name] ?? DURATIONS.base
  }

  /** Build a `transition` shorthand string for one or more properties. */
  function transition(props = 'all', durationName = 'base', easingName = 'standard') {
    const d = duration(durationName)
    const e = EASINGS[easingName] ?? EASINGS.standard
    const list = Array.isArray(props) ? props : [props]
    return list.map((p) => `${p} ${d}ms ${e}`).join(', ')
  }

  /**
   * Resolve a named preset into props for <Transition>.
   * Under reduced motion, falls back to the plain `anim-fade` cross-fade.
   */
  function preset(name = 'fade') {
    const base = prefersReducedMotion.value ? PRESETS.fade : (PRESETS[name] ?? PRESETS.fade)
    return { name: base }
  }

  const availablePresets = computed(() => Object.keys(PRESETS))

  return {
    DURATIONS,
    EASINGS,
    prefersReducedMotion,
    duration,
    transition,
    preset,
    availablePresets
  }
}
