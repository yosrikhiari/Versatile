<script setup>
import { computed } from 'vue'

/**
 * Status marker: a small glyph plus its label.
 *
 * The glyph carries the stage in its **shape** as well as its colour — an empty
 * ring for not-started, a half-filled disc for in-progress, a check for done.
 * Hue alone would leave the whole status system unreadable to a red-green
 * colour-blind writer, and unreadable to anyone at a glance on the amber/sage
 * pair, which sit at similar lightness.
 *
 * The label is not optional decoration either: `label` should be supplied
 * wherever there is room, and the glyph always carries a title for when there
 * isn't.
 */
const props = defineProps({
  /** Any CSS colour — the status configs supply `var(--vers-…)` tokens. */
  color: { type: String, default: 'var(--vers-text-muted)' },
  label: { type: String, default: '' },
  shape: {
    type: String,
    default: 'solid',
    validator: (v) => ['dashed', 'ring', 'half', 'target', 'check', 'solid'].includes(v)
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v)
  },
  /** Wraps the pair in a neutral well, for use against a busy row. */
  pill: Boolean
})

const px = computed(() => (props.size === 'sm' ? 11 : 13))

/** Accessible name when the label is not rendered beside the glyph. */
const glyphTitle = computed(() => props.label || undefined)
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 font-ui text-xs',
      pill && 'rounded-full bg-surface-hover px-2 py-0.5'
    ]"
  >
    <svg
      :width="px"
      :height="px"
      viewBox="0 0 12 12"
      fill="none"
      class="shrink-0"
      :role="label ? 'presentation' : 'img'"
      :aria-hidden="label ? 'true' : undefined"
      :aria-label="label ? undefined : glyphTitle"
    >
      <!-- Not started: an outline that reads as deliberately empty. -->
      <circle
        v-if="shape === 'dashed'"
        cx="6"
        cy="6"
        r="4.5"
        :stroke="color"
        stroke-width="1.5"
        stroke-dasharray="2.2 1.8"
      />

      <!-- Queued: closed but hollow. -->
      <circle
        v-else-if="shape === 'ring'"
        cx="6"
        cy="6"
        r="4.5"
        :stroke="color"
        stroke-width="1.5"
      />

      <!-- In progress: half the disc filled. -->
      <template v-else-if="shape === 'half'">
        <circle cx="6" cy="6" r="4.5" :stroke="color" stroke-width="1.5" />
        <path d="M6 1.5A4.5 4.5 0 0 1 6 10.5Z" :fill="color" />
      </template>

      <!-- Under review: attention is on the centre. -->
      <template v-else-if="shape === 'target'">
        <circle cx="6" cy="6" r="4.5" :stroke="color" stroke-width="1.5" />
        <circle cx="6" cy="6" r="1.9" :fill="color" />
      </template>

      <!-- Done: filled, with the tick cut out of it. -->
      <template v-else-if="shape === 'check'">
        <circle cx="6" cy="6" r="5" :fill="color" />
        <path
          d="M3.6 6.2 5.2 7.8 8.4 4.4"
          stroke="var(--vers-bg-base)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </template>

      <circle v-else cx="6" cy="6" r="4" :fill="color" />
    </svg>

    <span v-if="label" class="truncate text-text-secondary">{{ label }}</span>
    <slot />
  </span>
</template>
