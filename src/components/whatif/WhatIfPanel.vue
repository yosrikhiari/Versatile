<script setup>
import { ref, inject } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useWhatIf } from '../../composables/useWhatIf'
import BaseIcon from '../shared/BaseIcon.vue'

const manuscriptStore = useManuscriptStore()
const { isGenerating, alternatives, error, generateAlternatives, clear } = useWhatIf()
const insertAtCursor = inject('insertAtCursor', null)

async function handleGenerate() {
  const sub = manuscriptStore.activeSubsection
  if (!sub) return
  await generateAlternatives({
    sceneProse: sub.content || '',
    sceneBrief: sub.brief || {},
    chapterLog: getChapterLog()
  })
}

function getChapterLog() {
  return manuscriptStore.chapters?.flatMap((ch) => ch.subsections?.map((s) => s.title || s.content?.slice(0, 80)) || []) || []
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
  manuscriptStore.updateSubsectionData(manuscriptStore.activeSubsectionId, { content: prose })
}

function handleClear() {
  clear()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-3 border-b border-border-subtle">
      <h2 class="text-sm font-medium text-text-primary flex items-center gap-1.5">
        <BaseIcon name="shuffle" :size="14" />
        What If?
      </h2>
      <button
        v-if="alternatives.length"
        class="text-xs text-text-hint hover:text-text-secondary transition-colors"
        @click="handleClear"
      >
        Clear
      </button>
    </div>

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
          :class="isGenerating
            ? 'bg-accent/10 text-accent cursor-wait'
            : 'bg-accent text-white hover:bg-accent-dark active:bg-accent-darker'"
          :disabled="isGenerating"
          @click="handleGenerate"
        >
          <BaseIcon :name="isGenerating ? 'loader-2' : 'wand-2'" :size="14" :class="isGenerating ? 'animate-spin' : ''" />
          {{ isGenerating ? 'Generating...' : 'Generate Alternatives' }}
        </button>

        <div
          v-if="error"
          class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-xs text-red-700 dark:text-red-300"
        >
          {{ error }}
        </div>

        <div
          v-for="(alt, index) in alternatives"
          :key="index"
          class="rounded-lg border border-border-subtle bg-bg-primary overflow-hidden group"
        >
          <div class="flex items-center justify-between p-2.5 border-b border-border-subtle bg-bg-secondary/50">
            <span class="text-xs font-semibold text-text-primary truncate flex-1">
              {{ alt.title }}
            </span>
            <span
              v-if="alt.styleNote"
              class="text-[10px] text-text-hint ml-2 whitespace-nowrap"
            >
              {{ alt.styleNote }}
            </span>
          </div>
          <p class="text-xs text-text-secondary leading-relaxed p-2.5 line-clamp-4">
            {{ alt.prose }}
          </p>
          <div class="flex gap-1 p-2 border-t border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity">
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
          Generate alternative continuations<br>for the current scene.
        </div>
      </template>
    </div>
  </div>
</template>
