<script setup>
import { computed } from 'vue'
import { domId } from '../../utils/domId'

/**
 * Binary setting that takes effect immediately — autosave, focus mode, local
 * inference. For choices that only apply on submit, use a checkbox instead.
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: String,
  /** Secondary line under the label, for consequences worth spelling out. */
  description: String,
  disabled: Boolean,
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v)
  }
})

const emit = defineEmits(['update:modelValue'])

const labelId = domId('switch')

const track = computed(() => (props.size === 'sm' ? 'h-4 w-7' : 'h-5 w-9'))
const thumb = computed(() => (props.size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'))
const travel = computed(() =>
  props.modelValue ? (props.size === 'sm' ? 'translate-x-3.5' : 'translate-x-4') : 'translate-x-0.5'
)

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div :class="['flex items-start gap-3', disabled && 'opacity-40']">
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue ? 'true' : 'false'"
      :aria-labelledby="label ? labelId : undefined"
      :disabled="disabled"
      :class="[
        'relative mt-0.5 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-not-allowed',
        track,
        modelValue ? 'bg-accent' : 'bg-surface-hover border border-border-subtle'
      ]"
      @click="toggle"
    >
      <span
        :class="[
          'absolute top-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 ease-out',
          thumb,
          travel,
          modelValue ? 'bg-bg-primary' : 'bg-text-hint'
        ]"
      />
    </button>

    <div v-if="label || description || $slots.default" class="min-w-0 flex-1">
      <label
        v-if="label"
        :id="labelId"
        :class="['block font-ui text-xs text-text-primary', !disabled && 'cursor-pointer']"
        @click="toggle"
      >
        {{ label }}
      </label>
      <p v-if="description" class="mt-0.5 font-ui text-xs leading-relaxed text-text-hint">
        {{ description }}
      </p>
      <slot />
    </div>
  </div>
</template>
