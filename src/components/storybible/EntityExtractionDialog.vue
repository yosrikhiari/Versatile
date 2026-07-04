<script setup>
import { ref, computed, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean,
  extractedEntities: {
    type: Object,
    default: () => ({ characters: [], locations: [] })
  }
})

const emit = defineEmits(['close', 'createEntities'])

const selectedCharacters = ref([])
const selectedLocations = ref([])

watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      selectedCharacters.value = []
      selectedLocations.value = []
    }
  }
)

const newCharacterCount = computed(() => selectedCharacters.value.filter((c) => c.isNew).length)

const newLocationCount = computed(() => selectedLocations.value.filter((l) => l.isNew).length)

const totalNew = computed(() => newCharacterCount.value + newLocationCount.value)

function toggleCharacter(char) {
  const idx = selectedCharacters.value.findIndex((c) => c.name === char.name)
  if (idx > -1) {
    selectedCharacters.value.splice(idx, 1)
  } else {
    selectedCharacters.value.push(char)
  }
}

function toggleLocation(loc) {
  const idx = selectedLocations.value.findIndex((l) => l.name === loc.name)
  if (idx > -1) {
    selectedLocations.value.splice(idx, 1)
  } else {
    selectedLocations.value.push(loc)
  }
}

function isCharacterSelected(char) {
  return selectedCharacters.value.some((c) => c.name === char.name)
}

function isLocationSelected(loc) {
  return selectedLocations.value.some((l) => l.name === loc.name)
}

function handleCreate() {
  const charactersToCreate = selectedCharacters.value
    .filter((c) => c.isNew)
    .map((c) => ({ name: c.name }))

  const locationsToCreate = selectedLocations.value
    .filter((l) => l.isNew)
    .map((l) => ({ name: l.name }))

  emit('createEntities', {
    characters: charactersToCreate,
    locations: locationsToCreate
  })
}

function selectAllNew() {
  selectedCharacters.value = props.extractedEntities.characters.filter((c) => c.isNew)
  selectedLocations.value = props.extractedEntities.locations.filter((l) => l.isNew)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        @click.self="$emit('close')"
      >
        <div
          class="bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div class="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div class="flex items-center gap-2">
              <BaseIcon name="scan" :size="18" class="text-accent" />
              <h2 class="font-medium text-text-primary">Extracted Entities</h2>
            </div>
            <button
              class="p-1 text-text-hint hover:text-text-primary rounded hover:bg-surface-hover transition-colors"
              @click="$emit('close')"
            >
              <BaseIcon name="x" :size="18" />
            </button>
          </div>

          <div class="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
            <div
              v-if="
                extractedEntities.characters.length === 0 &&
                extractedEntities.locations.length === 0
              "
              class="text-center py-8 text-text-hint"
            >
              <BaseIcon name="search-x" :size="32" class="mx-auto mb-2 opacity-50" />
              <p>No potential entities found in the text.</p>
              <p class="text-sm mt-1">
                Try adding character or location names in your plot thread notes.
              </p>
            </div>

            <div v-if="extractedEntities.characters.length > 0">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <BaseIcon name="user" :size="16" class="text-text-secondary" />
                  <h3 class="text-sm font-medium text-text-primary">Characters</h3>
                  <span
                    v-if="newCharacterCount > 0"
                    class="text-xs px-1.5 py-0.5 bg-accent/20 text-accent rounded"
                  >
                    {{ newCharacterCount }} new
                  </span>
                </div>
              </div>
              <div class="space-y-2">
                <button
                  v-for="char in extractedEntities.characters"
                  :key="'char-' + char.name"
                  class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left"
                  :class="
                    isCharacterSelected(char)
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-bg-tertiary border-border-subtle hover:border-accent/30'
                  "
                  @click="toggleCharacter(char)"
                >
                  <div
                    class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
                    :class="
                      isCharacterSelected(char) ? 'bg-accent border-accent' : 'border-border-subtle'
                    "
                  >
                    <BaseIcon
                      v-if="isCharacterSelected(char)"
                      name="check"
                      :size="12"
                      class="text-white"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-text-primary truncate">{{ char.name }}</span>
                      <span
                        v-if="char.isNew"
                        class="text-xs px-1.5 py-0.5 bg-accent/20 text-accent rounded flex-shrink-0"
                      >
                        New
                      </span>
                      <span v-else class="text-xs text-text-hint flex-shrink-0"> Existing </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div v-if="extractedEntities.locations.length > 0">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <BaseIcon name="map-pin" :size="16" class="text-text-secondary" />
                  <h3 class="text-sm font-medium text-text-primary">Locations</h3>
                  <span
                    v-if="newLocationCount > 0"
                    class="text-xs px-1.5 py-0.5 bg-accent/20 text-accent rounded"
                  >
                    {{ newLocationCount }} new
                  </span>
                </div>
              </div>
              <div class="space-y-2">
                <button
                  v-for="loc in extractedEntities.locations"
                  :key="'loc-' + loc.name"
                  class="w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left"
                  :class="
                    isLocationSelected(loc)
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-bg-tertiary border-border-subtle hover:border-accent/30'
                  "
                  @click="toggleLocation(loc)"
                >
                  <div
                    class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
                    :class="
                      isLocationSelected(loc) ? 'bg-accent border-accent' : 'border-border-subtle'
                    "
                  >
                    <BaseIcon
                      v-if="isLocationSelected(loc)"
                      name="check"
                      :size="12"
                      class="text-white"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-text-primary truncate">{{ loc.name }}</span>
                      <span
                        v-if="loc.isNew"
                        class="text-xs px-1.5 py-0.5 bg-accent/20 text-accent rounded flex-shrink-0"
                      >
                        New
                      </span>
                      <span v-else class="text-xs text-text-hint flex-shrink-0"> Existing </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div
            class="px-5 py-4 border-t border-border-subtle flex items-center justify-between gap-3"
          >
            <button
              v-if="totalNew > 0"
              class="text-sm text-text-secondary hover:text-text-primary transition-colors"
              @click="selectAllNew"
            >
              Select all new ({{ totalNew }})
            </button>
            <div v-else></div>

            <div class="flex items-center gap-3">
              <button
                class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                @click="$emit('close')"
              >
                Cancel
              </button>
              <button
                :disabled="totalNew === 0"
                class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                :class="
                  totalNew > 0
                    ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                    : 'bg-bg-tertiary text-text-hint cursor-not-allowed'
                "
                @click="handleCreate"
              >
                Create {{ totalNew > 0 ? `${totalNew} New` : '' }}
                {{ totalNew === 1 ? 'Entity' : 'Entities' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
