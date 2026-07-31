<script setup>
import BaseIcon from '../shared/BaseIcon.vue'

/**
 * The header every tool panel shares: identity on the left, actions on the
 * right, one hairline below.
 *
 * Panels had each grown their own — `p-3` here, `px-4 py-3` there, `font-medium`
 * in one and `font-semibold` in the next — so opening two panels side by side
 * showed two different products. The padding and type live here now.
 */
defineProps({
  title: { type: String, required: true },
  /** Lucide icon name shown before the title. */
  icon: String,
  /** Short right-aligned metric — "12 lines", "3 findings". */
  meta: String,
  /** Shows a chevron that reports and toggles `collapsed`. */
  collapsible: Boolean,
  collapsed: Boolean,
  /** Shows a close control on the far right. */
  closable: Boolean
})

defineEmits(['toggle-collapse', 'close'])
</script>

<template>
  <header class="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
    <button
      v-if="collapsible"
      type="button"
      class="-ml-1 shrink-0 rounded p-1 text-text-hint transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary"
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? `Expand ${title}` : `Collapse ${title}`"
      @click="$emit('toggle-collapse')"
    >
      <BaseIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="14" />
    </button>

    <BaseIcon v-if="icon" :name="icon" :size="14" class="shrink-0 text-text-hint" />

    <h2 class="min-w-0 flex-1 truncate font-ui text-sm font-semibold text-text-primary">
      {{ title }}
    </h2>

    <span v-if="meta" class="shrink-0 font-ui text-xs tabular-nums text-text-hint">
      {{ meta }}
    </span>

    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1">
      <slot name="actions" />
    </div>

    <button
      v-if="closable"
      type="button"
      class="-mr-1 shrink-0 rounded p-1 text-text-hint transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary"
      :aria-label="`Close ${title}`"
      @click="$emit('close')"
    >
      <BaseIcon name="x" :size="14" />
    </button>
  </header>
</template>
