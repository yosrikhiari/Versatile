<script setup>
defineProps({
  tabs: { type: Array, required: true },
  activeTab: { type: String, required: true }
})

const emit = defineEmits(['update:activeTab'])
</script>

<template>
  <div class="flex space-x-1 p-1 bg-bg-secondary rounded-xl">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
      :class="
        activeTab === tab.id
          ? 'bg-bg-primary text-text-default shadow-sm'
          : 'text-text-hint hover:text-text-default'
      "
      @click="emit('update:activeTab', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
