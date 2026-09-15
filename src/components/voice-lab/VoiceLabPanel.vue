<script setup>
import BaseButton from '../ui/BaseButton.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useDialogueIndexer } from '../../composables/useDialogueIndexer'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import Skeleton from '../shared/Skeleton.vue'
import BaseChip from '../ui/BaseChip.vue'

const projectStore = useProjectStore()
const manuscriptStore = useManuscriptStore()
const terms = computed(() => projectStore.structureTerms)
const { indexing, progress, dialogueStats, indexProjectContent, loadDialogueForProject } =
  useDialogueIndexer()

const dialogueEntries = ref([])
const selectedSpeakerId = ref(null)
const selectedEntry = ref(null)
const loadingEntries = ref(false)
const filterType = ref('all')

// `projectStore.currentProject` never existed; the button this feeds was disabled forever.
const projectId = computed(() => projectStore.currentProjectId)

const speakers = computed(() => {
  const seen = new Map()
  for (const entry of dialogueEntries.value) {
    if (!entry.speakerId || !entry.speakerName) continue
    if (!seen.has(entry.speakerId)) {
      seen.set(entry.speakerId, {
        id: entry.speakerId,
        name: entry.speakerName,
        count: 0,
        needsReview: 0
      })
    }
    const s = seen.get(entry.speakerId)
    s.count++
    if (entry.needsReview) s.needsReview++
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count)
})

const filteredEntries = computed(() => {
  let entries = dialogueEntries.value
  if (selectedSpeakerId.value) {
    entries = entries.filter((e) => e.speakerId === selectedSpeakerId.value)
  }
  if (filterType.value === 'unreviewed') {
    entries = entries.filter((e) => e.needsReview)
  }
  return entries
})

const unreviewedCount = computed(() => dialogueEntries.value.filter((e) => e.needsReview).length)

async function handleIndex() {
  if (!projectId.value) return
  await indexProjectContent(projectId.value)
  await loadEntries()
}

async function loadEntries() {
  if (!projectId.value) return
  loadingEntries.value = true
  try {
    dialogueEntries.value = await loadDialogueForProject(projectId.value)
  } finally {
    loadingEntries.value = false
  }
}

function selectSpeaker(speakerId) {
  selectedSpeakerId.value = selectedSpeakerId.value === speakerId ? null : speakerId
}

function clearFilter() {
  selectedSpeakerId.value = null
  filterType.value = 'all'
}

function selectEntry(entry) {
  selectedEntry.value = selectedEntry.value?.id === entry.id ? null : entry
}

/**
 * Where a line lives, in words: "The harbour · Counting the boats ¶3". The
 * old `§{{ sectionId.slice(0, 6) }}` threw once ids became numbers, which is
 * why this list never rendered.
 */
