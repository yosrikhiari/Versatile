<script setup>
import { computed } from 'vue'

/**
 * Indeterminate progress ring. Use for waits the app cannot size — a provider
 * round-trip, an index rebuild. When the wait has a known shape, a skeleton or
 * a progress bar tells the writer more.
 */
const props = defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v)
  },
  /** Announced to screen readers; also the tooltip-free accessible name. */
  label: { type: String, default: 'Loading' }
})

const dimension = computed(() => ({ sm: 14, md: 20, lg: 28 })[props.size])
const stroke = computed(() => ({ sm: 2, md: 2, lg: 2.5 })[props.size])
</script>

<template>
  <span role="status" class="inline-flex items-center" :aria-label="label">
    <svg
      class="animate-spin"
      :width="dimension"
      :height="dimension"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" :stroke-width="stroke" class="stroke-border-strong" />
      <!-- A quarter arc is the only moving part; the track stays put so the
           motion reads as rotation rather than as a pulsing ring. -->
      <path
        d="M22 12a10 10 0 0 0-10-10"
        :stroke-width="stroke"
        stroke-linecap="round"
        class="stroke-accent"
      />
    </svg>
  </span>
</template>
