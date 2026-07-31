<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { domId } from '../../utils/domId'

/**
 * Checkbox over a real `<input>`, so keyboard, form association and screen
 * reader announcement come from the platform rather than from ARIA patched on
 * top of a `<div>`. The input stays in the layout (opacity 0) instead of being
 * pushed off-screen, which keeps native focus scrolling intact.
 */
const props = defineProps({
  modelValue: { type: [Boolean, Array], default: false },
  /** Required when `modelValue` is an array — the item this box contributes. */
  value: { type: [String, Number, Object], default: undefined },
  label: String,
  description: String,
  disabled: Boolean,
  /** Renders the dash state for a partially-selected group. */
  indeterminate: Boolean
})

const emit = defineEmits(['update:modelValue'])

const inputId = domId('checkbox')

const checked = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.includes(props.value) : !!props.modelValue
)

function onChange() {
  if (Array.isArray(props.modelValue)) {
    const next = checked.value
      ? props.modelValue.filter((v) => v !== props.value)
      : [...props.modelValue, props.value]
    emit('update:modelValue', next)
    return
  }
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div :class="['flex items-start gap-2.5', disabled && 'opacity-40']">
    <span class="relative mt-px flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        :id="inputId"
        type="checkbox"
        class="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        :checked="checked"
        :disabled="disabled"
        :indeterminate="indeterminate"
        @change="onChange"
      />
      <span
        aria-hidden="true"
        :class="[
          'pointer-events-none flex h-4 w-4 items-center justify-center rounded border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          checked || indeterminate
            ? 'border-accent bg-accent text-bg-primary'
            : 'border-border-strong bg-bg-primary'
        ]"
      >
        <BaseIcon
          v-if="indeterminate"
          name="minus"
          :size="11"
          :stroke-width="3"
          class="text-bg-primary"
        />
        <BaseIcon
          v-else-if="checked"
          name="check"
          :size="11"
          :stroke-width="3"
          class="text-bg-primary"
        />
      </span>
    </span>

    <div v-if="label || description || $slots.default" class="min-w-0 flex-1">
      <label
        v-if="label"
        :for="inputId"
        :class="['block font-ui text-xs text-text-primary', !disabled && 'cursor-pointer']"
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
