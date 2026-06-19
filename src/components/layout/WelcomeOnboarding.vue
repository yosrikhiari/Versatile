<script setup>
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import AppTooltip from '../shared/AppTooltip.vue'
import { WORKSPACE_TYPES, VISIBLE_WORKSPACE_CONFIGS } from '../../config/workspace'
import { CREATIVE_BLUEPRINTS } from '../../config/blueprints'

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()

defineProps({
  show: Boolean
})

const emit = defineEmits(['complete', 'skip'])

const currentStep = ref(1)
const projectCategory = ref(WORKSPACE_TYPES.CREATIVE)
const selectedBlueprintId = ref('')
const projectName = ref('')
const projectSynopsis = ref('')
const characterName = ref('')
const characterRole = ref('')
const isCreating = ref(false)

const availableBlueprints = computed(() => {
  return CREATIVE_BLUEPRINTS[projectCategory.value] || []
})

const canProceedStep1 = computed(() => projectName.value.trim().length > 0)
const canProceedStep2 = computed(() => characterName.value.trim().length > 0)

const currentWorkspaceConfig = computed(() => {
  return VISIBLE_WORKSPACE_CONFIGS.find(w => w.type === projectCategory.value)
})

watch(projectCategory, (newCat) => {
  selectedBlueprintId.value = ''
  const defaults = {
    [WORKSPACE_TYPES.CREATIVE]: 'My Novel',
    [WORKSPACE_TYPES.NOVEL]: 'The Last Kingdom',
    [WORKSPACE_TYPES.SCREENPLAY]: 'Untitled Script',
  }
  projectName.value = defaults[newCat] || 'My Document'
})

