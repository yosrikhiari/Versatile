<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useStoryGraphStore } from '../../stores/storyGraphStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { getProjectChapterDigests, getEntityStateTimeline } from '../../services/db-digests'
import { buildStoryTimeline, isChapterEmpty } from '../../services/generation/storyTimeline'
import { countWords } from '../../utils/textUtils'
import draggable from 'vuedraggable'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseStatusDot from '../ui/BaseStatusDot.vue'
import EmptyState from '../shared/EmptyState.vue'
import { threadStatusMeta } from '../../config/statuses'

const storyBibleStore = useStoryBibleStore()
const storyGraphStore = useStoryGraphStore()
const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()

const emit = defineEmits(['open-scene'])

const dragOptions = {
  animation: 200,
  ghostClass: 'ghost',
  dragClass: 'drag',
  axis: 'x'
}

// Shared config rather than local maps: these used the canonical `in_progress`
// while the board wrote `inprogress`, so a thread moved on the board rendered
// here with no colour and its raw value as the label.

const sortedThreads = computed(() => {
  return [...storyBibleStore.plotThreads].sort(
    (a, b) => (a.timelineOrder ?? 999) - (b.timelineOrder ?? 999)
  )
})

function onEnd() {
  const orderedIds = sortedThreads.value.map((t) => t.id)
  storyBibleStore.reorderPlotThreads(orderedIds)
}

// ── Chapter axis ────────────────────────────────────────────────────────────
//
// The story's real time axis, assembled by `buildStoryTimeline` from the same
// scene digests, entity states and edge windows that the Timeline *document*
// renders — so what the author reads here and what the writer is told cannot
// drift apart. Before this, threads dragged into an order were the only notion
// of time the project had, and that order meant nothing to anything else.

const chapterDigests = ref([])
const entityStates = ref([])
const isLoadingAxis = ref(true)

const chapterTitles = computed(() => {
  const titles = {}
  manuscriptStore.sortedSections.forEach((section, i) => {
    titles[i + 1] = section.title || `Chapter ${i + 1}`
  })
  return titles
})

// sceneId → chapter, by the same section ordering the titles use. A digest built
// before its scene was placed in a section carries no chapter number, and the
// states derived from it would otherwise never appear on the axis at all.
const sceneChapters = computed(() => {
  const map = {}
  manuscriptStore.sortedSections.forEach((section, i) => {
    for (const sub of manuscriptStore.subsectionsBySection[section.id] || []) {
      map[String(sub.id)] = i + 1
    }
  })
  return map
})

const chapterWordCounts = computed(() => {
  const map = {}
  manuscriptStore.sortedSections.forEach((section, i) => {
    let words = 0
    for (const sub of manuscriptStore.subsectionsBySection[section.id] || []) {
      words += countWords(sub.content || '')
    }
    if (words > 0) map[i + 1] = words
  })
  return map
})

function resolveName(type, id) {
  const key = String(id)
  if (type === 'character')
    return storyBibleStore.characters.find((c) => String(c.id) === key)?.name || ''
  if (type === 'location')
    return storyBibleStore.locations.find((l) => String(l.id) === key)?.name || ''
  if (type === 'plotThread')
    return storyBibleStore.plotThreads.find((t) => String(t.id) === key)?.title || ''
  return ''
}

const timeline = computed(() =>
  buildStoryTimeline({
    chapterDigests: chapterDigests.value,
    entityStates: entityStates.value,
    edges: storyGraphStore.edges || [],
    chapterTitles: chapterTitles.value,
    sceneChapters: sceneChapters.value,
    chapterWordCounts: chapterWordCounts.value,
    resolveName
  })
)

// Chapters worth rendering. A chapter with nothing derived is not evidence that
// nothing happened in it — only that it has not been analysed — so it is left
// out rather than drawn as an empty row that reads like a gap in the story.
const chapters = computed(() => timeline.value.chapters.filter((c) => !isChapterEmpty(c)))

const hasAxis = computed(() => chapters.value.length > 0)
const totalEvents = computed(() => chapters.value.reduce((sum, c) => sum + c.events.length, 0))

const view = ref('chapters')
// Threads are the only view a project without chapter data has. Switching to it
// automatically avoids opening on an empty pane that looks broken.
watch([isLoadingAxis, hasAxis], () => {
  if (!isLoadingAxis.value && !hasAxis.value) view.value = 'threads'
})

