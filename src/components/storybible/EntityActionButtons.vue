<script setup>
import BaseIcon from '../shared/BaseIcon.vue'

defineProps({
  entityId: { type: [String, Number], default: '' },
  editingId: { type: String, default: null }
})

const emit = defineEmits(['edit', 'save', 'cancel', 'delete'])
</script>

<template>
  <div class="flex items-center gap-1">
    <slot name="before" />
    <button
      v-if="editingId !== entityId"
      class="p-1 hover:bg-surface-hover rounded"
      title="Edit"
      @click="emit('edit')"
    >
      <BaseIcon name="edit-2" :size="14" class="text-text-hint" />
    </button>
    <button
      v-if="editingId === entityId"
      class="p-1 hover:bg-surface-hover rounded"
      title="Save"
      @click="emit('save')"
    >
      <BaseIcon name="check" :size="14" class="text-success" />
    </button>
    <button
      v-if="editingId === entityId"
      class="p-1 hover:bg-surface-hover rounded"
      title="Cancel"
      @click="emit('cancel')"
    >
      <BaseIcon name="x" :size="14" class="text-text-hint" />
    </button>
    <button
      v-if="editingId !== entityId"
      class="p-1 hover:bg-surface-hover rounded"
      title="Delete"
      @click="emit('delete')"
    >
      <BaseIcon name="trash-2" :size="14" class="text-danger" />
    </button>
  </div>
</template>
