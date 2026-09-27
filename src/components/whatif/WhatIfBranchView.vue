<script setup>
/**
 * One What If branch, start to finish (WHATIF-AND-IMPORT-PLAN.md, step 4):
 * the plan (keep / rewrite / drop for every scene after the change, all
 * editable), writing it, and comparing and merging chosen scenes back.
 */
import { ref, computed, watch } from 'vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseCheckbox from '../ui/BaseCheckbox.vue'
import BaseSpinner from '../ui/BaseSpinner.vue'
import { useWhatIfBranch } from '../../composables/useWhatIfBranch'
import { useBranchStore } from '../../stores/branchStore'
import { useProjectStore } from '../../stores/projectStore'
import { stripHtmlBlock } from '../../utils/textUtils'

const props = defineProps({ branchId: { type: [String, Number], required: true } })
const emit = defineEmits(['closed'])

const w = useWhatIfBranch()
const state = w.state
const branchStore = useBranchStore()
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.currentProjectId)

const branch = ref(null)
const plan = ref(null)
const rows = ref([])
const chosen = ref([])
const error = ref('')

const ACTIONS = [
  { value: 'keep', label: 'Keep' },
  { value: 'revise', label: 'Rewrite' },
  { value: 'drop', label: 'Drop' }
]
const OUTCOME = {
  written: 'rewritten',
  'written, repaired': 'rewritten, then repaired',
  'written, needs review': 'rewritten, needs review',
  failed: 'not written',
  kept: 'kept, consistent',
  repaired: 'kept, repaired',
  'needs review': 'kept, needs review',
  dropped: 'dropped'
}

const status = computed(() => branch.value?.whatIf?.status)
const counts = computed(() => {
  const s = plan.value?.scenes || []
  return {
    revise: s.filter((x) => x.action === 'revise').length,
    drop: s.filter((x) => x.action === 'drop').length,
    keep: s.filter((x) => x.action === 'keep').length
  }
})

async function load() {
  const list = await w.list(projectId.value)
  const found = list.find((b) => String(b.id) === String(props.branchId)) || null
  // Copied from the plain row: structuredClone refuses Vue's reactive proxy
  // (DataCloneError), which is how a saved plan once failed to appear.
  plan.value = found?.whatIf?.plan ? JSON.parse(JSON.stringify(found.whatIf.plan)) : null
  branch.value = found
  if (status.value === 'written' || status.value === 'merged') {
    rows.value = await w.compare(projectId.value, props.branchId)
    chosen.value = rows.value.filter((r) => r.action !== 'drop').map((r) => r.sourceId)
  }
}
watch(() => props.branchId, load, { immediate: true })
// A run started elsewhere (the panel's Plan a branch) ends while this view is
// open: show what it saved.
watch(
  () => state.busy,
  (busy) => {
    if (!busy) load()
  }
)

async function act(fn) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e?.message || String(e)
  }
  await load()
}

const makePlan = () => act(() => w.plan(projectId.value, props.branchId))
const persist = () => w.savePlan(props.branchId, JSON.parse(JSON.stringify(plan.value)))
const writeBranch = () =>
  act(async () => {
    await persist()
    await w.write(projectId.value, props.branchId)
  })
const merge = () =>
  act(async () => {
    await w.merge(projectId.value, props.branchId, chosen.value)
    const source = branch.value?.sourceBranchId
    if (source != null) await branchStore.switchTo(projectId.value, source)
  })
const openInEditor = () => branchStore.switchTo(projectId.value, props.branchId)
const recheck = () => act(() => w.recheck(projectId.value, props.branchId))
const remove = () =>
  act(async () => {
    if (!confirm('Delete this What If branch and everything written in it?')) return
    const source = branch.value?.sourceBranchId
    await branchStore.removeBranch(props.branchId)
    if (source != null) await branchStore.switchTo(projectId.value, source)
    emit('closed')
  })

const text = (html) => stripHtmlBlock(html || '')
</script>

