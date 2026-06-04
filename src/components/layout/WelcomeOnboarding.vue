<script setup>
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import BaseIcon from '../shared/BaseIcon.vue'
import { WORKSPACE_LABELS, WORKSPACE_TYPES } from '../../config/workspace'
import { BLUEPRINTS } from '../../config/blueprints'

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['complete', 'skip'])

const currentStep = ref(1)
const projectCategory = ref(WORKSPACE_TYPES.CREATIVE)
const selectedBlueprintId = ref('')
const projectName = ref('My Novel')
const projectGenre = ref('')
const projectSynopsis = ref('')
const characterName = ref('')
const characterRole = ref('')
const isCreating = ref(false)

const availableBlueprints = computed(() => {
  return BLUEPRINTS[projectCategory.value] || []
})

const canProceedStep1 = computed(() => projectName.value.trim().length > 0)
const canProceedStep2 = computed(() => characterName.value.trim().length > 0)

watch(projectCategory, (newCat) => {
  selectedBlueprintId.value = ''
  if (newCat === WORKSPACE_TYPES.CREATIVE) {
    projectName.value = 'My Novel'
  } else if (newCat === WORKSPACE_TYPES.LEGAL) {
    projectName.value = 'Service Agreement NDA'
  } else if (newCat === WORKSPACE_TYPES.TECHNICAL) {
    projectName.value = 'System Architecture Specification'
  } else if (newCat === WORKSPACE_TYPES.BUSINESS) {
    projectName.value = 'Q3 Market Expansion Plan'
  } else if (newCat === WORKSPACE_TYPES.RESEARCH) {
    projectName.value = 'Theoretical Physics Analysis'
  }
})

async function handleNextStep1() {
  if (!canProceedStep1.value) return
  if (projectCategory.value === WORKSPACE_TYPES.CREATIVE) {
    currentStep.value = 2
  } else {
    await createProjectDirectly()
  }
}

async function createProjectDirectly() {
  isCreating.value = true
  try {
    await projectStore.createNewProject(
      projectName.value.trim(),
      projectCategory.value,
      projectSynopsis.value.trim(),
      selectedBlueprintId.value
    )
    currentStep.value = 3
  } catch (e) {
    console.error('Failed to create project:', e)
  } finally {
    isCreating.value = false
  }
}

async function handleNextStep2() {
  isCreating.value = true
  
  try {
    const projectId = await projectStore.createNewProject(
      projectName.value.trim(),
      projectCategory.value,
      projectSynopsis.value.trim(),
      selectedBlueprintId.value
    )
    
    if (characterName.value.trim()) {
      await storyBibleStore.addCharacterData(projectId, {
        name: characterName.value.trim(),
        role: characterRole.value.trim() || 'Protagonist',
        goal: '',
        voice: '',
        notes: ''
      })
    }
    
    currentStep.value = 3
  } catch (e) {
    console.error('Failed to create project:', e)
  } finally {
    isCreating.value = false
  }
}

function handleComplete() {
  emit('complete')
}

function handleSkip() {
  emit('skip')
}

