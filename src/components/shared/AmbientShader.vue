<script setup>
import { computed } from 'vue'

/**
 * AmbientShader — a decorative, full-bleed animated "aurora" background.
 *
 * Self-contained: pure CSS layered gradients + a slow drift animation, so it has
 * no external shader dependency and renders anywhere (including Storybook). The
 * effect is purely decorative and pointer-transparent; it honors reduced-motion.
 */
const props = defineProps({
  // Relative animation speed; higher = faster drift. 3 ≈ ~24s cycle.
  speed: { type: Number, default: 3 },
  colorScheme: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'warm', 'cool', 'forest'].includes(v)
  }
})

const COLOR_SCHEMES = {
  default: { a: '#5c3a1e', b: '#c9a96e', c: '#8b6914' },
  warm: { a: '#8b3a3a', b: '#d4a574', c: '#a0522d' },
  cool: { a: '#1e3a5c', b: '#6ea8c9', c: '#145b8b' },
  forest: { a: '#2d5c1e', b: '#7ac96e', c: '#3d8b14' }
}

const scheme = computed(() => COLOR_SCHEMES[props.colorScheme] || COLOR_SCHEMES.default)

// Map speed → animation duration (seconds). Clamp so extreme values stay sane.
const durationS = computed(() => {
  const s = Math.min(Math.max(props.speed, 0.5), 10)
  return (72 / s).toFixed(1)
})

const styleVars = computed(() => ({
  '--aurora-a': scheme.value.a,
  '--aurora-b': scheme.value.b,
  '--aurora-c': scheme.value.c,
  '--aurora-duration': `${durationS.value}s`
}))
</script>

<template>
  <div
    class="ambient-shader fixed inset-0 pointer-events-none z-0"
    :style="styleVars"
    aria-hidden="true"
  >
    <div class="aurora-layer aurora-1"></div>
    <div class="aurora-layer aurora-2"></div>
    <div class="aurora-layer aurora-3"></div>
  </div>
</template>

<style scoped>
.ambient-shader {
  overflow: hidden;
}

.aurora-layer {
  position: absolute;
  inset: -25%;
  border-radius: 45%;
  filter: blur(60px);
  opacity: 0.4;
  mix-blend-mode: screen;
  will-change: transform;
}

.aurora-1 {
  background: radial-gradient(circle at 30% 20%, var(--aurora-a), transparent 60%);
  animation: aurora-drift-1 var(--aurora-duration) ease-in-out infinite;
}
.aurora-2 {
  background: radial-gradient(circle at 70% 30%, var(--aurora-b), transparent 62%);
  animation: aurora-drift-2 calc(var(--aurora-duration) * 1.3) ease-in-out infinite;
}
.aurora-3 {
  background: radial-gradient(circle at 50% 80%, var(--aurora-c), transparent 64%);
  animation: aurora-drift-3 calc(var(--aurora-duration) * 1.6) ease-in-out infinite;
}

@keyframes aurora-drift-1 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(8%, 6%) scale(1.15);
  }
}
@keyframes aurora-drift-2 {
  0%,
  100% {
    transform: translate(0, 0) scale(1.1);
  }
  50% {
    transform: translate(-10%, 4%) scale(0.95);
  }
}
@keyframes aurora-drift-3 {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(6%, -8%) scale(1.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .aurora-layer {
    animation: none;
  }
}
</style>
