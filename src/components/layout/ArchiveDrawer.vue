<script setup>
import { ref, onMounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useArchiveStore } from '../../stores/archiveStore'
import { useContextRetrieval } from '../../composables/useContextRetrieval'
import BaseTab from '../ui/BaseTab.vue'
import BaseChip from '../ui/BaseChip.vue'
const projectStore = useProjectStore()
const archiveStore = useArchiveStore()
const { dryRun } = useContextRetrieval()

const activeTab = ref('sessions')
const signalFilter = ref(null)
const searchQuery = ref('')
const isPruning = ref(false)
const pruneDays = ref(90)
const showDetails = ref(null)
const contextPreview = ref(null)
const showContextPreview = ref(false)

const signalOptions = [
  { value: null, label: 'All' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'partial', label: 'Partial' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'rejected', label: 'Rejected' }
]

const typeColors = {
  spark_prompt: 'text-amber-400',
  spark_outline: 'text-amber-400',
  spark_content: 'text-amber-400',
  polish_analysis: 'text-emerald-400',
  polish_annotation: 'text-emerald-400',
  revise_comment: 'text-blue-400',
  entity_generation: 'text-purple-400',
  entity_enhance: 'text-purple-400',
  session_end: 'text-accent',
  state_snapshot: 'text-accent'
}

onMounted(async () => {
  if (projectStore.currentProjectId) {
    await loadData()
  }
})

async function loadData() {
  const pid = projectStore.currentProjectId
  if (!pid) return
  await archiveStore.loadStateSnapshots(pid)
  await loadSessions()
}

async function loadSessions() {
  const pid = projectStore.currentProjectId
  if (!pid) return
  const opts = {}
  if (signalFilter.value) {
    opts.minSignal = signalFilter.value
  }
  await archiveStore.loadSessionHistory(pid, opts)
}

async function toggleContextPreview() {
  showContextPreview.value = !showContextPreview.value
  if (showContextPreview.value && !contextPreview.value) {
    contextPreview.value = await dryRun(projectStore.currentProjectId)
  }
}

async function handleSearch() {
  const pid = projectStore.currentProjectId
  if (!pid || !searchQuery.value.trim()) {
    await loadSessions()
    return
  }
  await archiveStore.searchArchive(pid, searchQuery.value)
}

