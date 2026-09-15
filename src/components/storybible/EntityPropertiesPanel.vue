<script setup>
import { ref, computed } from 'vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'

const props = defineProps({
  kind: { type: String, required: true }, // 'character' | 'location' | 'plotThread'
  entityId: { type: [String, Number], required: true }
})

const storyBibleStore = useStoryBibleStore()

const FIELD_TYPES = ['text', 'list', 'number', 'checkbox', 'date']

const open = ref(false)
const newTag = ref('')
const newFieldKey = ref('')
const newFieldType = ref('text')
const newFieldValue = ref('')

const entity = computed(() => storyBibleStore.findEntity(props.kind, props.entityId))
const metaEntries = computed(() => Object.entries(entity.value?.metadata || {}))
const tags = computed(() => entity.value?.tags || [])

function typeOf(value) {
  if (typeof value === 'boolean') return 'checkbox'
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'number') return 'number'
  return 'text'
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined) return ''
  return String(value)
}

function coerceValue(type, raw) {
  switch (type) {
    case 'number':
      const n = Number(raw)
      return Number.isNaN(n) ? null : n
    case 'checkbox':
      return Boolean(raw)
    case 'list':
      return String(raw)
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    default:
      return raw
  }
}

function updateField(key, type, raw) {
  storyBibleStore.setEntityMeta(props.kind, props.entityId, key, coerceValue(type, raw))
}

function addField() {
  const key = newFieldKey.value.trim()
  if (!key) return
  storyBibleStore.setEntityMeta(
    props.kind,
    props.entityId,
    key,
    coerceValue(newFieldType.value, newFieldValue.value)
  )
  newFieldKey.value = ''
  newFieldValue.value = ''
  newFieldType.value = 'text'
}

function addTag() {
  const tag = newTag.value.trim()
  if (!tag) return
  storyBibleStore.addEntityTag(props.kind, props.entityId, tag)
  newTag.value = ''
}

function removeTag(tag) {
  storyBibleStore.removeEntityTag(props.kind, props.entityId, tag)
}
</script>

<template>
  <div class="border-t border-border-subtle mt-2 pt-2">
    <button
      type="button"
      class="flex items-center gap-1 text-xs text-text-hint hover:text-accent transition-colors font-ui"
      @click="open = !open"
    >
      <span>{{ open ? '▾' : '▸' }}</span>
      <span>Properties</span>
      <span v-if="metaEntries.length" class="opacity-60">({{ metaEntries.length }})</span>
      <span v-if="tags.length" class="opacity-60">· {{ tags.length }} tag(s)</span>
    </button>

    <div v-if="open" class="mt-2 space-y-2">
      <!-- Tags -->
      <div>
        <div class="text-xs text-text-hint font-ui mb-1">Tags</div>
        <div class="flex flex-wrap gap-1">
          <span
            v-for="tag in tags"
            :key="tag"
            class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-bg-secondary text-accent rounded"
          >
            {{ tag }}
            <button
              type="button"
              class="hover:text-danger"
              title="Remove tag"
              @click="removeTag(tag)"
            >
              ×
            </button>
          </span>
        </div>
        <input
          v-model="newTag"
          type="text"
          placeholder="Add tag…"
          class="mt-1 w-full bg-bg-secondary px-2 py-1 text-xs text-text-primary rounded placeholder:text-text-hint"
          @keydown.enter.prevent="addTag"
        />
      </div>

      <!-- Existing metadata fields -->
      <div v-if="metaEntries.length">
        <div class="text-xs text-text-hint font-ui mb-1">Fields</div>
        <div v-for="[key, value] in metaEntries" :key="key" class="flex items-center gap-2 text-xs">
          <span class="w-28 truncate text-text-secondary">{{ key }}</span>
          <input
            v-if="typeOf(value) === 'checkbox'"
            type="checkbox"
            :checked="Boolean(value)"
            @change="updateField(key, 'checkbox', $event.target.checked)"
          />
          <input
            v-else
            type="text"
            :value="displayValue(value)"
            class="flex-1 bg-bg-secondary px-2 py-0.5 text-text-primary rounded placeholder:text-text-hint"
            @change="updateField(key, typeOf(value), $event.target.value)"
          />
        </div>
      </div>

      <!-- Add new field -->
      <div class="pt-1 border-t border-border-subtle/60">
        <div class="text-xs text-text-hint font-ui mb-1">Add field</div>
        <div class="flex items-center gap-1">
          <input
            v-model="newFieldKey"
            type="text"
            placeholder="name"
            class="w-24 bg-bg-secondary px-1.5 py-1 text-xs text-text-primary rounded placeholder:text-text-hint"
          />
          <select
            v-model="newFieldType"
            class="bg-bg-secondary px-1 py-1 text-xs text-text-primary rounded"
          >
            <option v-for="t in FIELD_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <input
            v-model="newFieldValue"
            type="text"
            placeholder="value"
            class="flex-1 bg-bg-secondary px-1.5 py-1 text-xs text-text-primary rounded placeholder:text-text-hint"
            @keydown.enter.prevent="addField"
          />
          <button
            type="button"
            class="px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20"
            @click="addField"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