function whereLabel(entry) {
  const sub = (manuscriptStore.subsections || []).find((x) => x.id === entry.subsectionId)
  const sec = (manuscriptStore.sections || []).find((x) => x.id === entry.sectionId)
  const parts = [sec?.title, sub?.title].filter(Boolean)
  const where = parts.length
    ? parts.join(' · ')
    : `${terms.value.subsection} ${entry.subsectionId ?? '?'}`
  return `${where} ¶${(entry.paragraphIndex ?? 0) + 1}`
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

function truncate(text, max = 120) {
  if (!text || text.length <= max) return text
  return text.slice(0, max) + '...'
}

onMounted(() => {
  if (projectId.value) {
    loadEntries()
  }
})

watch(projectId, (id) => {
  if (id) loadEntries()
  else dialogueEntries.value = []
})
</script>

<template>
  <div class="voice-lab-panel flex flex-col h-full">
    <BasePanelHeader
      title="Voice Lab"
      icon="message-square"
      :meta="dialogueEntries.length ? plural(dialogueEntries.length, 'line', 'lines') : ''"
    >
      <template #actions>
        <BaseButton
          variant="soft"
          size="sm"
          icon="scan-line"
          :loading="indexing"
          :disabled="indexing || !projectId"
          @click="handleIndex"
        >
          {{ indexing ? `Scanning ${progress.current}/${progress.total}` : 'Scan manuscript' }}
        </BaseButton>
      </template>
    </BasePanelHeader>

    <div v-if="indexing || dialogueStats" class="px-4 py-2 border-b border-border-subtle">
      <div v-if="indexing" class="h-1 bg-bg-tertiary rounded-sm overflow-hidden">
        <div
          class="h-full bg-accent rounded-sm transition-all duration-300"
          :style="{
            width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%'
          }"
        />
      </div>

      <div v-if="dialogueStats" class="flex gap-3 font-ui text-2xs text-text-hint">
        <span>
          {{ plural(dialogueStats.sectionsIndexed, terms.subsectionLc, terms.subsectionsLc) }}
          scanned
        </span>
        <span>{{ plural(dialogueStats.totalLines, 'line of dialogue', 'lines of dialogue') }}</span>
      </div>
    </div>

    <div v-if="speakers.length > 0" class="px-4 py-2 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-2">
        <span class="label-micro text-text-hint">Speakers</span>
        <div class="flex gap-1">
          <button
            v-if="selectedSpeakerId || filterType === 'unreviewed'"
            class="text-2xs text-accent hover:underline"
            @click="clearFilter"
          >
            Clear
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <BaseChip
          v-for="speaker in speakers"
          :key="speaker.id"
          variant="filter"
          :active="selectedSpeakerId === speaker.id"
          @click="selectSpeaker(speaker.id)"
        >
          {{ speaker.name }}
          <span class="ml-1 opacity-60">{{ speaker.count }}</span>
          <span v-if="speaker.needsReview > 0" class="ml-1 text-warning">
            ({{ speaker.needsReview }})
          </span>
        </BaseChip>
      </div>
      <div class="flex gap-2 mt-2">
        <BaseChip
          variant="filter"
          :active="filterType === 'unreviewed'"
          @click="filterType = filterType === 'unreviewed' ? 'all' : 'unreviewed'"
        >
          Unreviewed
          <span v-if="unreviewedCount > 0" class="ml-1 opacity-60">{{ unreviewedCount }}</span>
        </BaseChip>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-if="loadingEntries" class="p-4">
        <Skeleton variant="list" :count="4" size="1.75rem" label="Loading voice entries…" />
      </div>

      <div v-else-if="filteredEntries.length === 0" class="p-6 text-center text-text-hint">
        <BaseIcon name="message-square" :size="32" class="mx-auto mb-2 opacity-40" />
        <p class="text-xs">
          {{
            dialogueEntries.length === 0
              ? 'Nothing scanned yet. Voice Lab collects every line of dialogue so you can hear each character — scan the manuscript above.'
              : 'No entries match the current filter.'
          }}
        </p>
      </div>

      <div v-else class="pb-2">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          :class="[
            'group border-b border-border-subtle transition-colors duration-100 cursor-pointer',
            selectedEntry?.id === entry.id
              ? 'bg-surface-hover shadow-[inset_2px_0_0_var(--vers-accent-primary)]'
              : 'hover:bg-surface-hover'
          ]"
          @click="selectEntry(entry)"
        >
          <div class="px-3 py-2">
            <div class="flex items-start gap-2">
              <span
                v-if="entry.speakerName"
                class="shrink-0 label-micro leading-tight"
                :style="{ color: entry.color || 'var(--vers-accent-primary)' }"
              >
                {{ entry.speakerName }}
              </span>
              <span v-else class="shrink-0 label-micro leading-tight text-text-hint">
                Unknown
              </span>
              <p class="text-xs text-text-secondary leading-relaxed min-w-0 flex-1">
                {{ truncate(entry.textContent, 160) }}
              </p>
            </div>
            <div class="flex items-center gap-2 mt-1.5">
              <span class="text-2xs text-text-hint truncate">{{ whereLabel(entry) }}</span>
              <span v-if="entry.confidence < 1" class="text-2xs text-warning">
                {{ Math.round(entry.confidence * 100) }}%
              </span>
              <span
                v-if="entry.dialogueType === 'action'"
                class="text-2xs text-text-hint italic leading-none"
              >
                action
              </span>
              <span v-if="entry.needsReview" class="text-2xs text-warning leading-none">
                Needs review
              </span>
              <span
                class="ml-auto text-2xs text-text-hint group-hover:text-text-secondary transition-colors duration-100"
              >
                <BaseIcon
                  :name="selectedEntry?.id === entry.id ? 'chevron-down' : 'chevron-right'"
                  :size="12"
                />
              </span>
            </div>
          </div>

          <div
            v-if="selectedEntry?.id === entry.id"
            class="border-t border-border-subtle px-3 py-2 space-y-1.5 bg-bg-secondary"
          >
            <p class="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
              {{ entry.textContent }}
            </p>
            <div v-if="entry.contextBefore" class="pt-1 border-t border-border-subtle">
              <span class="label-micro text-text-hint">Context</span>
              <p class="text-2xs text-text-hint mt-0.5 italic leading-relaxed">
                {{ truncate(entry.contextBefore, 200) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-2xs text-text-hint">
              <span>Type: {{ entry.dialogueType || 'quoted' }}</span>
              <span v-if="entry.tagType">Tag: {{ entry.tagType }}</span>
              <span
                >Indexed:
                {{ entry.indexedAt ? new Date(entry.indexedAt).toLocaleDateString() : '?' }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
