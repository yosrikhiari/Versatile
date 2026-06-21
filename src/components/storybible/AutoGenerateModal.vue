<script setup>
import { ref, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean,
  prompt: {
    type: String,
    default: ''
  },
  createGroups: Boolean,
  fromScratch: Boolean,
  existingConnections: {
    type: Number,
    default: 0
  },
  existingGroups: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close', 'generate', 'update:prompt', 'update:createGroups', 'update:fromScratch'])

const localPrompt = ref(props.prompt || '')
const localCreateGroups = ref(props.createGroups || false)
const localFromScratch = ref(props.fromScratch || false)

watch(() => props.prompt, (val) => {
  localPrompt.value = val || ''
})

watch(() => props.createGroups, (val) => {
  localCreateGroups.value = val || false
})

watch(() => props.fromScratch, (val) => {
  localFromScratch.value = val || false
})

watch(localPrompt, (val) => {
  emit('update:prompt', val)
})

function handleCreateGroupsChange(val) {
  localCreateGroups.value = val
  emit('update:createGroups', val)
}

function handleFromScratchChange(val) {
  localFromScratch.value = val
  emit('update:fromScratch', val)
}

function handleGenerate() {
  emit('generate')
}

function handleOverlayClick(event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click="handleOverlayClick"
      >
        <div class="bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div class="flex items-center gap-2">
              <BaseIcon name="sparkles" :size="18" class="text-accent" />
              <h2 class="font-medium text-text-primary">Auto-generate Network</h2>
            </div>
            <button
              class="p-1 text-text-hint hover:text-text-primary rounded hover:bg-surface-hover transition-colors"
              @click="$emit('close')"
            >
              <BaseIcon name="x" :size="18" />
            </button>
          </div>

          <div class="p-5 space-y-5">
            <div class="space-y-2">
              <label
class="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg border border-border-subtle cursor-pointer hover:border-accent/50 transition-colors"
                :class="{ 'border-accent bg-accent/5': !localFromScratch }"
              >
                <input
                  type="radio"
                  :checked="!localFromScratch"
                  class="mt-0.5 w-4 h-4 text-accent focus:ring-accent"
                  @change="handleFromScratchChange(false)"
                />
                <div>
                  <p class="text-sm font-medium text-text-primary">Add to existing</p>
                  <p class="text-xs text-text-hint mt-0.5">
                    <span v-if="existingConnections > 0">{{ existingConnections }} connections, {{ existingGroups }} groups</span>
                    <span v-else>No existing connections</span>
                  </p>
                </div>
              </label>

              <label
class="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg border border-border-subtle cursor-pointer hover:border-accent/50 transition-colors"
                :class="{ 'border-accent bg-accent/5': localFromScratch }"
              >
                <input
                  type="radio"
                  :checked="localFromScratch"
                  class="mt-0.5 w-4 h-4 text-accent focus:ring-accent"
                  @change="handleFromScratchChange(true)"
                />
                <div>
                  <p class="text-sm font-medium text-text-primary">Generate from scratch</p>
                  <p class="text-xs text-text-hint mt-0.5">Clear all existing connections and regenerate</p>
                </div>
              </label>
            </div>

            <div>
              <label class="block text-sm font-medium text-text-primary mb-2">
                Focus (optional)
              </label>
              <textarea
                v-model="localPrompt"
                placeholder="E.g., 'focus on conflict', 'highlight mentor relationships'..."
                class="w-full h-20 px-3 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-sm text-text-primary placeholder-text-hint/50 resize-none focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              ></textarea>
              <p class="mt-1.5 text-xs text-text-hint">
                Guide the generator with specific themes or relationships.
              </p>
            </div>

            <div>
              <label
class="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg border border-border-subtle cursor-pointer hover:border-accent/50 transition-colors"
                :class="{ 'border-accent bg-accent/5': localCreateGroups }"
              >
                <input
                  type="checkbox"
                  :checked="localCreateGroups"
                  class="mt-0.5 w-4 h-4 text-accent focus:ring-accent rounded"
                  @change="handleCreateGroupsChange($event.target.checked)"
                />
                <div>
                  <p class="text-sm font-medium text-text-primary">Create groups</p>
                  <p class="text-xs text-text-hint mt-0.5">
                    Automatically group related characters and locations.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div class="px-5 py-4 border-t border-border-subtle flex justify-end gap-3">
            <button
              class="px-4 py-2 text-text-secondary hover:text-text-primary font-medium transition-colors"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
              @click="handleGenerate"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>