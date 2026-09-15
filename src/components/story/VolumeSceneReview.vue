<script setup>
import { ref } from 'vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'

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
  <div v-if="volumeGenerator.phase.value === 'scene-review'">
    <BaseSection
      first
      :title="`Scene ${volumeGenerator.currentSceneResult.value?.scene?.sceneNumber || '…'}`"
      :description="volumeGenerator.currentSceneResult.value?.scene?.title || ''"
      meta="Paused for review"
    >
      <div
        class="rounded-md bg-bg-tertiary border border-border-subtle max-h-72 overflow-y-auto scrollbar-thin"
      >
        <div
          class="p-3 font-manuscript text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
        >
          {{ volumeGenerator.currentSceneResult.value?.fullProse || '…' }}
        </div>
      </div>

      <div v-if="showReRequestInput" class="mt-3 space-y-2">
        <label for="scene-redirect" class="label-micro text-text-hint block">
          What should change
        </label>
        <textarea
          id="scene-redirect"
          v-model="reRequestEdits"
          autofocus
          placeholder="e.g. Keep the market, cut the flashback, end on the mules refusing to move."
          class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-hint font-ui focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent resize-y"
          rows="3"
        />
        <div class="flex items-center justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="showReRequestInput = false"
            >Back</BaseButton
          >
          <BaseButton
            variant="primary"
            size="sm"
            icon="refresh-cw"
            :disabled="!reRequestEdits.trim()"
            @click="handleRerequest"
          >
            Rewrite scene
          </BaseButton>
        </div>
      </div>
    </BaseSection>

    <div
      v-if="!showReRequestInput"
      class="px-4 py-4 border-t border-border-subtle flex items-center gap-2"
    >
      <BaseButton variant="ghost" size="md" @click="emit('cancel')">Stop run</BaseButton>
      <span class="flex-1"></span>
      <BaseButton variant="danger" size="md" icon="x" @click="handleReject">Reject</BaseButton>
      <BaseButton variant="secondary" size="md" icon="pencil" @click="showReRequestInput = true">
        Redirect
      </BaseButton>
      <BaseButton variant="primary" size="md" icon="check" @click="emit('approve')"
        >Approve</BaseButton
      >
    </div>
  </div>
</template>
