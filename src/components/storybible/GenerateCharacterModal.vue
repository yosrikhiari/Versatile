<script setup>
import { ref, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps({
  show: Boolean,
  mode: {
    type: String,
    default: 'generate'
  },
  existingCharacter: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'create', 'update', 'generate', 'reject'])

const isGenerating = ref(false)
const error = ref('')
const character = ref({ name: '', role: '', goal: '', voice: '', notes: '', sampleDialogue: '', traits: [] })

watch(() => props.show, (val) => {
  if (val) {
    error.value = ''
    if (props.mode === 'enhance' && props.existingCharacter) {
      character.value = { ...props.existingCharacter, traits: props.existingCharacter.traits || [], sampleDialogue: props.existingCharacter.sampleDialogue || '' }
    } else {
      character.value = { name: '', role: '', goal: '', voice: '', notes: '', sampleDialogue: '', traits: [] }
    }
  }
})

function setGenerated(data) {
  character.value = {
    name: data.name || '',
    role: data.role || '',
    goal: data.goal || '',
    voice: data.voice || '',
    notes: data.notes || '',
    sampleDialogue: data.sampleDialogue || '',
    traits: data.traits || []
  }
  isGenerating.value = false
  error.value = ''
}

function getCharacterData() {
  const fields = ['name', 'role', 'goal', 'voice', 'notes', 'sampleDialogue']
  const data = {}
  for (const key of fields) {
    const val = character.value[key]
    if (typeof val === 'string' && val.trim()) data[key] = val
  }
  if (character.value.traits?.length) data.traits = character.value.traits
  return data
}

function setLoading() {
  isGenerating.value = true
  error.value = ''
}

function setError(msg) {
  isGenerating.value = false
  error.value = msg
}

function handleCreate() {
  emit('create', { ...character.value })
}

function handleUpdate() {
  emit('update', { ...character.value })
}

function handleGenerateAgain() {
  const prev = getCharacterData()
  if (Object.keys(prev).length > 0) {
    emit('reject', prev)
  }
  emit('generate')
}

function handleClose() {
  if (isGenerating.value) return
  emit('close')
}

defineExpose({ setGenerated, setLoading, setError, getCharacterData })
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/50"
        @click.self="handleClose"
      >
        <div class="bg-bg-tertiary rounded-xl border border-border-subtle shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
          <div class="p-5 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-text-primary">
                {{ mode === 'enhance' ? 'Enhance Character' : 'Generate Character' }}
              </h2>
              <p class="text-xs text-text-hint mt-1">
                {{ mode === 'enhance' ? 'AI will fill in missing details' : 'AI creates a character from your story context' }}
              </p>
            </div>
            <button
              class="text-text-hint hover:text-text-primary disabled:opacity-50"
              :disabled="isGenerating"
              @click="handleClose"
            >
              <BaseIcon name="x" :size="20" />
            </button>
          </div>

          <div v-if="isGenerating" class="flex-1 flex items-center justify-center p-8">
            <div class="text-center">
              <BaseIcon name="loader-2" :size="32" class="mx-auto text-accent animate-spin mb-4" />
              <p class="text-text-secondary">Generating character...</p>
              <p class="text-xs text-text-hint mt-2">Using your manuscript and story elements as context</p>
            </div>
          </div>

          <div v-else-if="error" class="flex-1 flex items-center justify-center p-8">
            <div class="text-center max-w-sm">
              <BaseIcon name="alert-circle" :size="32" class="mx-auto text-danger mb-4" />
              <p class="text-danger text-sm mb-4">{{ error }}</p>
              <button
                class="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 font-ui"
                @click="$emit('generate')"
              >
                Retry
              </button>
            </div>
          </div>

          <div v-else class="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Name</label>
              <input
                v-model="character.name"
                placeholder="Character name"
                class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Role</label>
              <input
                v-model="character.role"
                placeholder="e.g. Protagonist, Antagonist, Mentor"
                class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Goal</label>
              <input
                v-model="character.goal"
                placeholder="What does this character want?"
                class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Voice</label>
              <input
                v-model="character.voice"
                placeholder="How do they speak?"
                class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Notes</label>
              <textarea
                v-model="character.notes"
                placeholder="Backstory, personality, quirks..."
                rows="3"
                class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              />
            </div>
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Sample Dialogue</label>
              <textarea
                v-model="character.sampleDialogue"
                placeholder="A single line this character would say — e.g. &quot;Get out of my sight.&quot;"
                rows="2"
                class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              />
            </div>
            <div>
              <label class="text-2xs uppercase tracking-wider text-text-hint font-ui mb-1 block">Traits</label>
              <TagInput v-model="character.traits" placeholder="Add a trait, press Enter..." />
            </div>
          </div>

          <div class="p-4 border-t border-border-subtle flex gap-3">
            <button
              :disabled="isGenerating"
              class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover disabled:opacity-50 font-ui"
              @click="handleClose"
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover disabled:opacity-50 font-ui flex items-center gap-1.5"
              :disabled="isGenerating"
              @click="handleGenerateAgain"
            >
              <BaseIcon name="sparkles" :size="14" />
              {{ mode === 'enhance' ? 'Regenerate' : 'Generate Again' }}
            </button>
            <button
              v-if="mode === 'generate'"
              :disabled="isGenerating || !character.name"
              class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-ui"
              @click="handleCreate"
            >
              Create Character
            </button>
            <button
              v-else
              :disabled="isGenerating"
              class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-ui"
              @click="handleUpdate"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
