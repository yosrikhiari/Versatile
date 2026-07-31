<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { domId } from '../../utils/domId'

/**
 * Labelled text field: label, optional leading icon and trailing unit, and one
 * message slot below that shows the error when there is one and the hint
 * otherwise — so the row never grows or collapses as validation flips.
 *
 * Renders a `<textarea>` when `rows` is set.
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: String,
  type: { type: String, default: 'text' },
  placeholder: String,
  /** Lucide icon name shown inside the field's leading edge. */
  icon: String,
  /** Static trailing text — a unit or currency, e.g. `words`. */
  suffix: String,
  hint: String,
  /** Non-empty switches the field to its error styling and announces it. */
  error: String,
  disabled: Boolean,
  required: Boolean,
  rows: Number
})

const emit = defineEmits(['update:modelValue'])

const inputId = domId('field')
const messageId = `${inputId}-message`

const message = computed(() => props.error || props.hint)
const isMultiline = computed(() => Number(props.rows) > 0)

const fieldClasses = computed(() => [
  'w-full rounded-lg border bg-bg-elevated font-ui text-xs text-text-primary transition-colors duration-150 placeholder:text-text-hint disabled:cursor-not-allowed disabled:opacity-40',
  isMultiline.value ? 'px-3 py-2 leading-relaxed resize-y' : 'h-8 px-3',
  props.icon && !isMultiline.value && 'pl-8',
  props.suffix && !isMultiline.value && 'pr-12',
  props.error ? 'border-danger' : 'border-border-subtle focus:border-accent'
])
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="inputId" class="label-micro text-text-hint">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
    </label>

    <div class="relative">
      <BaseIcon
        v-if="icon && !isMultiline"
        :name="icon"
        :size="14"
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-hint"
      />

      <textarea
        v-if="isMultiline"
        :id="inputId"
        :value="modelValue"
        :rows="rows"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="message ? messageId : undefined"
        :class="fieldClasses"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <input
        v-else
        :id="inputId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="message ? messageId : undefined"
        :class="fieldClasses"
        @input="emit('update:modelValue', $event.target.value)"
      />

      <span
        v-if="suffix && !isMultiline"
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-ui text-11px text-text-hint"
      >
        {{ suffix }}
      </span>
    </div>

    <p
      v-if="message"
      :id="messageId"
      :class="['font-ui text-xs leading-relaxed', error ? 'text-danger' : 'text-text-hint']"
    >
      {{ message }}
    </p>
  </div>
</template>
