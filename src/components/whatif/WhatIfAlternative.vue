<script setup>
import BaseButton from '../ui/BaseButton.vue'

/**
 * One alternative continuation. The actions are always visible: an author
 * comparing three options should not have to hover each one to find out
 * what can be done with it.
 */
defineProps({
  alt: { type: Object, required: true },
  index: { type: Number, required: true }
})

const emit = defineEmits(['insert', 'replace'])
</script>

<template>
  <article class="py-4">
    <header class="flex items-baseline justify-between gap-3">
      <h4 class="min-w-0 flex-1 truncate font-ui text-sm font-semibold text-text-primary">
        <span class="text-text-hint tabular-nums mr-1.5">{{ index + 1 }}</span
        >{{ alt.title }}
      </h4>
      <span v-if="alt.styleNote" class="shrink-0 font-ui text-xs text-text-hint">
        {{ alt.styleNote }}
      </span>
    </header>
    <p
      class="mt-2 font-manuscript text-sm text-text-secondary leading-6 line-clamp-5 whitespace-pre-line"
    >
      {{ alt.prose }}
    </p>
    <div class="mt-2.5 flex items-center gap-2">
      <BaseButton
        variant="secondary"
        size="sm"
        icon="corner-down-left"
        @click="emit('insert', index)"
      >
        Insert
      </BaseButton>
      <BaseButton variant="ghost" size="sm" icon="replace" @click="emit('replace', index)">
        Replace scene
      </BaseButton>
    </div>
  </article>
</template>
