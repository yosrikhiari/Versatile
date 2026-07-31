<script setup>
import { ref, computed, inject } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useWhatIf } from '../../composables/useWhatIf'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import WhatIfTimeline from './WhatIfTimeline.vue'

const manuscriptStore = useManuscriptStore()
const { isGenerating, alternatives, error, generateAlternatives, clear } = useWhatIf()
const insertAtCursor = inject('insertAtCursor', null)

const mode = ref('alternatives')
const divergencePoint = ref(null)
const changeDescription = ref('')

const hasDivergence = computed(
  () => divergencePoint.value?.sectionId && divergencePoint.value?.subsectionId
)

const sourceSub = computed(() => {
  if (hasDivergence.value) {
    return manuscriptStore.subsections.find((s) => s.id === divergencePoint.value.subsectionId)
  }
  return manuscriptStore.activeSubsection
})

async function handleGenerate() {
  const sub = sourceSub.value
  if (!sub) return
  await generateAlternatives({
    sceneProse: sub.content || '',
    sceneBrief: sub.brief || {},
    chapterLog: getChapterLog()
  })
}

function getChapterLog() {
  return (
    manuscriptStore.sections?.flatMap(
      (ch) =>
        manuscriptStore.subsectionsBySection[ch.id]?.map(
          (s) => s.title || s.content?.slice(0, 80)
        ) || []
    ) || []
  )
}

function handleApply(index) {
  const prose = alternatives.value[index]?.prose
  if (!prose) return
  if (insertAtCursor) {
    insertAtCursor(`\n\n${prose}\n\n`)
  }
}

function handleReplace(index) {
  const prose = alternatives.value[index]?.prose
  if (!prose) return
  if (hasDivergence.value) {
    manuscriptStore.updateSubsectionData(divergencePoint.value.subsectionId, { content: prose })
  } else {
    manuscriptStore.updateSubsectionData(manuscriptStore.activeSubsectionId, { content: prose })
  }
}

function handleClear() {
  clear()
}

function handleSelectDivergence(selection) {
  divergencePoint.value = selection
  clear()
  mode.value = 'edit'
}