async function handlePrune() {
  const pid = projectStore.currentProjectId
  if (!pid) return
  isPruning.value = true
  try {
    const deleted = await archiveStore.prune(pid, pruneDays.value)
    alert(`Deleted ${deleted} entries older than ${pruneDays.value} days.`)
  } finally {
    isPruning.value = false
  }
}

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function signalBadge(signal) {
  return signal === 'accepted' ? 'text-accent' :
    signal === 'partial' ? 'text-amber-400' :
    signal === 'rejected' ? 'text-red-400' :
    'text-text-hint'
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-text-primary font-ui text-sm">Archive</span>
        <button
          class="text-text-hint hover:text-danger text-xs font-ui"
          :disabled="isPruning"
          @click="handlePrune"
        >
          {{ isPruning ? 'Pruning...' : 'Prune old' }}
        </button>
      </div>
      <div class="flex mt-3 gap-1">
        <BaseTab
          v-for="tab in [{ key: 'sessions', label: 'Sessions' }, { key: 'snapshots', label: 'Snapshots' }, { key: 'search', label: 'Search' }]"
          :key="tab.key"
          variant="pill"
          size="sm"
          class="flex-1"
          :active="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </BaseTab>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <template v-if="activeTab === 'search'">
        <div class="flex gap-1">
          <input
            v-model="searchQuery"
            placeholder="Search archive..."
            class="flex-1 px-2 py-1.5 text-xs bg-bg-tertiary border border-border-subtle rounded text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent/50 font-ui"
            @keydown.enter="handleSearch"
          />
          <button
            class="px-2 py-1.5 text-xs bg-accent text-accent-foreground rounded hover:bg-accent/90 font-ui"
            @click="handleSearch"
          >
            Go
          </button>
        </div>
      </template>

      <div v-if="activeTab !== 'snapshots'" class="flex flex-wrap gap-1">
        <BaseChip
          v-for="opt in signalOptions"
          :key="opt.value || 'all'"
          variant="filter"
          size="sm"
          :active="signalFilter === opt.value"
          @click="signalFilter = opt.value; loadSessions()"
        >
          {{ opt.label }}
        </BaseChip>
      </div>

      <template v-if="activeTab === 'snapshots'">
        <div v-if="archiveStore.stateSnapshots.length === 0" class="text-center py-8">
          <p class="text-xs italic text-text-hint font-body">No state snapshots yet</p>
        </div>
        <div
          v-for="snap in archiveStore.stateSnapshots"
          :key="snap.id"
          class="p-2 rounded-lg bg-bg-tertiary border border-border-subtle cursor-pointer"
          @click="showDetails = showDetails === snap.id ? null : snap.id"
        >
          <div class="flex items-center justify-between">
            <span class="text-2xs text-text-hint font-ui">{{ formatTime(snap.timestamp) }}</span>
            <span v-if="snap.state?.wordCount" class="text-2xs text-accent font-ui">{{ snap.state.wordCount.toLocaleString() }} words</span>
          </div>
          <div v-if="showDetails === snap.id && snap.state" class="mt-2 space-y-1">
            <div v-if="snap.state.activeSection" class="text-xs text-text-secondary font-ui">Section: {{ snap.state.activeSection }}</div>
            <div v-if="snap.state.unresolvedThreads?.length" class="text-xs text-text-secondary font-ui">
              Unresolved: {{ snap.state.unresolvedThreads.slice(0, 5).join(', ') }}
            </div>
            <div v-if="snap.state.characterCount" class="text-xs text-text-secondary font-ui">{{ snap.state.characterCount }} characters</div>
            <div v-if="snap.state.wordCountDelta" class="text-xs text-accent font-ui">+{{ snap.state.wordCountDelta }} words this session</div>
          </div>
          <div v-else-if="showDetails !== snap.id" class="mt-1 text-2xs text-text-hint font-body line-clamp-1">
            {{ snap.state?.activeSection || snap.state?.projectName || 'No details' }}
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="archiveStore.archivedSessions.length === 0" class="text-center py-8">
          <p class="text-xs italic text-text-hint font-body">No archived sessions yet</p>
        </div>
        <div
          v-for="entry in archiveStore.archivedSessions"
          :key="entry.id"
          class="p-2 rounded-lg bg-bg-tertiary border border-border-subtle cursor-pointer"
          @click="showDetails = showDetails === entry.id ? null : entry.id"
        >
          <div class="flex items-center justify-between gap-1">
            <span class="text-2xs font-ui truncate" :class="typeColors[entry.type] || 'text-text-hint'">{{ entry.type.replace('_', ' ') }}</span>
            <span class="text-2xs font-ui shrink-0" :class="signalBadge(entry.signal)">[{{ entry.signal }}]</span>
          </div>
          <div class="flex items-center justify-between mt-0.5">
            <span class="text-2xs text-text-hint font-ui">{{ formatTime(entry.timestamp) }}</span>
            <span v-if="entry.tags?.length" class="text-3xs text-text-hint font-ui truncate ml-2">{{ entry.tags.slice(0, 2).join(', ') }}</span>
          </div>
          <div v-if="showDetails === entry.id" class="mt-1.5">
            <pre class="text-2xs text-text-secondary font-body whitespace-pre-wrap max-h-24 overflow-y-auto bg-bg-secondary rounded p-1">{{ typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 1) }}</pre>
          </div>
        </div>
      </template>

      <details class="mt-3 border-t border-border-subtle pt-2">
        <summary
          class="py-1 text-2xs uppercase tracking-wider text-text-hint font-ui cursor-pointer hover:text-text-secondary"
          @click.prevent="toggleContextPreview"
        >
          {{ showContextPreview ? '▼' : '▶' }} Context Preview
        </summary>
        <div v-if="contextPreview" class="mt-1 space-y-1">
          <div class="text-xs text-text-hint font-ui">{{ contextPreview.sourceDescription }}</div>
          <div v-for="(line, i) in contextPreview.previewLines" :key="i" class="flex items-start gap-1.5 text-xs">
            <span class="text-text-hint shrink-0 mt-0.5">•</span>
            <span class="text-text-secondary">
              <span v-if="line.signal" :class="signalBadge(line.signal)">[{{ line.signal }}]</span>
              {{ line.summary }}
            </span>
          </div>
          <details class="mt-1">
            <summary class="text-2xs text-text-hint cursor-pointer hover:text-text-secondary">Full context text</summary>
            <pre class="mt-1 p-2 bg-bg-tertiary rounded text-2xs text-text-hint whitespace-pre-wrap max-h-32 overflow-y-auto">{{ contextPreview.contextText || '(empty)' }}</pre>
          </details>
        </div>
        <div v-else class="mt-1 text-xs text-text-hint font-ui">Click to load context preview</div>
      </details>
    </div>
  </div>
</template>
