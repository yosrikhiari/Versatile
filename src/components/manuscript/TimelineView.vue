<script setup>
import { computed, onMounted } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import { getChapterWordCounts } from '../../services/dbService'
import { SECTION_STATUSES } from '../../config/statuses'
import BaseIcon from '../shared/BaseIcon.vue'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const volumeStore = useVolumeStore()

const sections = computed(() => manuscriptStore.sortedSections)
const volumes = computed(() => volumeStore.volumes)
const sectionCounts = computed(() => {
  let counts = {}
  let total = 0
  for (const section of sections.value) {
    const wc = getSectionWordCount(section.id)
    counts[section.id] = wc
    total += wc
  }
  return { counts, total }
})

function getSectionWordCount(sectionId) {
  const subsections = manuscriptStore.subsections.filter(s => s.sectionId === sectionId)
  let count = 0
  for (const subsection of subsections) {
    if (subsection.content) {
      count += subsection.content.split(/\s+/).filter(w => w.length > 0).length
    }
  }
  return count
}

function getStatusColor(status) {
  const statusObj = SECTION_STATUSES.find(s => s.value === status)
  return statusObj?.color || '#6b7280'
}

function getStatusLabel(status) {
  const statusObj = SECTION_STATUSES.find(s => s.value === status)
  return statusObj?.label || status
}

function getVolumeForSection(sectionId) {
  return volumeStore.getVolumeForSection(sectionId)
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
      <p class="text-xs text-text-hint mt-1">Your document at a glance</p>
    </div>

      <div v-if="sections.length === 0" class="flex-1 flex items-center justify-center p-8">
        <div class="text-center">
          <BaseIcon name="layout" :size="48" class="text-text-hint mx-auto mb-4" />
          <p class="text-text-hint font-ui text-sm mb-4">No sections yet. Create your first section to see the timeline.</p>
          <button 
            class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
            @click="openChapterManager"
          >
            Open Section Manager
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
          v-for="chapter in sections" 
          :key="chapter.id"
          class="w-64 shrink-0 bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden"
          :style="{ borderTopWidth: getVolumeForSection(chapter.id) ? '3px' : '1px', borderTopColor: getVolumeForSection(chapter.id)?.color || undefined }"
        >
          <div 
            class="p-3 border-b border-border-subtle"
            :style="{ borderLeftColor: getStatusColor(chapter.status), borderLeftWidth: '3px' }"
          >
              <h3 class="font-semibold text-text-primary font-ui truncate">
                {{ chapter.title || `Section ${chapter.order + 1}` }}
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
                  {{ sectionCounts.counts[chapter.id]?.toLocaleString() || 0 }} words
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

      <div v-if="sections.length > 0" class="p-3 border-t border-border-subtle text-center">
        <button 
          class="text-xs text-text-hint hover:text-accent font-ui"
          @click="openChapterManager"
        >
          Total: {{ sectionCounts.total.toLocaleString() }} words — Open Section Manager
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