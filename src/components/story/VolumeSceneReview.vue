<script setup>
import { ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineOptions({ name: 'VolumeSceneReview' })

defineProps({
  volumeGenerator: { type: Object, required: true }
})

const emit = defineEmits(['approve', 'reject', 'rerequest', 'cancel'])

const showReRequestInput = ref(false)
const reRequestEdits = ref('')

function handleReject() {
  emit('reject')
  showReRequestInput.value = false
  reRequestEdits.value = ''
}

function handleRerequest() {
  if (!reRequestEdits.value.trim()) return
  emit('rerequest', reRequestEdits.value)
  reRequestEdits.value = ''
  showReRequestInput.value = false
}
</script>

<template>
  <div v-if="volumeGenerator.phase.value === 'scene-review'" class="p-4 space-y-4">
    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs text-text-hint font-ui">
        <span
          >Scene Review — Scene
          {{ volumeGenerator.currentSceneResult.value?.scene?.sceneNumber || '...' }}:
          {{ volumeGenerator.currentSceneResult.value?.scene?.title || '...' }}</span
        >
      </div>
      <div
        class="rounded-lg bg-bg-tertiary border border-border-subtle max-h-64 overflow-y-auto scrollbar-thin"
      >
        <div class="p-3 text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
          {{ volumeGenerator.currentSceneResult.value?.fullProse || '...' }}
          <BaseIcon
            v-if="volumeGenerator.currentSceneResult.value?.fullProse"
            name="loader-2"
            :size="12"
            class="animate-spin inline ml-1 text-accent"
          />
        </div>
      </div>
    </div>

    <div v-if="!showReRequestInput" class="flex gap-2">
      <button
        class="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="emit('approve')"
      >
        <span class="flex items-center justify-center gap-2"
          ><BaseIcon name="check" :size="16" /> Approve</span
        >
      </button>
      <button
        class="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="handleReject"
      >
        <span class="flex items-center justify-center gap-2"
          ><BaseIcon name="x" :size="16" /> Reject</span
        >
      </button>
      <button
        class="flex-1 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-500 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="showReRequestInput = true"
      >
        <span class="flex items-center justify-center gap-2"
          ><BaseIcon name="pencil" :size="16" /> Re-request</span
        >
      </button>
    </div>

    <div v-if="showReRequestInput" class="space-y-2">
      <textarea
        v-model="reRequestEdits"
        placeholder="Describe what to change in this scene..."
        class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        rows="3"
      />
      <div class="flex gap-2">
        <button
          class="flex-1 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          :disabled="!reRequestEdits.trim()"
          @click="handleRerequest"
        >
          <span class="flex items-center justify-center gap-2"
            ><BaseIcon name="refresh" :size="16" /> Submit Revisions</span
          >
        </button>
        <button
          class="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @click="showReRequestInput = false"
        >
          Cancel
        </button>
      </div>
    </div>

    <button
      class="w-full py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
      @click="emit('cancel')"
    >
      Cancel
    </button>
  </div>
</template>
