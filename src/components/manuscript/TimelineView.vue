<script setup>
import { computed, onMounted } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import { getChapterWordCounts } from '../../services/dbService'
import { CHAPTER_STATUSES } from '../../config/statuses'
import BaseIcon from '../shared/BaseIcon.vue'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const volumeStore = useVolumeStore()

const chapters = computed(() => manuscriptStore.sortedChapters)
const volumes = computed(() => volumeStore.volumes)
const chapterCounts = computed(() => {
  let counts = {}
  let total = 0
  for (const chapter of chapters.value) {
    const wc = getChapterWordCount(chapter.id)
    counts[chapter.id] = wc
    total += wc
  }
  return { counts, total }
})

function getChapterWordCount(chapterId) {
  const scenes = manuscriptStore.scenes.filter(s => s.chapterId === chapterId)
  let count = 0
  for (const scene of scenes) {
    if (scene.content) {
      count += scene.content.split(/\s+/).filter(w => w.length > 0).length
    }
  }
  return count
}

function getStatusColor(status) {
  const statusObj = CHAPTER_STATUSES.find(s => s.value === status)
  return statusObj?.color || '#6b7280'
}

function getStatusLabel(status) {
  const statusObj = CHAPTER_STATUSES.find(s => s.value === status)
  return statusObj?.label || status
}

function getVolumeForChapter(chapterId) {
  return volumeStore.getVolumeForChapter(chapterId)
}

const emit = defineEmits(['open-chapters'])

function openChapterManager() {
  emit('open-chapters')
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    volumeStore.loadVolumes(projectStore.currentProjectId)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <div class="p-4 border-b border-border-subtle">
      <h2 class="text-lg font-semibold text-text-primary font-ui">Timeline</h2>
      <p class="text-xs text-text-hint mt-1">Your manuscript at a glance</p>
    </div>

    <div v-if="chapters.length === 0" class="flex-1 flex items-center justify-center p-8">
      <div class="text-center">
        <BaseIcon name="layout" :size="48" class="text-text-hint mx-auto mb-4" />
        <p class="text-text-hint font-ui text-sm mb-4">No chapters yet. Create your first chapter to see the timeline.</p>
        <button 
          @click="openChapterManager"
          class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
        >
          Open Chapter Manager
        </button>
      </div>
    </div>

    <div v-else class="flex-1 overflow-x-auto p-4">
      <div class="flex gap-4 min-w-max">
        <template v-for="volume in volumes" :key="volume.id">
          <div 
            v-if="chapters.filter(c => c.volumeId === volume.id).length > 0"
            class="w-full mb-4 -mt-2"
          >
            <div 
              class="px-3 py-1.5 rounded text-white text-sm font-ui"
              :style="{ backgroundColor: volume.color || '#6366f1' }"
            >
              {{ volume.title }}
            </div>
          </div>
        </template>
        
        <div 
          v-for="chapter in chapters" 
          :key="chapter.id"
          class="w-64 shrink-0 bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden"
          :style="{ borderTopWidth: getVolumeForChapter(chapter.id) ? '3px' : '1px', borderTopColor: getVolumeForChapter(chapter.id)?.color || undefined }"
        >
          <div 
            class="p-3 border-b border-border-subtle"
            :style="{ borderLeftColor: getStatusColor(chapter.status), borderLeftWidth: '3px' }"
          >
            <h3 class="font-semibold text-text-primary font-ui truncate">
              {{ chapter.title || `Chapter ${chapter.order + 1}` }}
            </h3>
            <span 
              class="inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full text-white font-ui"
              :style="{ backgroundColor: getStatusColor(chapter.status) }"
            >
              {{ getStatusLabel(chapter.status) }}
            </span>
          </div>
          
          <div class="p-3">
            <div class="text-xs text-text-hint font-ui mb-2">
              {{ chapterCounts.counts[chapter.id]?.toLocaleString() || 0 }} words
            </div>
            <p v-if="chapter.summary" class="text-xs text-text-muted font-ui line-clamp-3">
              {{ chapter.summary }}
            </p>
            <p v-else class="text-xs text-text-hint font-ui italic">
              No summary
            </p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="chapters.length > 0" class="p-3 border-t border-border-subtle text-center">
      <button 
        @click="openChapterManager"
        class="text-xs text-text-hint hover:text-accent font-ui"
      >
        Total: {{ chapterCounts.total.toLocaleString() }} words — Open Chapter Manager
      </button>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>