function handleChangePoint() {
  divergencePoint.value = null
  changeDescription.value = ''
  clear()
  mode.value = 'timeline'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <BasePanelHeader
      :title="mode === 'timeline' ? 'Divergence Point' : 'What If?'"
      :icon="mode === 'timeline' ? 'git-branch-plus' : 'shuffle'"
    >
      <template #actions>
        <button
          v-if="mode === 'alternatives'"
          class="rounded px-1.5 py-0.5 font-ui text-xs text-text-hint transition-colors hover:bg-surface-hover hover:text-text-secondary"
          @click="mode = 'timeline'"
        >
          Divergence
        </button>
        <button
          v-if="alternatives.length"
          class="rounded px-1.5 py-0.5 font-ui text-xs text-text-hint transition-colors hover:bg-surface-hover hover:text-text-secondary"
          @click="handleClear"
        >
          Clear
        </button>
      </template>
    </BasePanelHeader>

    <WhatIfTimeline
      v-if="mode === 'timeline'"
      :selected-section-id="divergencePoint?.sectionId"
      :selected-subsection-id="divergencePoint?.subsectionId"
      @select="handleSelectDivergence"
    />

    <template v-else-if="mode === 'edit'">
      <div class="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        <div class="flex items-center gap-2 text-xs text-text-secondary">
          <BaseIcon name="map-pin" :size="12" class="text-accent shrink-0" />
          <span class="truncate flex-1">
            Diverging from:
            <span class="text-text-primary font-medium">{{
              sourceSub?.title || sourceSub?.brief?.summary || 'selected scene'
            }}</span>
          </span>
          <button
            class="text-text-hint hover:text-text-secondary shrink-0 transition-colors"
            @click="handleChangePoint"
          >
            <BaseIcon name="pencil" :size="12" />
          </button>
        </div>

        <textarea
          v-model="changeDescription"
          placeholder="Describe the change — e.g. 'The protagonist refuses the call' or 'The storm hits earlier than expected'..."
          class="w-full min-h-[72px] resize-none rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-xs text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent/30"
        />

        <button
          class="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          :class="isGenerating ? 'bg-accent/10 text-accent cursor-wait' : 'btn-primary'"
          :disabled="isGenerating"
          @click="handleGenerate"
        >
          <BaseIcon
            :name="isGenerating ? 'loader-2' : 'wand-2'"
            :size="14"
            :class="isGenerating ? 'animate-spin' : ''"
          />
          {{ isGenerating ? 'Generating...' : 'Generate Alternatives' }}
        </button>

        <div
          v-if="error"
          class="rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
        >
          {{ error }}
        </div>

        <div
          v-for="(alt, index) in alternatives"
          :key="index"
          class="rounded-lg border border-border-subtle bg-bg-primary overflow-hidden group"
        >
          <div
            class="flex items-center justify-between p-2.5 border-b border-border-subtle bg-bg-secondary/50"
          >
            <span class="text-xs font-semibold text-text-primary truncate flex-1">
              {{ alt.title }}
            </span>
            <span v-if="alt.styleNote" class="text-2xs text-text-hint ml-2 whitespace-nowrap">
              {{ alt.styleNote }}
            </span>
          </div>
          <p class="text-xs text-text-secondary leading-relaxed p-2.5 line-clamp-4">
            {{ alt.prose }}
          </p>
          <div
            class="flex gap-1 p-2 border-t border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              class="flex-1 text-xs py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              @click="handleApply(index)"
            >
              Insert
            </button>
            <button
              class="flex-1 text-xs py-1 rounded bg-bg-secondary text-text-secondary hover:bg-border-subtle transition-colors"
              @click="handleReplace(index)"
            >
              Replace
            </button>
          </div>
        </div>

        <div
          v-if="!isGenerating && !alternatives.length"
          class="text-xs text-text-hint text-center py-8 leading-relaxed"
        >
          Describe the change and generate alternatives<br />for the selected divergence point.
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        <div
          v-if="!manuscriptStore.activeSubsection"
          class="text-xs text-text-hint text-center py-8"
        >
          Open a scene to use What If
        </div>

        <template v-else>
          <button
            class="w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            :class="isGenerating ? 'bg-accent/10 text-accent cursor-wait' : 'btn-primary'"
            :disabled="isGenerating"
            @click="handleGenerate"
          >
            <BaseIcon
              :name="isGenerating ? 'loader-2' : 'wand-2'"
              :size="14"
              :class="isGenerating ? 'animate-spin' : ''"
            />
            {{ isGenerating ? 'Generating...' : 'Generate Alternatives' }}
          </button>

          <div
            v-if="error"
            class="rounded-lg border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
          >
            {{ error }}
          </div>

          <div
            v-for="(alt, index) in alternatives"
            :key="index"
            class="rounded-lg border border-border-subtle bg-bg-primary overflow-hidden group"
          >
            <div
              class="flex items-center justify-between p-2.5 border-b border-border-subtle bg-bg-secondary/50"
            >
              <span class="text-xs font-semibold text-text-primary truncate flex-1">
                {{ alt.title }}
              </span>
              <span v-if="alt.styleNote" class="text-2xs text-text-hint ml-2 whitespace-nowrap">
                {{ alt.styleNote }}
              </span>
            </div>
            <p class="text-xs text-text-secondary leading-relaxed p-2.5 line-clamp-4">
              {{ alt.prose }}
            </p>
            <div
              class="flex gap-1 p-2 border-t border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <button
                class="flex-1 text-xs py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                @click="handleApply(index)"
              >
                Insert
              </button>
              <button
                class="flex-1 text-xs py-1 rounded bg-bg-secondary text-text-secondary hover:bg-border-subtle transition-colors"
                @click="handleReplace(index)"
              >
                Replace
              </button>
            </div>
          </div>

          <div
            v-if="!isGenerating && !alternatives.length"
            class="text-xs text-text-hint text-center py-8 leading-relaxed"
          >
            Generate alternative continuations<br />for the current scene.
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
