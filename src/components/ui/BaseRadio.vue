<script setup>
import { computed } from 'vue'
import { domId } from '../../utils/domId'

/**
 * One option in a radio group. Wrap a set in an element with `role="radiogroup"`
 * and a group label; the shared `name` gives the set native arrow-key movement.
 *
 * For 2–4 short options that switch a view, prefer `BaseSegmented` — a radio
 * list earns its vertical space when the options need descriptions.
 */
const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: null },
  value: { type: [String, Number, Boolean], required: true },
  /** Shared across the group so the browser treats it as one set. */
  name: { type: String, required: true },
  label: String,
  description: String,
  disabled: Boolean
})

const emit = defineEmits(['update:modelValue'])

const inputId = domId('radio')
const checked = computed(() => props.modelValue === props.value)
</script>

<template>
  <div :class="['flex items-start gap-2.5', disabled && 'opacity-40']">
    <span class="relative mt-px flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        :id="inputId"
        type="radio"
        :name="name"
        class="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        :checked="checked"
        :disabled="disabled"
        @change="emit('update:modelValue', value)"
      />
      <span
        aria-hidden="true"
        :class="[
          'pointer-events-none flex h-4 w-4 items-center justify-center rounded-full border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          checked ? 'border-accent' : 'border-border-strong bg-bg-primary'
        ]"
      >
        <span v-if="checked" class="h-2 w-2 rounded-full bg-accent" />
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