// Muted, matching NarrativeStructureTimeline's palette — these are markers in a
// reading surface, not status badges competing with the prose.
const EVENT_COLORS = {
  status: '#a86b6b',
  condition: '#d4a74a',
  knowledge: '#7a9aa8',
  appearance: '#9a9a5c',
  relationship_opens: '#6e8bb5',
  relationship_ends: '#6b6b6b'
}

function eventColor(kind) {
  return EVENT_COLORS[kind] || '#6b6b6b'
}

async function loadAxis(projectId) {
  isLoadingAxis.value = true
  try {
    const [digests, states] = await Promise.all([
      getProjectChapterDigests(projectId).catch(() => []),
      getEntityStateTimeline(projectId).catch(() => [])
    ])
    chapterDigests.value = digests
    entityStates.value = states
    await storyGraphStore.loadEdges(projectId)
  } finally {
    isLoadingAxis.value = false
  }
}

onMounted(async () => {
  const projectId = projectStore.currentProjectId
  if (!projectId) {
    isLoadingAxis.value = false
    return
  }
  await storyBibleStore.loadAll(projectId)
  const hasTimelineOrder = storyBibleStore.plotThreads.some((t) => t.timelineOrder != null)
  if (!hasTimelineOrder && storyBibleStore.plotThreads.length > 0) {
    storyBibleStore.reorderPlotThreads(storyBibleStore.plotThreads.map((t) => t.id))
  }
  await loadAxis(projectId)
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary overflow-hidden">
    <div class="p-4 border-b border-border-subtle flex items-start gap-4">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold text-text-primary font-ui">Timeline</h2>
        <p class="text-xs text-text-hint mt-1">
          {{
            view === 'chapters'
              ? 'What changes in each chapter, from the written manuscript'
              : 'Drag plot threads to arrange story order'
          }}
        </p>
      </div>

      <div
        v-if="hasAxis"
        class="ml-auto shrink-0 flex items-center rounded-md border border-border-subtle overflow-hidden"
      >
        <button
          v-for="mode in ['chapters', 'threads']"
          :key="mode"
          class="px-2.5 py-1 text-2xs font-ui capitalize transition-colors"
          :class="
            view === mode
              ? 'bg-bg-tertiary text-text-primary'
              : 'text-text-hint hover:text-text-secondary'
          "
          @click="view = mode"
        >
          {{ mode }}
        </button>
      </div>
    </div>

    <!-- Chapter axis -->
    <div v-if="view === 'chapters'" class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <EmptyState
        v-if="isLoadingAxis"
        icon="clock"
        title="Reading the manuscript"
        description="Building the chapter timeline from scene digests."
        class="flex-1"
      />
      <EmptyState
        v-else-if="!hasAxis"
        icon="clock"
        title="No chapters analysed yet"
        description="The chapter timeline is built from written scenes. Write or generate a scene, and it appears here."
        class="flex-1"
      />

      <ol v-else class="relative px-6 py-5">
        <!-- The spine, aligned to the chapter markers' centres: the list's own
             24px padding plus the marker's 14px offset and 10px radius. -->
        <div
          class="absolute left-12 top-7 bottom-10 w-px bg-border-subtle"
          aria-hidden="true"
        ></div>

        <li v-for="chapter in chapters" :key="chapter.chapterNumber" class="relative pl-12 pb-6">
          <div
            class="absolute left-3.5 top-0 w-5 h-5 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center"
          >
            <span class="text-2xs text-text-hint font-ui tabular-nums leading-none">{{
              chapter.chapterNumber
            }}</span>
          </div>

          <h3 class="text-sm font-medium text-text-primary leading-snug">{{ chapter.title }}</h3>
          <p v-if="chapter.summary" class="text-xs text-text-secondary mt-1 leading-relaxed">
            {{ chapter.summary }}
          </p>

          <div
            v-if="chapter.charactersPresent.length || chapter.locations.length || chapter.wordCount"
            class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-2xs text-text-hint"
          >
            <span v-if="chapter.charactersPresent.length">{{
              chapter.charactersPresent.join(', ')
            }}</span>
            <span v-if="chapter.locations.length" class="italic">{{
              chapter.locations.join(' · ')
            }}</span>
            <span v-if="chapter.wordCount" class="tabular-nums"
              >{{ chapter.wordCount.toLocaleString() }} words</span
            >
          </div>

          <!-- A character's last appearance is only worth flagging while the
               story continues past it; on the final chapter it means nothing. -->
          <p
            v-if="chapter.droppedThreads.length"
            class="mt-1.5 text-2xs text-text-hint italic"
            :title="'These characters do not appear again after this chapter'"
          >
            Last seen here: {{ chapter.droppedThreads.join(', ') }}
          </p>

          <ul v-if="chapter.events.length" class="mt-2.5 space-y-1">
            <li
              v-for="(event, i) in chapter.events"
              :key="i"
              class="flex items-start gap-2 text-xs text-text-secondary group"
              :class="event.sceneId ? 'cursor-pointer hover:text-text-primary' : ''"
              :title="event.evidence?.length ? event.evidence.join(' · ') : undefined"
              @click="event.sceneId && emit('open-scene', event.sceneId)"
            >
              <span
                class="w-1.5 h-1.5 rounded-full mt-[0.4rem] shrink-0"
                :style="{ backgroundColor: eventColor(event.kind) }"
              ></span>
              <span class="leading-relaxed">{{ event.text }}</span>
            </li>
          </ul>
        </li>
      </ol>
    </div>

    <!-- Plot threads (unchanged: drag order is still the only ordering threads have) -->
    <template v-else>
      <EmptyState
        v-if="sortedThreads.length === 0"
        icon="layout"
        title="No plot threads yet"
        description="Add threads in the Story Bible to start building your timeline."
        class="flex-1"
      />

      <div v-else class="flex-1 min-h-0 overflow-x-auto scrollbar-thin p-6">
        <div class="relative min-w-max">
          <div class="absolute top-8 left-8 right-8 h-px bg-border-subtle"></div>
          <div class="absolute top-8 left-0 w-4 h-px bg-border-subtle"></div>
          <div class="absolute top-8 right-0 w-4 h-px bg-border-subtle"></div>

          <draggable
            v-model="sortedThreads"
            item-key="id"
            v-bind="dragOptions"
            class="flex gap-4 items-start pt-4"
            @end="onEnd"
          >
            <template #item="{ element: thread }">
              <div class="min-w-[160px] max-w-[180px] relative flex flex-col items-center">
                <div
                  class="w-3 h-3 rounded-full mb-2 z-10 ring-2 ring-bg-secondary"
                  :style="{
                    backgroundColor: threadStatusMeta(thread.status).color
                  }"
                ></div>
                <div
                  class="w-full bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden cursor-grab active:cursor-grabbing hover:border-accent transition-colors"
                >
                  <div class="p-2.5 border-b border-border-subtle">
                    <div class="flex items-start gap-1.5">
                      <BaseIcon
                        name="grip-vertical"
                        :size="14"
                        class="text-text-hint mt-0.5 shrink-0"
                      />
                      <h3
                        class="text-xs font-medium text-text-primary leading-snug line-clamp-2 min-h-[2em]"
                      >
                        {{ thread.title }}
                      </h3>
                    </div>
                  </div>
                  <div class="px-2.5 py-1.5 flex items-center gap-1.5">
                    <BaseStatusDot
                      :color="threadStatusMeta(thread.status).color"
                      :shape="threadStatusMeta(thread.status).shape"
                      :label="threadStatusMeta(thread.status).label"
                      size="sm"
                    />
                    <span
                      v-if="thread.notes"
                      class="text-2xs text-text-hint truncate ml-auto max-w-[60px]"
                      >{{ thread.notes }}</span
                    >
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </template>

    <div class="p-3 border-t border-border-subtle text-center">
      <span v-if="view === 'chapters' && hasAxis" class="text-xs text-text-hint">
        {{ chapters.length }} chapter{{ chapters.length !== 1 ? 's' : '' }} ·
        {{ totalEvents }} change{{ totalEvents !== 1 ? 's' : '' }}
      </span>
      <span
        v-else-if="view === 'threads' && sortedThreads.length > 0"
        class="text-xs text-text-hint"
        >{{ sortedThreads.length }} thread{{ sortedThreads.length !== 1 ? 's' : '' }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.ghost {
  @apply opacity-30;
  transition: opacity 0.15s;
}
.drag {
  @apply opacity-90;
}
</style>
