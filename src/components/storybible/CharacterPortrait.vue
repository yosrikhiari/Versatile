<script setup>
import { ref, onMounted } from 'vue'
import { generatePortrait } from '../../services/portraitService'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  character: {
    type: Object,
    required: true
  },
  projectId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['updated'])

const portrait = ref(props.character?.portrait || '')
const isGenerating = ref(false)
const error = ref('')

onMounted(() => {
  portrait.value = props.character?.portrait || ''
})

async function generate() {
  if (isGenerating.value) return

  isGenerating.value = true
  error.value = ''

  try {
    const result = await generatePortrait(props.character, props.projectId)
    if (result.success) {
      portrait.value = result.dataUrl
      emit('updated')
    } else {
      error.value = result.error || 'Generation failed'
    }
  } catch (err) {
    error.value = err.message
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="portrait-container flex flex-col items-center gap-2">
    <div class="portrait-image w-24 h-24 rounded-lg overflow-hidden bg-bg-secondary flex items-center justify-center">
      <img
        v-if="portrait"
        :src="portrait"
        :alt="character.name"
        class="w-full h-full object-cover"
      />
      <BaseIcon v-else name="user" :size="32" class="text-text-hint" />
    </div>
    <button
      @click="generate"
      :disabled="isGenerating"
      class="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <span v-if="isGenerating" class="flex items-center gap-1">
        <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Generating...
      </span>
      <span v-else-if="portrait">Regenerate</span>
      <span v-else>Generate Portrait</span>
    </button>
    <div v-if="error" class="text-xs text-red-400 mt-1">
      {{ error }}
    </div>
  </div>
</template>
