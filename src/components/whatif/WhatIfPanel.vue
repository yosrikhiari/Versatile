<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useWhatIf } from '../../composables/useWhatIf'
import { useWhatIfBranch } from '../../composables/useWhatIfBranch'
import { useProjectStore } from '../../stores/projectStore'
import { useBranchStore } from '../../stores/branchStore'
import { renderExtractedVoiceGuide } from '../../composables/useStoryDocuments'
import { addSnapshot } from '../../services/db-snapshots'
import { proseToHtml } from '../../composables/generation/writing/liveDraft'
import { stripHtmlBlock } from '../../utils/textUtils'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import WhatIfAlternative from './WhatIfAlternative.vue'
import WhatIfTimeline from './WhatIfTimeline.vue'
import WhatIfBranchView from './WhatIfBranchView.vue'

const manuscriptStore = useManuscriptStore()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const terms = computed(() => projectStore.structureTerms)
const branchStore = useBranchStore()
const branches = useWhatIfBranch()
const { isGenerating, alternatives, error, generateAlternatives, clear } = useWhatIf()
const insertAtCursor = inject('insertAtCursor', null)

/** alternatives | timeline (pick a scene) | edit (describe the change) | branches | branch */
const mode = ref('alternatives')
const divergencePoint = ref(null)
const changeDescription = ref('')
const branchError = ref(null)
const openBranchId = ref(null)
const whatIfBranches = ref([])

const hasDivergence = computed(
  () => divergencePoint.value?.sectionId && divergencePoint.value?.subsectionId
)

const sourceSub = computed(() => {
  if (hasDivergence.value) {
    return manuscriptStore.subsections.find((s) => s.id === divergencePoint.value.subsectionId)
  }
  return manuscriptStore.activeSubsection
})

async function refreshBranches() {
  const pid = projectStore.currentProjectId
  whatIfBranches.value = pid ? await branches.list(pid) : []
}
watch(() => projectStore.currentProjectId, refreshBranches, { immediate: true })

/** The scenes before `sub`, in reading order: what has happened so far. */
function storyBefore(sub) {
  const out = []
  for (const sec of manuscriptStore.sortedSections) {
    for (const s of manuscriptStore.subsectionsBySection[sec.id] || []) {
      if (s.id === sub?.id) return out.slice(-15)
      out.push(
        `${sec.title || ''} / ${s.title || 'Scene'}: ${s.summary || s.description || ''}`.trim()
      )
    }
  }
  return out.slice(-15)
}

async function handleGenerate() {
  const sub = sourceSub.value
  if (!sub) return
  await generateAlternatives({
    sceneProse: stripHtmlBlock(sub.content || ''),
    // The scene's brief is its `description` (and what it was read to be);
    // the panel used to read a `brief` field no scene has, so it sent nothing.
    sceneBrief: { intent: sub.description || '', summary: sub.summary || '' },
    // Only what happened BEFORE this scene. The old log was every scene title
    // in the book, the future included, under "what has happened before".
    chapterLog: storyBefore(sub),
    premise: changeDescription.value,
    voiceProfile: renderExtractedVoiceGuide(storyBibleStore.voiceProfile).join('\n')
  })
}

function handleApply(index) {
  const prose = alternatives.value[index]?.prose
  if (!prose) return
  if (insertAtCursor) {
    insertAtCursor(`\n\n${prose}\n\n`)
  }
}

async function handleReplace(index) {
  const prose = alternatives.value[index]?.prose
  const sub = sourceSub.value
  if (!prose || !sub) return
  if (
    !confirm(
      `Replace "${sub.title || 'this scene'}" with this version? The current text is saved to its history first.`
    )
  )
    return
  // Snapshot, then HTML: the old Replace wrote plain text into an HTML field
  // with no way back.
  if (sub.content)
    await addSnapshot(
      projectStore.currentProjectId,
      sub.id,
      sub.content,
      'Before What If alternative'
    )
  await manuscriptStore.updateSubsectionData(sub.id, { content: proseToHtml(prose) })
}

function handleClear() {
  clear()
}

/** Fork the book at the chosen scene and plan the branch. */
async function handlePlanBranch() {
  const projectId = projectStore.currentProjectId
  const sub = sourceSub.value
  if (!projectId || !sub || !changeDescription.value.trim() || branches.state.busy) return
  branchError.value = null
  try {
    const branch = await branches.fork(
      projectId,
      branchStore.activeBranchId,
      sub.id,
      changeDescription.value.trim()
    )
    await refreshBranches()
    openBranch(branch.id)
    // The open branch view reloads itself when the plan is saved.
    await branches.plan(projectId, branch.id)
  } catch (e) {
    branchError.value = e?.message || 'The branch could not be created'
  }
}

