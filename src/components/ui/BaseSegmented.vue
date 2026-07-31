<script setup>
import { computed, ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

/**
 * Segmented control — a small, fully-visible set of mutually exclusive choices.
 * Prefer this over a select when there are 2–4 options and the choice is worth
 * showing at rest (generation mode, draft length, panel scope).
 *
 * The track sits at canvas depth and the selected segment lifts to the elevated
 * tone, so selection reads as a raised thumb rather than a color wash.
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  /** `[{ value, label, icon?, disabled? }]` */
  options: { type: Array, required: true },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v)
  },
  /** Segments share the width evenly instead of sizing to their label. */
  block: Boolean,
  ariaLabel: { type: String, default: 'Select an option' },
  disabled: Boolean
})

const emit = defineEmits(['update:modelValue'])

const root = ref(null)

const sizeClasses = computed(
  () =>
    ({
      sm: 'text-11px px-2 py-1 gap-1',
      md: 'text-xs px-3 py-1.5 gap-1.5'
    })[props.size]
)

const iconSize = computed(() => (props.size === 'sm' ? 12 : 14))

const isSelected = (option) => option.value === props.modelValue

function select(option) {
  if (props.disabled || option.disabled || isSelected(option)) return
  emit('update:modelValue', option.value)
}

/**
 * Roving arrow-key selection, per the WAI-ARIA radiogroup pattern: arrows move
 * to and select the neighbouring enabled segment, wrapping at both ends.
 */
function onKeydown(event) {
  const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
  const step = STEP[event.key]
  if (!step || props.disabled) return

  const enabled = props.options.filter((o) => !o.disabled)
  if (enabled.length < 2) return

  const current = enabled.findIndex(isSelected)
  const next = enabled[(current + step + enabled.length) % enabled.length]

  event.preventDefault()
  emit('update:modelValue', next.value)

  // Keep DOM focus on whichever segment is now checked.
  const index = props.options.indexOf(next)
  root.value?.querySelectorAll('[role="radio"]')[index]?.focus()
}
</script>

<template>
  <div
    ref="root"
    role="radiogroup"
    :aria-label="ariaLabel"
    :class="[
      'inline-flex items-center gap-0.5 rounded-lg border border-border-subtle bg-bg-primary p-0.5',
      block && 'flex w-full',
      disabled && 'pointer-events-none opacity-40'
    ]"
    @keydown="onKeydown"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="isSelected(option) ? 'true' : 'false'"
      :tabindex="isSelected(option) ? 0 : -1"
      :disabled="disabled || option.disabled"
      :class="[
        'inline-flex items-center justify-center rounded-md font-ui font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
        sizeClasses,
        block && 'flex-1',
        isSelected(option)
          ? 'bg-bg-elevated text-text-primary'
          : 'text-text-hint hover:bg-surface-hover hover:text-text-secondary'
      ]"
      @click="select(option)"
    >
      <BaseIcon v-if="option.icon" :name="option.icon" :size="iconSize" class="shrink-0" />
      <span class="truncate">{{ option.label }}</span>
    </button>
  </div>
</template>
