<script>
let nextUid = 0
</script>

<script setup>
import { ref, computed } from 'vue'
import { useTooltipManager } from '../../composables/useTooltipManager'

const GAP = 8

const props = defineProps({
  text: String,
  position: {
    type: String,
    default: 'top',
    validator: v => ['top', 'bottom', 'left', 'right'].includes(v)
  }
})

const tooltipId = ++nextUid
const { setActive, clear, isActive } = useTooltipManager()

const triggerRef = ref(null)
const coords = ref({ left: 0, top: 0 })

const transformMap = {
  top: 'translate(-50%, -100%)',
  bottom: 'translate(-50%, 0)',
  left: 'translate(-100%, -50%)',
  right: 'translate(0, -50%)'
}

function computePosition() {
  if (!triggerRef.value) return
  const r = triggerRef.value.getBoundingClientRect()
  switch (props.position) {
    case 'top':
      coords.value = { left: r.left + r.width / 2, top: r.top - GAP }
      break
    case 'bottom':
      coords.value = { left: r.left + r.width / 2, top: r.bottom + GAP }
      break
    case 'left':
      coords.value = { left: r.left - GAP, top: r.top + r.height / 2 }
      break
    case 'right':
      coords.value = { left: r.right + GAP, top: r.top + r.height / 2 }
      break
  }
}

function handleMouseEnter() {
  computePosition()
  setActive(tooltipId)
}

function handleMouseLeave() {
  clear()
}

const tooltipStyle = computed(() => ({
  position: 'fixed',
  left: `${coords.value.left}px`,
  top: `${coords.value.top}px`,
  transform: transformMap[props.position]
}))
</script>

<template>
  <span ref="triggerRef" class="inline-flex" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <slot />
  </span>
  <Teleport to="body">
    <span
      v-if="isActive(tooltipId)"
      :style="tooltipStyle"
      class="z-50 pointer-events-none w-max max-w-[260px] px-3 py-1.5 rounded-lg bg-bg-tertiary/95 backdrop-blur-sm border border-border-subtle text-text-secondary text-[11px] font-ui leading-relaxed shadow-warm-md whitespace-normal"
    >
      {{ text }}
    </span>
  </Teleport>
</template>
