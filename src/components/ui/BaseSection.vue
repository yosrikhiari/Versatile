<script setup>
/**
 * One job, one block. A panel is a stack of these, separated by hairlines.
 *
 * Every tool panel used to invent its own grouping: an uppercase eyebrow here,
 * a semibold row there, a card with a border somewhere else, and five label
 * styles on one screen. This is the single shape they all use now:
 *
 *   title             [actions]
 *   one-line description
 *   content
 *
 * The title is sentence case at body size — a heading, not a label. Eyebrow
 * labels (`.label-micro`) are for fields *inside* the content, never for the
 * section itself.
 */
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  /** Small trailing text on the heading row (a count, a status). */
  meta: { type: String, default: '' },
  /** Drop the top hairline — for the first section in a panel. */
  first: Boolean,
  /** Tighter vertical padding for secondary sections. */
  dense: Boolean
})
</script>

<template>
  <section :class="['px-4', dense ? 'py-4' : 'py-5', first ? '' : 'border-t border-border-subtle']">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="font-ui text-sm font-semibold text-text-primary leading-5">
          {{ title }}
        </h3>
        <p
          v-if="description"
          class="mt-0.5 font-ui text-xs leading-4 text-text-hint max-w-[44ch] text-pretty"
        >
          {{ description }}
        </p>
      </div>
      <div v-if="meta || $slots.actions" class="flex shrink-0 items-center gap-2">
        <span v-if="meta" class="font-ui text-xs tabular-nums text-text-hint">{{ meta }}</span>
        <slot name="actions" />
      </div>
    </header>
    <div :class="['mt-3', $slots.default ? '' : 'hidden']">
      <slot />
    </div>
  </section>
</template>