function openBranch(id) {
  openBranchId.value = id
  mode.value = 'branch'
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

const STATUS = {
  forked: 'not planned',
  planned: 'planned',
  writing: 'writing',
  written: 'written',
  merged: 'merged'
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
          v-if="mode === 'alternatives' || mode === 'branch'"
          variant="ghost"
          size="sm"
          icon="git-branch-plus"
          @click="mode = 'timeline'"
        >
          Diverge
        </BaseButton>
        <BaseButton
          v-if="whatIfBranches.length && mode !== 'branches'"
          variant="ghost"
          size="sm"
          icon="git-branch"
          data-test="what-if-branches"
          @click="
            () => {
              refreshBranches()
              mode = 'branches'
            }
          "
        >
          Branches ({{ whatIfBranches.length }})
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
      <!-- ── One branch: plan, write, compare, merge ──────────────────── -->
      <WhatIfBranchView
        v-if="mode === 'branch' && openBranchId != null"
        :key="openBranchId"
        :branch-id="openBranchId"
        @closed="
          () => {
            refreshBranches()
            mode = 'alternatives'
          }
        "
      />

      <!-- ── Every What If branch of the book ─────────────────────────── -->
      <BaseSection
        v-else-if="mode === 'branches'"
        first
        title="What If branches"
        description="Each one is a copy of the book that changes at one scene. Open one to plan, write, compare or merge it."
      >
        <ul class="divide-y divide-border-subtle">
          <li v-for="b in whatIfBranches" :key="b.id">
            <button
              class="w-full text-left py-2 font-ui text-sm text-text-primary hover:text-accent transition-colors"
              @click="openBranch(b.id)"
            >
              {{ b.name }}
              <span class="block font-ui text-xs text-text-hint">
                {{ STATUS[b.whatIf.status] || b.whatIf.status }}
              </span>
            </button>
          </li>
        </ul>
      </BaseSection>

      <!-- ── Diverging from a chosen point ────────────────────────────── -->
      <template v-else-if="mode === 'edit'">
        <BaseSection
          first
          title="The change"
          description="What happens differently at this scene. A branch rewrites only the later scenes the change reaches; alternatives rewrite this scene alone."
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
                <span class="text-text-primary">{{ sourceSub?.title || 'selected scene' }}</span>
              </span>
            </p>

            <textarea
              v-model="changeDescription"
              rows="3"
              autofocus
              aria-label="What changes"
              placeholder="e.g. What if Zeena never goes to Bettsbridge?"
              class="w-full px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-hint font-ui focus:outline-hidden focus:ring-1 focus:ring-accent focus:border-accent resize-y transition-colors duration-150"
            />

            <BaseAlert v-if="error" variant="danger">{{ error }}</BaseAlert>
            <BaseAlert v-if="branchError" variant="danger">{{ branchError }}</BaseAlert>

            <div class="flex flex-wrap items-center justify-end gap-2">
              <BaseButton
                variant="secondary"
                size="md"
                icon="git-branch-plus"
                :loading="branches.state.busy"
                :disabled="branches.state.busy || isGenerating || !changeDescription.trim()"
                :title="
                  changeDescription.trim()
                    ? 'Copy the book into a branch and plan which later scenes the change reaches'
                    : 'Describe the change first'
                "
                data-test="plan-branch"
                @click="handlePlanBranch"
              >
                {{ branches.state.busy ? branches.state.message : 'Plan a branch' }}
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
          </div>
        </BaseSection>
      </template>

      <!-- ── Alternatives for the current scene ───────────────────────── -->
      <template v-else>
        <BaseSection
          first
          title="Alternatives"
          description="Other ways the current scene could go, in the manuscript's voice."
        >
          <p
            v-if="!manuscriptStore.activeSubsection"
            class="font-ui text-xs text-text-hint leading-5"
          >
            What If branches from a single {{ terms.subsectionLc }}. Open one from
            <span class="text-text-secondary">{{ terms.sections }}</span> in the sidebar to begin.
          </p>
          <div v-else class="space-y-3">
            <textarea
              v-model="changeDescription"
              rows="2"
              aria-label="What if (optional)"
              placeholder="What if… (optional)"
              class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-hint font-ui focus:outline-hidden focus:ring-1 focus:ring-accent resize-y"
            />
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

      <!-- ── Results ──────────────────────────────────────────────────── -->
      <div
        v-if="alternatives.length && (mode === 'alternatives' || mode === 'edit')"
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
        v-else-if="
          !isGenerating &&
          (mode === 'edit' || (mode === 'alternatives' && manuscriptStore.activeSubsection))
        "
        class="px-4 py-6 font-ui text-xs text-text-hint leading-5 border-t border-border-subtle"
      >
        {{
          mode === 'edit'
            ? 'Describe the change, then plan a branch, or generate alternatives for this scene.'
            : 'Nothing generated yet. Alternatives appear here; insert one at the cursor or replace the scene with it.'
        }}
      </p>
    </div>
  </div>
</template>
