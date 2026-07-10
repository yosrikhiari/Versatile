<script setup>
import { ref, watch, computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useStoryDocuments } from '../../composables/useStoryDocuments'
import { useStoryGraphStore } from '../../stores/storyGraphStore'

// A single editable, canonical "Story Context" document. It aggregates the
// synopsis, story bible, and a running summary of what has already been written,
// and is fed to the AI writer before every scene so continued generation stays
// grounded instead of hallucinating. The user can hand-edit it; the author zone
// is preserved across rebuilds.
const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: [String, Number], default: null }
})
const emit = defineEmits(['close'])

const { getStoryContextDoc, saveStoryContextDoc, rebuildStoryContextDoc } = useStoryDocuments()
const graphStore = useStoryGraphStore()

// Orphaned-link maintenance. `orphanCount` is null until checked, then a number;
// `cleanedCount` holds the result after a removal.
const checking = ref(false)
const cleaning = ref(false)
const orphanCount = ref(null)
const cleanedCount = ref(null)

async function checkOrphans() {
  if (!props.projectId || checking.value) return
  checking.value = true
  cleanedCount.value = null
  try {
    await graphStore.loadEdges(props.projectId)
    orphanCount.value = graphStore.findOrphanedEdges().length
  } finally {
    checking.value = false
  }
}

async function confirmClean() {
  if (!props.projectId || cleaning.value) return
  cleaning.value = true
  try {
    const { removed } = await graphStore.cleanOrphanedEdges(props.projectId)
    cleanedCount.value = removed
    orphanCount.value = null
  } finally {
    cleaning.value = false
  }
}

function cancelClean() {
  orphanCount.value = null
}

const content = ref('')
const savedContent = ref('')
const loading = ref(false)
const rebuilding = ref(false)
const saving = ref(false)

const dirty = computed(() => content.value !== savedContent.value)
const wordCount = computed(() =>
  content.value.trim() ? content.value.trim().split(/\s+/).length : 0
)

async function load() {
  if (!props.projectId) return
  orphanCount.value = null
  cleanedCount.value = null
  loading.value = true
  try {
    const doc = await getStoryContextDoc(props.projectId)
    if (doc?.content && doc.content.trim()) {
      content.value = doc.content
      savedContent.value = doc.content
    } else {
      // First open — build an initial draft from whatever already exists.
      const built = await rebuildStoryContextDoc(props.projectId)
      content.value = built
      savedContent.value = built
    }
  } finally {
    loading.value = false
  }
}

async function handleRebuild() {
  if (!props.projectId || rebuilding.value) return
  rebuilding.value = true
  try {
    // Persist current edits first so the author zone the rebuild preserves is
    // the one the user is actually looking at.
    if (dirty.value) await saveStoryContextDoc(props.projectId, content.value)
    const built = await rebuildStoryContextDoc(props.projectId)
    content.value = built
    savedContent.value = built
  } finally {
    rebuilding.value = false
  }
}

async function handleSave() {
  if (!props.projectId || saving.value || !dirty.value) return
  saving.value = true
  try {
    await saveStoryContextDoc(props.projectId, content.value)
    savedContent.value = content.value
  } finally {
    saving.value = false
  }
}

watch(
  () => props.show,
  (v) => {
    if (v) load()
  }
)
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4"
    @click.self="emit('close')"
  >
    <div
      class="glass-modal rounded-xl shadow-warm-lg max-w-3xl w-full max-h-[88vh] flex flex-col"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-start justify-between p-5 pb-3 border-b border-border-subtle">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <BaseIcon name="book-open" :size="18" class="text-accent" />
            <h2 class="text-lg font-semibold text-text-primary font-ui">Story Context</h2>
          </div>
          <p class="text-xs text-text-secondary font-ui max-w-lg">
            The AI reads this before writing every scene. Keep it accurate and it will stop
            inventing things — your notes above the divider are always kept when you rebuild.
          </p>
        </div>
        <button
          class="text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded shrink-0"
          @click="emit('close')"
        >
          <BaseIcon name="x" :size="20" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 pt-4 scrollbar-thin">
        <div v-if="loading" class="py-12 text-center text-sm text-text-hint font-ui">
          Building context from your story…
        </div>
        <textarea
          v-else
          v-model="content"
          spellcheck="false"
          class="w-full h-[52vh] resize-none rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[13px] leading-relaxed text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="No context yet — click Rebuild from story to generate it."
        />
      </div>

      <!-- Maintenance: clean orphaned relationship links from the network graph -->
      <div
        v-if="!loading"
        class="flex items-center gap-2 px-5 py-2.5 border-t border-border-subtle text-[11px] font-ui"
      >
        <BaseIcon name="unlink" :size="13" class="text-text-hint shrink-0" />
        <template v-if="orphanCount === null">
          <span class="text-text-hint flex-1"
            >Remove relationships pointing at deleted entities (the "Character 42"
            noise) from the network.</span
          >
          <button
            class="py-1 px-2.5 text-text-secondary hover:text-text-primary border border-border-subtle rounded-md focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            :disabled="checking"
            @click="checkOrphans"
          >
            {{ checking ? 'Checking…' : 'Check for orphaned links' }}
          </button>
          <span v-if="cleanedCount !== null" class="text-emerald-400"
            >Removed {{ cleanedCount }}.</span
          >
        </template>
        <template v-else-if="orphanCount === 0">
          <span class="text-emerald-400 flex-1">No orphaned links found.</span>
        </template>
        <template v-else>
          <span class="text-amber-400 flex-1"
            >{{ orphanCount }} orphaned link{{ orphanCount === 1 ? '' : 's' }} — remove
            permanently?</span
          >
          <button
            class="py-1 px-2.5 text-text-secondary hover:text-text-primary rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
            @click="cancelClean"
          >
            Cancel
          </button>
          <button
            class="py-1 px-2.5 bg-red-500/90 text-white rounded-md font-medium hover:bg-red-500 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-50"
            :disabled="cleaning"
            @click="confirmClean"
          >
            {{ cleaning ? 'Removing…' : `Remove ${orphanCount}` }}
          </button>
        </template>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between gap-3 p-4 border-t border-border-subtle"
      >
        <span class="text-[11px] text-text-hint font-ui">
          {{ wordCount }} words
          <span v-if="dirty" class="text-amber-400"> · unsaved changes</span>
        </span>
        <div class="flex items-center gap-2">
          <button
            class="py-1.5 px-3 text-xs text-text-secondary hover:text-text-primary border border-border-subtle rounded-md font-ui focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            :disabled="rebuilding || loading"
            @click="handleRebuild"
          >
            {{ rebuilding ? 'Rebuilding…' : 'Rebuild from story' }}
          </button>
          <button
            class="py-1.5 px-4 text-xs bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent/90 font-ui focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            :disabled="!dirty || saving || loading"
            @click="handleSave"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
