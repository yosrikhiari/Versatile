<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { domId } from '../../utils/domId'

/**
 * Labelled native select, styled like `BaseField`: label, one message slot below
 * (error over hint), the same border and focus treatment. Native so the picker
 * stays keyboard- and screen-reader-correct on every platform; the chevron is
 * ours because the browser's is not on the design system.
 */
const props = defineProps({
  modelValue: { type: [String, Number, null], default: null },
  /** `[{ value, label, disabled? }]` */
  options: { type: Array, required: true },
  label: { type: String, default: '' },
  /** Shown as the first, selectable "nothing chosen" row when set. */
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  /** Non-empty switches the field to its error styling and announces it. */
  error: { type: String, default: '' },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v)
  },
  disabled: Boolean,
  ariaLabel: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const selectId = domId('select')
const messageId = `${selectId}-message`
const message = computed(() => props.error || props.hint)

const selectClasses = computed(() => [
  'w-full appearance-none rounded-lg border bg-bg-elevated pr-8 font-ui text-text-primary transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
  props.size === 'sm' ? 'h-7 px-2.5 text-11px' : 'h-8 px-3 text-xs',
  props.error ? 'border-danger' : 'border-border-subtle focus:border-accent'
])

function onChange(event) {
  const raw = event.target.value
  const match = props.options.find((o) => String(o.value) === raw)
  emit('update:modelValue', match ? match.value : raw === '' ? null : raw)
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="selectId" class="label-micro text-text-hint">{{ label }}</label>
    <div class="relative">
      <select
        :id="selectId"
        :class="selectClasses"
        :value="modelValue ?? ''"
        :disabled="disabled"
        :aria-label="ariaLabel || undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="message ? messageId : undefined"
        @change="onChange"
      >
        <option v-if="placeholder" value="">{{ placeholder }}</option>
        <option
          v-for="opt in options"
          :key="String(opt.value)"
          :value="opt.value"
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </option>
      </select>
      <BaseIcon
        name="chevron-down"
        :size="14"
        class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-hint"
      />
    </div>
    <p
      v-if="message"
      :id="messageId"
      :class="['font-ui text-11px leading-snug', error ? 'text-danger' : 'text-text-hint']"
      :role="error ? 'alert' : undefined"
    >
      {{ message }}
    </p>
  </div>
</template>
