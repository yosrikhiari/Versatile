<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useDialogueIndexer } from '../../composables/useDialogueIndexer'
import BaseIcon from '../shared/BaseIcon.vue'

const projectStore = useProjectStore()
const { indexing, progress, dialogueStats, indexProjectContent, loadDialogueForProject } =
  useDialogueIndexer()

const dialogueEntries = ref([])
const selectedSpeakerId = ref(null)
const selectedEntry = ref(null)
const loadingEntries = ref(false)
const filterType = ref('all')

const projectId = computed(() => projectStore.currentProject?.id)

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
    <div class="p-4 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-text-primary">Voice Lab</h2>
        <span class="text-2xs tabular-nums text-text-hint">
          {{ dialogueEntries.length }} lines
        </span>
      </div>

      <button
        :disabled="indexing || !projectId"
        class="w-full py-2 px-3 rounded-lg text-xs transition-all duration-150 flex items-center justify-center gap-2"
        :class="
          indexing
            ? 'bg-surface-hover text-accent cursor-wait'
            : 'btn-primary active:scale-[0.98]'
        "
        @click="handleIndex"
      >
        <BaseIcon :name="indexing ? 'loader-2' : 'message-square'" :size="14" />
        {{
          indexing ? `Indexing ${progress.current}/${progress.total}...` : 'Index Current Content'
        }}
      </button>

      <div v-if="indexing" class="mt-2 h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          class="h-full bg-accent rounded-full transition-all duration-300"
          :style="{
            width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%'
          }"
        />
      </div>

      <div v-if="dialogueStats" class="mt-2 flex gap-3 text-2xs text-text-hint">
        <span>{{ dialogueStats.sectionsIndexed }} sections</span>
        <span>{{ dialogueStats.totalLines }} dialogue lines</span>
      </div>
    </div>

    <div v-if="speakers.length > 0" class="px-4 py-2 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-2">
        <span class="text-2xs font-medium text-text-hint uppercase tracking-wider"
          >Speakers</span
        >
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
        <button
          v-for="speaker in speakers"
          :key="speaker.id"
          :class="[
            'px-2 py-1 rounded-md text-2xs font-medium transition-all duration-150',
            selectedSpeakerId === speaker.id
              ? 'bg-surface-hover text-accent ring-1 ring-accent'
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover'
          ]"
          @click="selectSpeaker(speaker.id)"
        >
          {{ speaker.name }}
          <span class="ml-1 opacity-60">{{ speaker.count }}</span>
          <span v-if="speaker.needsReview > 0" class="ml-1 text-warning opacity-80">
            ({{ speaker.needsReview }})
          </span>
        </button>
      </div>
      <div class="flex gap-2 mt-2">
        <button
          :class="[
            'px-2 py-0.5 rounded text-2xs font-medium transition-all',
            filterType === 'unreviewed'
              ? 'bg-surface-hover text-warning ring-1 ring-warning'
              : 'text-text-hint hover:text-text-secondary'
          ]"
          @click="filterType = filterType === 'unreviewed' ? 'all' : 'unreviewed'"
        >
          Unreviewed {{ unreviewedCount > 0 ? `(${unreviewedCount})` : '' }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-if="loadingEntries" class="p-4 text-center">
        <BaseIcon name="loader-2" :size="20" class="mx-auto text-accent animate-spin" />
      </div>

      <div v-else-if="filteredEntries.length === 0" class="p-6 text-center text-text-hint">
        <BaseIcon name="message-square" :size="32" class="mx-auto mb-2 opacity-40" />
        <p class="text-xs">
          {{
            dialogueEntries.length === 0
              ? 'No dialogue indexed yet. Click "Index Current Content" above.'
              : 'No entries match the current filter.'
          }}
        </p>
      </div>

      <div v-else class="pb-2">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          :class="[
            'group mx-2 my-1 rounded-lg border transition-all duration-100 cursor-pointer',
            selectedEntry?.id === entry.id
              ? 'border-accent bg-surface-hover'
              : entry.needsReview
                ? 'border-border-subtle bg-bg-secondary hover:bg-surface-hover hover:border-border-subtle'
                : 'border-transparent hover:bg-surface-hover hover:border-border-subtle'
          ]"
          @click="selectEntry(entry)"
        >
          <div class="px-3 py-2">
            <div class="flex items-start gap-2">
              <span
                v-if="entry.speakerName"
                class="shrink-0 px-1.5 py-0.5 rounded text-2xs font-semibold leading-tight"
                :style="{
                  backgroundColor: 'var(--vers-bg-hover)',
                  color: entry.color || 'var(--vers-accent-primary)'
                }"
              >
                {{ entry.speakerName }}
              </span>
              <span
                v-else
                class="shrink-0 px-1.5 py-0.5 rounded text-2xs font-medium leading-tight bg-bg-tertiary text-text-hint"
              >
                Unknown
              </span>
              <p class="text-xs text-text-secondary leading-relaxed min-w-0 flex-1">
                {{ truncate(entry.textContent, 160) }}
              </p>
            </div>
            <div class="flex items-center gap-2 mt-1.5">
              <span class="text-2xs text-text-hint font-mono">
                §{{ entry.sectionId ? entry.sectionId.slice(0, 6) : '?' }}:{{
                  entry.paragraphIndex
                }}
              </span>
              <span v-if="entry.confidence < 1" class="text-2xs text-warning">
                {{ Math.round(entry.confidence * 100) }}%
              </span>
              <span
                v-if="entry.dialogueType === 'action'"
                class="text-2xs px-1 py-0.5 rounded bg-bg-tertiary text-text-hint italic leading-none"
              >
                action
              </span>
              <span
                v-if="entry.needsReview"
                class="text-2xs px-1.5 py-0.5 rounded bg-bg-secondary text-warning font-medium leading-none"
              >
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
              <span class="text-2xs text-text-hint uppercase tracking-wider font-medium"
                >Context</span
              >
              <p class="text-2xs text-text-hint mt-0.5 italic leading-relaxed">
                {{ truncate(entry.contextBefore, 200) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-2xs text-text-hint">
              <span>ID: {{ entry.id?.slice(0, 8) || '?' }}</span>
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