async function handleNextStep1() {
  if (!canProceedStep1.value) return
  currentStep.value = 2
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

function handleSkipSetup() {
  if (currentStep.value < 3) {
    emit('skip')
  }
}
</script>

<template>
  <ErrorBoundary
    fallback-title="Onboarding Error"
    fallback-description="Failed to load the onboarding flow. Try refreshing the page."
  >
  <div v-if="show" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-bg-secondary border border-border-subtle rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-in">
      <div class="p-6 sm:p-8 overflow-y-auto scrollbar-thin">
        
        <!-- ============ STEP 1: Purpose Selection ============ -->
        <div v-if="currentStep === 1" class="space-y-6">
          <div class="text-center mb-2">
            <BaseIcon name="wand-2" :size="32" class="mx-auto mb-3 text-accent" />
            <h1 class="text-2xl font-bold text-text-primary">Welcome to Versatile</h1>
            <p class="text-text-secondary text-sm mt-1.5 max-w-md mx-auto">
              What would you like to create today? Choose a document type to get started.
            </p>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <AppTooltip
              v-for="ws in VISIBLE_WORKSPACE_CONFIGS"
              :key="ws.type"
              :text="ws.description"
              position="bottom"
            >
              <button
                type="button"
                :class="[
                  'w-full flex flex-col items-start gap-1.5 px-3 py-3 rounded-xl border text-left transition-all duration-150 group',
                  projectCategory === ws.type
                    ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/30 shadow-warm-sm'
                    : 'border-border-subtle bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:border-border-subtle/80'
                ]"
                @click="projectCategory = ws.type"
              >
                <BaseIcon
                  :name="ws.icon"
                  :size="20"
                  :class="projectCategory === ws.type ? 'text-accent' : 'text-text-hint group-hover:text-text-secondary'"
                />
                <div class="text-xs font-medium leading-tight">{{ ws.label }}</div>
                <div v-if="projectCategory === ws.type" class="absolute top-2 right-2">
                  <BaseIcon name="check-circle" :size="14" class="text-accent" />
                </div>
              </button>
            </AppTooltip>
          </div>

          <div v-if="projectCategory" class="bg-bg-tertiary/80 border border-border-subtle rounded-xl p-4 space-y-3">
            <p class="text-xs text-text-hint leading-relaxed">
              {{ currentWorkspaceConfig?.description }}
            </p>
            
            <div>
              <AppTooltip text="Give your project a descriptive title. This will appear in the header and help you identify it later." position="top">
                <label for="input-project-name" class="block text-xs font-medium text-text-secondary mb-1.5">
                  Project name
                </label>
              </AppTooltip>
              <div class="flex gap-2">
                <input
                  id="input-project-name"
                  v-model="projectName"
                  type="text"
                  class="flex-1 px-3.5 py-2.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint"
                  placeholder="Name your project"
                  @keyup.enter="handleNextStep1"
                />
                <button
                  :disabled="!canProceedStep1 || isCreating"
                  class="px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  @click="handleNextStep1"
                >
                  {{ isCreating ? 'Creating...' : 'Next' }}
                </button>
              </div>
            </div>

            <details class="group">
              <summary class="text-11px text-text-hint cursor-pointer hover:text-text-secondary transition-colors select-none">
                Advanced options
              </summary>
              <div class="mt-3 space-y-3">
                <div v-if="availableBlueprints.length > 0">
                  <AppTooltip text="Choose a pre-built structure to scaffold your document. 'Blank Slate' starts from scratch." position="top">
                    <label class="block text-xs font-medium text-text-secondary mb-1.5">
                      Template / Scaffold
                    </label>
                  </AppTooltip>
                  <div class="flex flex-wrap gap-1.5">
                    <AppTooltip text="Start with a completely empty document and build your own structure from scratch." position="top">
                      <button
                        type="button"
                        :class="[
                          'px-2.5 py-1.5 rounded-lg border text-11px transition-all duration-150',
                          selectedBlueprintId === ''
                            ? 'border-accent bg-accent/10 text-accent font-medium'
                            : 'border-border-subtle bg-bg-secondary text-text-secondary hover:bg-surface-hover'
                        ]"
                        @click="selectedBlueprintId = ''"
                      >
                        Blank Slate
                      </button>
                    </AppTooltip>
                    <AppTooltip
                      v-for="blueprint in availableBlueprints"
                      :key="blueprint.id"
                      :text="blueprint.description"
                      position="top"
                    >
                      <button
                        type="button"
                        :class="[
                          'px-2.5 py-1.5 rounded-lg border text-11px transition-all duration-150',
                          selectedBlueprintId === blueprint.id
                            ? 'border-accent bg-accent/10 text-accent font-medium'
                            : 'border-border-subtle bg-bg-secondary text-text-secondary hover:bg-surface-hover'
                        ]"
                        @click="selectedBlueprintId = blueprint.id"
                      >
                        {{ blueprint.name }}
                      </button>
                    </AppTooltip>
                  </div>
                </div>

                <div>
                  <AppTooltip text="Describe the purpose, premise, or objectives of this document. This helps the AI tailor content generation to your goals." position="top">
                    <label for="input-synopsis" class="block text-xs font-medium text-text-secondary mb-1.5">
                      Synopsis / Goals <span class="text-text-hint">(optional)</span>
                    </label>
                  </AppTooltip>
                  <textarea
                    id="input-synopsis"
                    v-model="projectSynopsis"
                    rows="2"
                    class="w-full px-3.5 py-2 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint resize-none"
                    placeholder="Describe the purpose, premise, or objectives of this document..."
                  ></textarea>
                  <p class="mt-1 text-2xs text-text-hint">Helps the AI align content generation with your goals.</p>
                </div>
              </div>
            </details>
          </div>

          <div class="flex justify-center pt-1">
            <AppTooltip text="Dismiss the onboarding and explore the interface on your own. You can create a project later from the header menu." position="top">
              <button
                class="text-xs text-text-hint hover:text-text-secondary transition-colors"
                @click="handleSkipSetup"
              >
                Skip — I'll figure it out later
              </button>
            </AppTooltip>
          </div>
        </div>

        <!-- ============ STEP 2: Character Setup (Narrative only) ============ -->
        <div v-if="currentStep === 2" class="space-y-6">
          <div class="text-center">
            <BaseIcon name="users" :size="28" class="mx-auto mb-3 text-accent" />
            <h2 class="text-xl font-semibold text-text-primary">Add your first character</h2>
            <p class="text-sm text-text-secondary mt-1">Kick off your story bible with a key figure.</p>
          </div>
          <div class="space-y-4 max-w-sm mx-auto">
            <div>
              <AppTooltip text="The name of your main character or protagonist. This adds them to your project's story bible." position="top">
                <label for="input-character-name" class="block text-sm font-medium text-text-secondary mb-2">
                  Character name
                </label>
              </AppTooltip>
              <input
                id="input-character-name"
                v-model="characterName"
                type="text"
                class="w-full px-4 py-3 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint"
                placeholder="Elena"
                autofocus
                @keyup.enter="handleNextStep2"
              />
            </div>
            <div>
              <AppTooltip text="The character's archetype or function in the story — Protagonist, Antagonist, Mentor, etc." position="top">
                <label for="input-character-role" class="block text-sm font-medium text-text-secondary mb-2">
                  Role <span class="text-text-hint font-normal">(optional)</span>
                </label>
              </AppTooltip>
              <input
                id="input-character-role"
                v-model="characterRole"
                type="text"
                class="w-full px-4 py-3 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-text-hint"
                placeholder="Protagonist"
              />
            </div>
          </div>
          <div class="flex gap-3 max-w-sm mx-auto">
            <button
              class="flex-1 py-3 text-text-secondary hover:text-text-primary transition-colors text-sm"
              @click="currentStep = 1"
            >
              Back
            </button>
            <button
              :disabled="!canProceedStep2 || isCreating"
              class="flex-1 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleNextStep2"
            >
              {{ isCreating ? 'Creating...' : 'Create & Continue' }}
            </button>
          </div>
        </div>

        <!-- ============ STEP 3: Done ============ -->
        <div v-if="currentStep === 3" class="space-y-6 text-center py-4">
          <BaseIcon name="sparkles" :size="40" class="mx-auto text-accent" />
          <div>
            <h2 class="text-xl font-bold text-text-primary">You're all set!</h2>
            <p class="text-sm text-text-secondary mt-1.5">Your workspace is ready to go.</p>
          </div>
          <div class="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            <div class="p-4 bg-bg-tertiary rounded-xl text-center">
              <BaseIcon name="pen-tool" :size="24" class="mx-auto mb-2 text-accent" />
              <div class="text-sm font-medium text-text-primary">Write</div>
              <div class="text-2xs text-text-hint mt-0.5">Flow editor</div>
            </div>
            <div class="p-4 bg-bg-tertiary rounded-xl text-center">
              <BaseIcon name="search" :size="24" class="mx-auto mb-2 text-accent" />
              <div class="text-sm font-medium text-text-primary">Polish</div>
              <div class="text-2xs text-text-hint mt-0.5">Refine & edit</div>
            </div>
            <div class="p-4 bg-bg-tertiary rounded-xl text-center">
              <BaseIcon name="book-open" :size="24" class="mx-auto mb-2 text-accent" />
              <div class="text-sm font-medium text-text-primary">Build</div>
              <div class="text-2xs text-text-hint mt-0.5">{{ projectStore.terminology?.bible || 'Reference' }}</div>
            </div>
          </div>
          <button
            class="w-full max-w-xs mx-auto py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors"
            @click="handleComplete"
          >
            Start Writing
          </button>
        </div>
      </div>
    </div>
  </div>
  </ErrorBoundary>
</template>
