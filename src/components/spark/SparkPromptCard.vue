<script setup>
defineProps({
  prompt: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['insert', 'regenerate'])
</script>

<template>
  <div class="rounded-lg p-4 bg-bg-tertiary border border-border-subtle">
    <p
      class="text-text-secondary text-sm leading-relaxed italic border-l-2 border-accent-muted pl-3"
    >
      {{ prompt }}
    </p>
    <div class="flex gap-2 mt-4">
      <button
        class="flex-1 py-1.5 btn-primary text-sm rounded-md font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="emit('insert', prompt)"
      >
        Insert into Flow
      </button>
      <button
        class="px-4 py-1.5 bg-bg-secondary text-text-hint text-sm rounded-md hover:text-text-secondary hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="emit('regenerate')"
      >
        ↻
      </button>
    </div>
  </div>
</template>