<template>
  <div v-if="branch" data-test="what-if-branch">
    <BaseSection
      first
      :title="branch.name"
      :description="`Diverges at the scene you picked. ${branch.whatIf.premise}`"
    >
      <template #actions>
        <BaseButton variant="ghost" size="sm" icon="book-open" @click="openInEditor"
          >Open</BaseButton
        >
        <BaseButton
          variant="ghost"
          size="sm"
          icon="trash-2"
          aria-label="Delete branch"
          @click="remove"
        />
      </template>
      <BaseAlert v-if="error || state.error" variant="danger">{{ error || state.error }}</BaseAlert>
      <p
        v-if="state.busy"
        class="flex items-center gap-2 font-ui text-xs text-text-hint"
        role="status"
      >
        <BaseSpinner size="sm" :label="state.message" />
        {{ state.message }}<template v-if="state.detail"> · {{ state.detail }}</template>
      </p>
    </BaseSection>

    <!-- 1. Plan -->
    <BaseSection
      v-if="!plan"
      title="Plan"
      description="Versatile reads the story up to the change and decides, for every later scene, whether the change reaches it. You can change every decision before anything is written."
    >
      <div class="flex justify-end">
        <BaseButton
          variant="primary"
          size="md"
          icon="list-checks"
          :loading="state.busy"
          :disabled="state.busy"
          data-test="make-plan"
          @click="makePlan"
        >
          Plan the branch
        </BaseButton>
      </div>
    </BaseSection>

    <template v-else>
      <BaseSection
        title="The change"
        description="Stated as a fact. The writer treats it as true, and kept scenes are checked against it."
      >
        <textarea
          v-model="plan.divergenceFact"
          rows="2"
          :disabled="status !== 'planned' && status !== 'forked'"
          aria-label="The change, as a fact"
          class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          @change="persist"
        />
      </BaseSection>

      <BaseSection
        title="Scenes"
        :meta="`${counts.revise} rewrite · ${counts.drop} drop · ${counts.keep} keep`"
        description="From the scene of the change to the end of the book."
      >
        <ol class="divide-y divide-border-subtle" data-test="plan-rows">
          <li v-for="s in plan.scenes" :key="s.subsectionId" class="py-2 space-y-1.5">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-ui text-sm text-text-primary truncate">
                  <span class="font-mono text-xs text-text-hint tabular-nums">{{
                    s.sceneNumber
                  }}</span>
                  {{ s.title }}
                  <span class="text-text-hint"> · {{ s.chapterTitle }}</span>
                </p>
                <p v-if="s.summary" class="font-ui text-xs text-text-hint leading-5 line-clamp-2">
                  {{ s.summary }}
                </p>
                <p v-if="s.outcome" class="font-ui text-xs text-text-secondary">
                  {{ OUTCOME[s.outcome] || s.outcome }}
                </p>
              </div>
              <BaseSegmented
                v-model="s.action"
                :options="ACTIONS"
                size="sm"
                :disabled="status !== 'planned' || s.subsectionId === plan.divergence.subsectionId"
                :aria-label="`What happens to scene ${s.sceneNumber}`"
                @update:model-value="persist"
              />
            </div>
            <textarea
              v-if="s.action === 'revise'"
              v-model="s.brief"
              rows="2"
              :disabled="status !== 'planned'"
              :aria-label="`What scene ${s.sceneNumber} must now show`"
              class="w-full px-2 py-1.5 text-xs bg-bg-tertiary border border-border-subtle rounded-md text-text-secondary font-ui focus:outline-none focus:ring-1 focus:ring-accent resize-y"
              @change="persist"
            />
            <p
              v-if="s.reason && status === 'planned'"
              class="font-ui text-xs text-text-hint italic"
            >
              {{ s.reason }}
            </p>
          </li>
        </ol>
        <div v-if="status === 'planned'" class="mt-3 flex justify-end">
          <BaseButton
            variant="primary"
            size="md"
            icon="pen-line"
            :loading="state.busy"
            :disabled="state.busy"
            data-test="write-branch"
            @click="writeBranch"
          >
            Write the branch ({{ counts.revise }} scene{{ counts.revise === 1 ? '' : 's' }})
          </BaseButton>
        </div>
      </BaseSection>

      <!-- 3. Compare and merge -->
      <BaseSection
        v-if="status === 'written' || status === 'merged'"
        title="Compare and merge"
        :description="
          status === 'merged'
            ? 'Merged. The scenes it replaced are in each scene\'s history, and can be restored from there.'
            : 'Tick the scenes to bring into the book. Each one it replaces is saved to that scene\'s history first.'
        "
      >
        <p v-if="!rows.length" class="font-ui text-xs text-text-hint">Nothing changed.</p>
        <ul class="divide-y divide-border-subtle" data-test="compare-rows">
          <li v-for="r in rows" :key="r.branchId" class="py-2">
            <BaseCheckbox
              v-model="chosen"
              :value="r.sourceId"
              :disabled="status === 'merged'"
              :label="`${r.sceneNumber}. ${r.title}`"
              :description="
                r.action === 'drop' ? 'Removed from the book if merged' : OUTCOME[r.outcome] || ''
              "
            />
            <details class="mt-1 ml-6">
              <summary class="cursor-pointer font-ui text-xs text-text-hint">
                Before and after
              </summary>
              <div class="mt-1 grid gap-2 sm:grid-cols-2">
                <p
                  class="max-h-48 overflow-auto font-manuscript text-xs text-text-hint whitespace-pre-line leading-5"
                >
                  {{ text(r.before) || '—' }}
                </p>
                <p
                  class="max-h-48 overflow-auto font-manuscript text-xs text-text-secondary whitespace-pre-line leading-5"
                >
                  {{ r.action === 'drop' ? '(dropped)' : text(r.after) }}
                </p>
              </div>
            </details>
          </li>
        </ul>
        <div v-if="status === 'written'" class="mt-3 flex flex-wrap justify-end gap-2">
          <BaseButton
            variant="ghost"
            size="md"
            icon="scan-search"
            :disabled="state.busy"
            data-test="recheck"
            title="Check every scene after the change against it again, e.g. after editing"
            @click="recheck"
          >
            Check again
          </BaseButton>
          <BaseButton
            variant="primary"
            size="md"
            icon="git-merge"
            :loading="state.busy"
            :disabled="state.busy || !chosen.length"
            data-test="merge"
            @click="merge"
          >
            Bring {{ chosen.length }} scene{{ chosen.length === 1 ? '' : 's' }} into the book
          </BaseButton>
        </div>
      </BaseSection>
    </template>
  </div>
</template>
