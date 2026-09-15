<script setup>
import { ref, watch, nextTick } from 'vue'
import Modal from '../shared/Modal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { searchStorySemantic } from '../../services/storyVectorIndex'

/**
 * Story Lookup — ask the story a question in plain words and get the scenes
 * and entities that answer it, ranked by local embeddings (Smart Lookup
 * analog). Opened from the command palette; selecting a result emits it so
 * the shell can open the scene or entity.
 */
const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: [String, Number], default: null }
})
const emit = defineEmits(['close', 'select'])

const KIND_LABEL = {
  subsection: 'Scene',
  section: 'Chapter',
  character: 'Character',
  location: 'Location',
  thread: 'Thread'
}

const query = ref('')
const results = ref([])
const isSearching = ref(false)
const searched = ref(false)
const error = ref(null)
const input = ref(null)

async function search() {
  const q = query.value.trim()
  if (!q || !props.projectId) return
  isSearching.value = true
  error.value = null
  try {
    results.value = await searchStorySemantic(props.projectId, q, { limit: 25 })
    searched.value = true
  } catch (e) {
    error.value = e?.message || 'Search failed'
    results.value = []
  } finally {
    isSearching.value = false
  }
}

function select(m) {
  emit('select', { kind: m.kind, refId: m.refId, title: m.title })
  emit('close')
}

watch(
  () => props.show,
  async (open) => {
    if (open) {
      await nextTick()
      input.value?.focus?.()
    } else {
      query.value = ''
      results.value = []
      searched.value = false
      error.value = null
    }
  }
)
</script>

<template>
  <Modal :show="show" @close="emit('close')">
    <div class="p-5 w-[min(40rem,92vw)]" data-test="story-lookup">
      <h3 class="type-display text-[11px] text-text-primary">Ask the story</h3>
      <p class="mt-1 font-ui text-xs text-text-hint leading-5">
        Plain words — "where does Ines first doubt Halim" — matched against every scene and entity
        by meaning, locally.
      </p>
      <form class="mt-3 flex gap-2" @submit.prevent="search">
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="What are you looking for?"
          aria-label="Story lookup"
          class="flex-1 px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-text-hint"
        />
        <BaseButton
          type="submit"
          variant="primary"
          size="md"
          icon="search"
          :loading="isSearching"
          :disabled="isSearching || !query.trim()"
        >
          Find
        </BaseButton>
      </form>

      <p v-if="error" class="mt-3 font-ui text-xs text-danger">{{ error }}</p>
      <div
        v-else-if="searched && results.length === 0"
        class="mt-4 font-ui text-xs text-text-hint leading-5"
      >
        Nothing close enough. Try other words — or reindex from the Related panel if the story has
        not been embedded yet.
      </div>
      <ul
        v-else-if="results.length"
        class="mt-3 max-h-[50vh] overflow-y-auto divide-y divide-border-subtle scrollbar-thin"
        data-test="results"
      >
        <li v-for="m in results" :key="`${m.kind}:${m.refId}`">
          <button
            type="button"
            class="w-full text-left py-2.5 px-1 rounded hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            data-test="result"
            @click="select(m)"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="min-w-0 flex-1 truncate font-ui text-sm text-text-primary">{{
                m.title || m.refId
              }}</span>
              <span class="shrink-0 font-ui text-[11px] text-text-hint tabular-nums">
                {{ KIND_LABEL[m.kind] || m.kind }} · {{ Math.round(m.score * 100) }}%
              </span>
            </div>
            <p
              v-if="m.text"
              class="mt-0.5 font-ui text-xs text-text-secondary leading-5 line-clamp-2"
            >
              {{ m.text }}
            </p>
          </button>
        </li>
      </ul>
      <div v-else class="mt-4 flex items-center gap-2 font-ui text-xs text-text-hint">
        <BaseIcon name="sparkles" :size="12" />
        Results are ranked by meaning, not keywords.
      </div>
    </div>
  </Modal>
</template>