function handleSkipSetup() {
  if (currentStep.value < 3) {
    emit('skip')
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-bg-secondary border border-border-subtle rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
      <div class="p-8 overflow-y-auto scrollbar-thin">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-accent">Welcome to Versatile</h1>
            <p class="text-text-secondary text-sm mt-1">Let's get you set up</p>
          </div>
          <div class="flex items-center gap-2 text-xs text-text-hint">
            <span :class="{ 'text-accent font-medium': currentStep === 1 }">1</span>
            <span>-</span>
            <span v-if="projectCategory === WORKSPACE_TYPES.CREATIVE" :class="{ 'text-accent font-medium': currentStep === 2 }">2</span>
            <span v-if="projectCategory === WORKSPACE_TYPES.CREATIVE">-</span>
            <span :class="{ 'text-accent font-medium': currentStep === 3 }">3</span>
          </div>
        </div>

        <div v-if="currentStep === 1" class="space-y-6">
          <div>
            <h2 class="text-lg font-medium text-text-primary mb-4">Tell us about your project</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  What kind of document are you generating?
                </label>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    v-for="(label, key) in WORKSPACE_LABELS"
                    :key="key"
                    type="button"
                    :class="[
                      'px-3 py-2.5 rounded-lg border text-left text-xs transition-all duration-150',
                      projectCategory === key
                        ? 'border-accent bg-accent/10 text-accent font-semibold shadow-warm-sm'
                        : 'border-border-subtle bg-bg-tertiary text-text-secondary hover:bg-surface-hover'
                    ]"
                    @click="projectCategory = key"
                  >
                    {{ label }}
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  What's your project called?
                </label>
                <input
                  v-model="projectName"
                  type="text"
                  class="w-full px-4 py-3 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint"
                  placeholder="My project"
                  autofocus
                  @keyup.enter="handleNextStep1"
                />
              </div>

              <div v-if="availableBlueprints.length > 0">
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Start with a structural scaffold?
                </label>
                <div class="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    :class="[
                      'px-4 py-3 rounded-lg border text-left text-xs transition-all duration-150 flex items-center justify-between',
                      selectedBlueprintId === ''
                        ? 'border-accent bg-accent/10 text-accent font-semibold'
                        : 'border-border-subtle bg-bg-tertiary text-text-secondary hover:bg-surface-hover'
                    ]"
                    @click="selectedBlueprintId = ''"
                  >
                    <div>
                      <div class="font-medium text-sm text-text-primary">Blank Slate</div>
                      <div class="text-text-hint text-[10px] mt-0.5 font-normal">Start with a completely empty document.</div>
                    </div>
                    <BaseIcon v-if="selectedBlueprintId === ''" name="check" :size="16" />
                  </button>

                  <button
                    v-for="blueprint in availableBlueprints"
                    :key="blueprint.id"
                    type="button"
                    :class="[
                      'px-4 py-3 rounded-lg border text-left text-xs transition-all duration-150 flex items-center justify-between',
                      selectedBlueprintId === blueprint.id
                        ? 'border-accent bg-accent/10 text-accent font-semibold'
                        : 'border-border-subtle bg-bg-tertiary text-text-secondary hover:bg-surface-hover'
                    ]"
                    @click="selectedBlueprintId = blueprint.id"
                  >
                    <div>
                      <div class="font-medium text-sm text-text-primary">{{ blueprint.name }}</div>
                      <div class="text-text-hint text-[10px] mt-0.5 font-normal">{{ blueprint.description }}</div>
                    </div>
                    <BaseIcon v-if="selectedBlueprintId === blueprint.id" name="check" :size="16" />
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Synopsis / Core Goals (optional)
                </label>
                <textarea
                  v-model="projectSynopsis"
                  rows="3"
                  class="w-full px-4 py-3 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint resize-none"
                  placeholder="Define the primary objectives or premises for the document..."
                ></textarea>
                <p class="mt-1.5 text-xs text-text-hint">This helps the AI model align content generation perfectly.</p>
              </div>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button
              class="flex-1 py-3 text-text-secondary hover:text-text-primary transition-colors text-sm"
              @click="handleSkipSetup"
            >
              Skip setup
            </button>
            <button
              :disabled="!canProceedStep1 || isCreating"
              class="flex-1 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleNextStep1"
            >
              {{ isCreating ? 'Creating...' : 'Next' }}
            </button>
          </div>
        </div>

        <div v-if="currentStep === 2" class="space-y-6">
          <div>
            <h2 class="text-lg font-medium text-text-primary mb-4">Add your first character</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Character name
                </label>
                <input
                  v-model="characterName"
                  type="text"
                  class="w-full px-4 py-3 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint"
                  placeholder="Elena"
                  autofocus
                  @keyup.enter="handleNextStep2"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-secondary mb-2">
                  Role (optional)
                </label>
                <input
                  v-model="characterRole"
                  type="text"
                  class="w-full px-4 py-3 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint"
                  placeholder="Protagonist"
                />
              </div>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              class="flex-1 py-3 text-text-secondary hover:text-text-primary transition-colors text-sm"
              @click="handleSkipSetup"
            >
              Skip setup
            </button>
            <button
              :disabled="!canProceedStep2 || isCreating"
              class="flex-1 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleNextStep2"
            >
              {{ isCreating ? 'Creating...' : 'Next' }}
            </button>
          </div>
        </div>

        <div v-if="currentStep === 3" class="space-y-6">
          <div>
            <h2 class="text-lg font-medium text-text-primary mb-4">You're all set!</h2>
            <div class="grid grid-cols-3 gap-3">
              <div class="p-4 bg-bg-tertiary rounded-lg text-center">
                <BaseIcon name="pen-tool" :size="24" class="mx-auto mb-2 text-accent" />
                <div class="text-sm font-medium text-text-primary">Write</div>
                <div class="text-xs text-text-hint mt-1">Flow mode</div>
              </div>
              <div class="p-4 bg-bg-tertiary rounded-lg text-center">
                <BaseIcon name="search" :size="24" class="mx-auto mb-2 text-accent" />
                <div class="text-sm font-medium text-text-primary">Analyze</div>
                <div class="text-xs text-text-hint mt-1">Polish mode</div>
              </div>
              <div class="p-4 bg-bg-tertiary rounded-lg text-center">
                <BaseIcon name="book-open" :size="24" class="mx-auto mb-2 text-accent" />
                <div class="text-sm font-medium text-text-primary">Build</div>
                <div class="text-xs text-text-hint mt-1">
                  {{ projectStore.terminology?.bible || 'Story Bible' }}
                </div>
              </div>
            </div>
            <p class="text-sm text-text-hint mt-4 text-center">
              This is your core writing loop: Write, Analyze, Build.
            </p>
          </div>
          <button
            class="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
            @click="handleComplete"
          >
            Start Writing
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
