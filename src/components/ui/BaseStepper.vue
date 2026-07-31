<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { domId } from '../../utils/domId'

/**
 * Numeric stepper for small bounded counts — scenes per chapter, retry budget,
 * words per sprint. The value stays directly editable, so a writer aiming for
 * 2,000 words types it rather than clicking forty times.
 */
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: Infinity },
  step: { type: Number, default: 1 },
  label: String,
  /** Unit shown after the value, e.g. `words`. */
  suffix: String,
  disabled: Boolean,
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v)
  }
})

const emit = defineEmits(['update:modelValue'])

const inputId = domId('stepper')

const canDecrement = computed(() => !props.disabled && props.modelValue > props.min)
const canIncrement = computed(() => !props.disabled && props.modelValue < props.max)

const clamp = (n) => Math.min(props.max, Math.max(props.min, n))

function nudge(direction) {
  emit('update:modelValue', clamp(props.modelValue + direction * props.step))
}

function onInput(event) {
  const parsed = Number(event.target.value)
  if (Number.isFinite(parsed)) emit('update:modelValue', clamp(parsed))
}

/** Snap the field back to a legal value when focus leaves a partial entry. */
function onBlur(event) {
  const parsed = Number(event.target.value)
  const next = Number.isFinite(parsed) ? clamp(parsed) : props.min
  event.target.value = String(next)
  emit('update:modelValue', next)
}

const buttonSize = computed(() => (props.size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'))
const fieldSize = computed(() => (props.size === 'sm' ? 'h-6 text-11px' : 'h-7 text-xs'))
</script>

<template>
  <div class="inline-flex flex-col gap-1.5">
    <label v-if="label" :for="inputId" class="label-micro text-text-hint">{{ label }}</label>

    <div :class="['inline-flex items-center gap-1', disabled && 'opacity-40']">
      <button
        type="button"
        :class="[
          'inline-flex shrink-0 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40',
          buttonSize
        ]"
        :disabled="!canDecrement"
        :aria-label="`Decrease${label ? ` ${label}` : ''}`"
        @click="nudge(-1)"
      >
        <BaseIcon name="minus" :size="13" />
      </button>

      <div class="relative">
        <input
          :id="inputId"
          type="number"
          inputmode="numeric"
          :value="modelValue"
          :min="min"
          :max="Number.isFinite(max) ? max : undefined"
          :step="step"
          :disabled="disabled"
          :class="[
            'vers-stepper-input w-16 rounded-md border border-border-subtle bg-bg-primary text-center font-ui tabular-nums text-text-primary transition-colors duration-150 focus:border-accent',
            fieldSize,
            suffix && 'pr-8'
          ]"
          @input="onInput"
          @blur="onBlur"
        />
        <span
          v-if="suffix"
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-ui text-11px text-text-hint"
        >
          {{ suffix }}
        </span>
      </div>

      <button
        type="button"
        :class="[
          'inline-flex shrink-0 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40',
          buttonSize
        ]"
        :disabled="!canIncrement"
        :aria-label="`Increase${label ? ` ${label}` : ''}`"
        @click="nudge(1)"
      >
        <BaseIcon name="plus" :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* The stepper supplies its own ± controls; the native spinners would sit on
   top of the suffix and duplicate the affordance. */
.vers-stepper-input::-webkit-outer-spin-button,
.vers-stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.vers-stepper-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
