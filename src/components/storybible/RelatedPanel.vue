<script setup>
import { ref, computed, watch } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryGraphStore } from '../../stores/storyGraphStore'
import { useNotifications } from '../../composables/useNotifications'
import { searchStorySemantic, indexProject, buildIndexText } from '../../services/storyVectorIndex'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseChip from '../ui/BaseChip.vue'
import BaseIcon from '../shared/BaseIcon.vue'

/**
 * Related — what in the story is semantically close to the scene you are in
 * (Smart Connections analog). Local embeddings only; one click links a hit
 * into the story graph as a `related` edge.
 */
const emit = defineEmits(['navigate'])

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const terms = computed(() => projectStore.structureTerms)
const graphStore = useStoryGraphStore()
const { addToast } = useNotifications()

const KINDS = [
  { value: 'all', label: 'Everything' },
  { value: 'subsection', label: 'Scenes' },
  { value: 'character', label: 'Characters' },
  { value: 'location', label: 'Locations' },
  { value: 'thread', label: 'Threads' }
]
const KIND_LABEL = {
  subsection: 'Scene',
  section: 'Chapter',
  character: 'Character',
  location: 'Location',
  thread: 'Thread'
}

const kind = ref('all')
const matches = ref([])
const isSearching = ref(false)
const isIndexing = ref(false)
const error = ref(null)
const linked = ref(new Set())

const anchor = computed(
  () => manuscriptStore.activeSubsection || manuscriptStore.subsections[0] || null
)

async function findRelated() {
  const scene = anchor.value
  const projectId = projectStore.currentProjectId
  if (!scene || !projectId) return
  const text = buildIndexText('subsection', scene)
  if (!text) {
    matches.value = []
    return
  }
  isSearching.value = true
  error.value = null
  try {
    matches.value = await searchStorySemantic(projectId, text, {
      limit: 8,
      kinds: kind.value === 'all' ? undefined : [kind.value],
      exclude: [{ kind: 'subsection', refId: String(scene.id) }]
    })
  } catch (e) {
    error.value = e?.message || 'Search failed'
    matches.value = []
  } finally {
    isSearching.value = false
  }
}

async function reindex() {
  const projectId = projectStore.currentProjectId
  if (!projectId) return
  isIndexing.value = true
  error.value = null
  try {
    const n = await indexProject(projectId)
    addToast(`Indexed ${n} item${n === 1 ? '' : 's'}`, 'success')
    await findRelated()
  } catch (e) {
    error.value = e?.message || 'Indexing failed'
  } finally {
    isIndexing.value = false
  }
}

async function link(m) {
  const scene = anchor.value
  const projectId = projectStore.currentProjectId
  if (!scene || !projectId) return
  await graphStore.addEdgeData(projectId, {
    sourceId: String(scene.id),
    sourceType: 'subsection',
    targetId: String(m.refId),
    targetType: m.kind,
    relationshipType: 'related',
    description: `related (${m.score.toFixed(2)})`
  })
  linked.value = new Set([...linked.value, `${m.kind}:${m.refId}`])
}

function open(m) {
  emit('navigate', { kind: m.kind, id: m.refId })
}

watch(
  () => [anchor.value?.id, kind.value],
  () => {
    linked.value = new Set()
    findRelated()
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden" data-test="related-panel">
    <BasePanelHeader
      title="Related"
      icon="link"
      :meta="anchor ? anchor.title || 'Untitled scene' : ''"
    >
      <template #actions>
        <BaseButton
          variant="soft"
          size="sm"
          icon="refresh-cw"
          :loading="isIndexing"
          :disabled="isIndexing || isSearching"
          title="Re-embed the whole story bible and manuscript"
          data-test="reindex"
          @click="reindex"
        >
          Reindex
        </BaseButton>
      </template>
    </BasePanelHeader>

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <BaseSection
        first
        title="Close to this scene"
        description="Ranked by local embeddings; nothing leaves the device."
      >
        <div class="flex flex-wrap gap-1.5">
          <BaseChip
            v-for="k in KINDS"
            :key="k.value"
            variant="filter"
            :active="kind === k.value"
            :data-test="`kind-${k.value}`"
            @click="kind = k.value"
          >
            {{ k.label }}
          </BaseChip>
        </div>
      </BaseSection>

      <div v-if="!anchor" class="px-4 py-8 text-center font-ui text-xs text-text-hint leading-5">
        Open a {{ terms.subsectionLc }} from
        <span class="text-text-secondary">{{ terms.sections }}</span> and its neighbours appear
        here.
      </div>
      <div
        v-else-if="isSearching"
        class="flex items-center gap-2 px-4 py-6 font-ui text-xs text-text-hint"
        role="status"
      >
        <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
        Comparing…
      </div>
      <p v-else-if="error" class="px-4 py-4 font-ui text-xs text-danger">{{ error }}</p>
      <div
        v-else-if="matches.length === 0"
        class="px-4 py-8 text-center font-ui text-xs text-text-hint leading-5"
      >
        Nothing indexed yet, or nothing close. Reindex to embed the story.
      </div>
      <ul v-else class="px-4 divide-y divide-border-subtle" data-test="matches">
        <li v-for="m in matches" :key="`${m.kind}:${m.refId}`" class="py-3" data-test="match">
          <div class="flex items-baseline justify-between gap-2">
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left font-ui text-sm text-text-primary hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              @click="open(m)"
            >
              {{ m.title || m.refId }}
            </button>
            <span class="shrink-0 font-ui text-[11px] text-text-hint tabular-nums">
              {{ KIND_LABEL[m.kind] || m.kind }} · {{ Math.round(m.score * 100) }}%
            </span>
          </div>
          <p v-if="m.text" class="mt-1 font-ui text-xs text-text-secondary leading-5 line-clamp-2">
            {{ m.text }}
          </p>
          <div class="mt-1.5">
            <BaseButton
              variant="ghost"
              size="sm"
              :icon="linked.has(`${m.kind}:${m.refId}`) ? 'check' : 'link'"
              :disabled="linked.has(`${m.kind}:${m.refId}`)"
              data-test="link"
              @click="link(m)"
            >
              {{ linked.has(`${m.kind}:${m.refId}`) ? 'Linked' : 'Link in graph' }}
            </BaseButton>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
