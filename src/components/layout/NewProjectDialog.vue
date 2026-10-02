<script setup>
/**
 * The one way to start a project (#67, UX-AUDIT #63), from the workspace's
 * "New" and from the editor's project menu alike.
 *
 * It replaced two dialogs that disagreed. The workspace form took a name and
 * a genre. The onboarding wizard, reachable only from the editor menu, was the
 * only place to choose a project type (a screenplay says Scenes/Beats, not
 * Chapters/Scenes) or a blueprint, demanded a first character, greeted a
 * returning writer with "Welcome to Versatile", and left the URL on the
 * previous project, so a refresh reopened that one. Here the short form is
 * the workspace's; the wizard's choices are optional under "More options";
 * and creating always navigates to the new project's URL.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../shared/Modal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseField from '../ui/BaseField.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { WORKSPACE_TYPES, VISIBLE_WORKSPACE_CONFIGS } from '../../config/workspace'
import { CREATIVE_BLUEPRINTS } from '../../config/blueprints'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close', 'created'])

const router = useRouter()
const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()

const name = ref('')
const genre = ref('')
const moreOptions = ref(false)
const type = ref(WORKSPACE_TYPES.CREATIVE)
const blueprintId = ref('')
const synopsis = ref('')
const characterName = ref('')
const characterRole = ref('')
const creating = ref(false)
const error = ref('')

const typeOptions = VISIBLE_WORKSPACE_CONFIGS.map((w) => ({
  value: w.type,
  label: w.label,
  icon: w.icon
}))
const typeDescription = computed(
  () => VISIBLE_WORKSPACE_CONFIGS.find((w) => w.type === type.value)?.description || ''
)
const blueprintOptions = computed(() =>
  (CREATIVE_BLUEPRINTS[type.value] || []).map((b) => ({ value: b.id, label: b.name }))
)
const blueprintHint = computed(
  () =>
    (CREATIVE_BLUEPRINTS[type.value] || []).find((b) => b.id === blueprintId.value)?.description ||
    'Chapters and scenes to start from, or none for an empty project.'
)
const canCreate = computed(() => name.value.trim().length > 0 && !creating.value)

// A blueprint belongs to one type.
watch(type, () => {
  blueprintId.value = ''
})

watch(
  () => props.show,
  (open) => {
    if (!open) return
    name.value = ''
    genre.value = ''
    moreOptions.value = false
    type.value = WORKSPACE_TYPES.CREATIVE
    blueprintId.value = ''
    synopsis.value = ''
    characterName.value = ''
    characterRole.value = ''
    error.value = ''
  }
)

async function create() {
  if (!canCreate.value) return
  creating.value = true
  error.value = ''
  try {
    const id = await projectStore.createNewProject(
      name.value.trim(),
      type.value,
      synopsis.value.trim(),
      blueprintId.value || null,
      genre.value.trim()
    )
    if (characterName.value.trim()) {
      await storyBibleStore.addCharacterData(id, {
        name: characterName.value.trim(),
        role: characterRole.value.trim() || 'Protagonist',
        goal: '',
        voice: '',
        notes: ''
      })
    }
    emit('created', id)
    emit('close')
    // The URL is the project: the editor's view is keyed by path, so this
    // remounts it on the new project and a refresh stays there.
    await router.push(`/editor/${id}`)
  } catch (e) {
    console.error('[NewProjectDialog] create failed:', e)
    error.value = 'The project could not be created. Try again.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <Modal :show="show" max-width="max-w-lg" aria-label="New project" @close="emit('close')">
    <form class="p-6 space-y-4" data-test="new-project-dialog" @submit.prevent="create">
      <h2 class="type-display text-sm text-text-primary">New project</h2>

      <BaseField v-model="name" label="Project name" placeholder="My Novel" required />
      <BaseField v-model="genre" label="Genre" placeholder="Fantasy, Sci-Fi, …" hint="Optional" />

      <BaseButton
        variant="ghost"
        size="sm"
        :icon="moreOptions ? 'chevron-down' : 'chevron-right'"
        :aria-expanded="moreOptions"
        data-test="new-project-more"
        @click="moreOptions = !moreOptions"
      >
        More options
      </BaseButton>

      <div v-if="moreOptions" class="space-y-4" data-test="new-project-options">
        <div class="space-y-1.5">
          <BaseSegmented v-model="type" :options="typeOptions" block aria-label="Project type" />
          <p class="font-ui text-xs text-text-hint">{{ typeDescription }}</p>
        </div>
        <BaseSelect
          v-if="blueprintOptions.length"
          v-model="blueprintId"
          :options="blueprintOptions"
          label="Blueprint"
          placeholder="None, start empty"
          :hint="blueprintHint"
        />
        <BaseField
          v-model="synopsis"
          label="Synopsis"
          :rows="3"
          placeholder="The premise in a few lines"
          hint="Optional"
        />
        <div class="grid grid-cols-2 gap-3">
          <BaseField
            v-model="characterName"
            label="First character"
            placeholder="Elena"
            hint="Optional"
          />
          <BaseField v-model="characterRole" label="Role" placeholder="Protagonist" />
        </div>
      </div>

      <p v-if="error" class="font-ui text-xs text-danger" role="alert">{{ error }}</p>

      <div class="flex gap-3 pt-2">
        <BaseButton variant="outline" size="lg" custom-class="flex-1" @click="emit('close')">
          Cancel
        </BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          size="lg"
          custom-class="flex-1"
          :disabled="!canCreate"
          :loading="creating"
        >
          Create
        </BaseButton>
      </div>
    </form>
  </Modal>
</template>
