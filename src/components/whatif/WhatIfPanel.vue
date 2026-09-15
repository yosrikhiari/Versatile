<script setup>
import { ref, computed, inject } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useWhatIf } from '../../composables/useWhatIf'
import { useWhatIfGenerator } from '../../composables/useWhatIfGenerator'
import { useProjectStore } from '../../stores/projectStore'
import { useBranchStore } from '../../stores/branchStore'
import { renderExtractedVoiceGuide } from '../../composables/useStoryDocuments'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import WhatIfAlternative from './WhatIfAlternative.vue'
import WhatIfTimeline from './WhatIfTimeline.vue'

const manuscriptStore = useManuscriptStore()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const branchStore = useBranchStore()
const {
  isGenerating: isForking,
  progress: forkProgress,
  generate: forkGenerate
} = useWhatIfGenerator()
const forkError = ref(null)
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
    chapterLog: getChapterLog(),
    // The whole point of the feature. Collected by the textarea below and, until
    // now, never sent — so the author typed a premise and got alternatives that
    // ignored it.
    premise: changeDescription.value,
    // An alternative is meant to replace this scene, so it has to sound like the
    // same author. This is the same measured profile the main writer now gets.
    voiceProfile: renderExtractedVoiceGuide(storyBibleStore.voiceProfile).join('\n')
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

// Forking rewrites every scene after the divergence point onto a new branch. It
// is reversible (the original branch is untouched) but it is not cheap, so it is
// a separate, explicitly-labelled action rather than something "Generate" does.
async function handleFork() {
  const projectId = projectStore.currentProjectId
  if (!projectId || !changeDescription.value.trim() || isForking.value) return
  forkError.value = null
  try {
    await forkGenerate(projectId, branchStore.activeBranchId, changeDescription.value.trim())
  } catch (e) {
    forkError.value = typeof e === 'string' ? e : e?.message || 'Branch generation failed'
  }
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
      :title="mode === 'timeline' ? 'Divergence point' : 'What If'"
      :icon="mode === 'timeline' ? 'git-branch-plus' : 'shuffle'"
      :meta="alternatives.length ? `${alternatives.length} alternatives` : ''"
    >
      <template #actions>
        <BaseButton
          v-if="mode === 'alternatives'"
          variant="ghost"
          size="sm"
          icon="git-branch-plus"
          @click="mode = 'timeline'"
        >
          Diverge
        </BaseButton>
        <BaseButton v-if="alternatives.length" variant="ghost" size="sm" @click="handleClear">
          Clear
        </BaseButton>
      </template>
    </BasePanelHeader>

    <WhatIfTimeline
      v-if="mode === 'timeline'"
      :selected-section-id="divergencePoint?.sectionId"
      :selected-subsection-id="divergencePoint?.subsectionId"
      @select="handleSelectDivergence"
    />

    <div v-else class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <!-- ── Diverging from a chosen point ────────────────────────────── -->
      <template v-if="mode === 'edit'">
        <BaseSection
          first
          title="The change"
          description="What happens differently at this point. Everything after it is rewritten around that."
        >
          <template #actions>
            <BaseButton variant="ghost" size="sm" icon="pencil" @click="handleChangePoint">
              Change point
            </BaseButton>
          </template>

          <div class="space-y-3">
            <p class="flex items-center gap-2 font-ui text-xs text-text-hint">
              <BaseIcon name="map-pin" :size="12" class="shrink-0" />
              <span class="truncate">
                Diverging from
                <span class="text-text-primary">{{
                  sourceSub?.title || sourceSub?.brief?.summary || 'selected scene'
                }}</span>
              </span>
            </p>

            <textarea
              v-model="changeDescription"
              rows="3"
              autofocus
              placeholder="e.g. Nesrin refuses Halim's terms at the lake and hires her own guide."
              class="w-full px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-hint font-ui focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent resize-y transition-colors duration-150"
            />

            <BaseAlert v-if="error" variant="danger">{{ error }}</BaseAlert>
            <BaseAlert v-if="forkError" variant="danger">{{ forkError }}</BaseAlert>

            <div class="flex flex-wrap items-center justify-end gap-2">
              <!-- The heavier sibling: rewrites the rest of the story on a new
                   branch instead of offering replacements for this one scene. -->
              <BaseButton
                variant="secondary"
                size="md"
                icon="git-branch-plus"
                :loading="isForking"
                :disabled="isForking || isGenerating || !changeDescription.trim()"
                :title="
                  changeDescription.trim()
                    ? 'Fork a new branch and rewrite every scene after this point'
                    : 'Describe the change first'
                "
                @click="handleFork"
              >
                {{
                  isForking
                    ? forkProgress.label || 'Building branch'
                    : 'Rewrite the rest as a branch'
                }}
              </BaseButton>
              <BaseButton
                variant="primary"
                size="md"
                icon="wand-2"
                :loading="isGenerating"
                :disabled="isGenerating"
                @click="handleGenerate"
              >
                {{ isGenerating ? 'Generating' : 'Generate alternatives' }}
              </BaseButton>
            </div>
            <p
              v-if="isForking && forkProgress.total > 0"
              class="font-ui text-xs text-text-hint text-right tabular-nums"
            >
              {{ forkProgress.current }} / {{ forkProgress.total }} scenes rewritten
            </p>
          </div>
        </BaseSection>
      </template>

      <!-- ── Alternatives for the current scene ───────────────────────── -->
      <template v-else>
        <BaseSection
          first
          title="Alternatives"
          description="Three ways the current scene could continue, in the manuscript's voice."
        >
          <p
            v-if="!manuscriptStore.activeSubsection"
            class="font-ui text-xs text-text-hint leading-5"
          >
            What If branches from a single subsection. Open one from
            <span class="text-text-secondary">Sections</span> in the sidebar to begin.
          </p>
          <div v-else class="space-y-3">
            <BaseAlert v-if="error" variant="danger">{{ error }}</BaseAlert>
            <div class="flex justify-end">
              <BaseButton
                variant="primary"
                size="md"
                icon="wand-2"
                :loading="isGenerating"
                :disabled="isGenerating"
                @click="handleGenerate"
              >
                {{ isGenerating ? 'Generating' : 'Generate alternatives' }}
              </BaseButton>
            </div>
          </div>
        </BaseSection>
      </template>

      <!-- ── Results (both modes) ─────────────────────────────────────── -->
      <div
        v-if="alternatives.length"
        class="px-4 border-t border-border-subtle divide-y divide-border-subtle"
      >
        <WhatIfAlternative
          v-for="(alt, index) in alternatives"
          :key="index"
          :alt="alt"
          :index="index"
          @insert="handleApply"
          @replace="handleReplace"
        />
      </div>
      <p
        v-else-if="!isGenerating && (mode === 'edit' || manuscriptStore.activeSubsection)"
        class="px-4 py-6 font-ui text-xs text-text-hint leading-5 border-t border-border-subtle"
      >
        {{
          mode === 'edit'
            ? 'Describe the change, then generate to see how the scene could go instead.'
            : 'Nothing generated yet. Alternatives appear here; insert one at the cursor or replace the scene with it.'
        }}
      </p>
    </div>
  </div>
</template>
