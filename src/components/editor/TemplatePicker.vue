<script setup>
import { ref, computed, watch, inject } from 'vue'
import Modal from '../shared/Modal.vue'
import BaseButton from '../ui/BaseButton.vue'
import { useTemplatesStore, renderTemplate } from '../../stores/useTemplatesStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'

/**
 * Insert a template at the cursor and set the scene's POV / setting / cast
 * from the same answers (Templater analog). One modal: pick, fill, preview,
 * insert.
 */
const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'inserted'])

const templates = useTemplatesStore()
const manuscriptStore = useManuscriptStore()
const bibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const insertAtCursor = inject('insertAtCursor', null)

const selectedId = ref(templates.lastUsedId || 'scene')
const values = ref({})

const selected = computed(() => templates.byId(selectedId.value) || templates.templates[0])
const preview = computed(() =>
  selected.value ? renderTemplate(selected.value.body, values.value) : ''
)
const activeScene = computed(() => manuscriptStore.activeSubsection)

function fieldLabel(f) {
  return renderTemplate(f.label, values.value).replace(/\s+—\s*$/, '') || f.label
}

function seedFromScene() {
  const s = activeScene.value
  const v = {}
  if (s?.pov) v.pov = s.pov
  if (s?.location) v.setting = s.location
  if (Array.isArray(s?.charactersPresent) && s.charactersPresent.length)
    v.cast = s.charactersPresent.join(', ')
  values.value = v
}

watch(
  () => props.show,
  (open) => {
    if (open) seedFromScene()
  },
  { immediate: true }
)
watch(selectedId, () => seedFromScene())

async function insert() {
  const filled = templates.fill(selectedId.value, values.value)
  if (!filled) return
  insertAtCursor?.(filled.text)
  const scene = activeScene.value
  if (scene && Object.keys(filled.metadata).length) {
    await manuscriptStore.updateSubsectionData(
      scene.id,
      filled.metadata,
      projectStore.currentProjectId
    )
  }
  emit('inserted', { templateId: selectedId.value, metadata: filled.metadata })
  emit('close')
}
</script>

<template>
  <Modal :show="show" @close="emit('close')">
    <div class="p-5 w-[min(40rem,92vw)]" data-test="template-picker">
      <h3 class="font-ui text-sm font-semibold text-text-primary">Insert a template</h3>
      <p class="mt-1 font-ui text-xs text-text-hint leading-5">
        Fill the fields, insert at the cursor. POV, setting and cast are written to the scene as
        well.
      </p>

      <div class="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Templates">
        <button
          v-for="t in templates.templates"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="selectedId === t.id ? 'true' : 'false'"
          :data-test="`template-${t.id}`"
          class="px-2.5 py-1 rounded-md font-ui text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          :class="
            selectedId === t.id
              ? 'bg-bg-elevated text-text-primary'
              : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          "
          @click="selectedId = t.id"
        >
          {{ t.title }}
        </button>
      </div>
      <p v-if="selected" class="mt-2 font-ui text-xs text-text-secondary leading-5">
        {{ selected.description }}
      </p>

      <div v-if="selected" class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label v-for="f in selected.fields" :key="f.key" class="block">
          <span class="block font-ui text-xs text-text-hint mb-1">{{ fieldLabel(f) }}</span>
          <input
            v-model="values[f.key]"
            type="text"
            :placeholder="f.placeholder || ''"
            :list="
              f.metadata === 'pov'
                ? 'template-picker-characters'
                : f.metadata === 'location'
                  ? 'template-picker-locations'
                  : undefined
            "
            :data-test="`field-${f.key}`"
            class="w-full px-3 py-1.5 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-text-hint"
          />
        </label>
      </div>
      <datalist id="template-picker-characters">
        <option v-for="c in bibleStore.characters" :key="c.id" :value="c.name" />
      </datalist>
      <datalist id="template-picker-locations">
        <option v-for="l in bibleStore.locations" :key="l.id" :value="l.name" />
      </datalist>

      <div class="mt-4">
        <span class="label-micro text-text-hint">Preview</span>
        <pre
          class="mt-1 max-h-40 overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 font-manuscript text-xs text-text-secondary whitespace-pre-wrap leading-5"
          data-test="template-preview"
          >{{ preview }}</pre
        >
      </div>

      <p v-if="!activeScene" class="mt-3 font-ui text-xs text-text-hint">
        No scene is open, so the text is inserted but POV / setting are not saved anywhere.
      </p>

      <div class="mt-4 flex justify-end gap-2">
        <BaseButton variant="ghost" size="sm" @click="emit('close')">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          icon="corner-down-left"
          data-test="insert-template"
          @click="insert"
        >
          Insert
        </BaseButton>
      </div>
    </div>
  </Modal>
</template>
