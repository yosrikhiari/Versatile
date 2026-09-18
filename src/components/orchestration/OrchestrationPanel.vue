<script setup>
import { computed, onMounted, ref } from 'vue'
import { useSettingsStore } from '../../stores/settingsStore'
import { useOrchestrationStore } from '../../stores/orchestrationStore'
import { getAvailableModels } from '../../services/ollamaService'
import {
  MULTI_AGENT_PRESET,
  ROLE_NAMES,
  applyRolePreset,
  getRolePlacement,
  placementProblems,
  resetRolePlacements,
  setRolePlacement
} from '../../config/roles'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseChip from '../ui/BaseChip.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import BaseStatusDot from '../ui/BaseStatusDot.vue'
import EmptyState from '../shared/EmptyState.vue'

const emit = defineEmits(['navigate'])
const settings = useSettingsStore()
const live = useOrchestrationStore()

// ── Settings that shape the next run ─────────────────────────────────────
const ORCHESTRATORS = [
  { value: 'legacy', label: 'Legacy' },
  { value: 'langgraph', label: 'LangGraph', icon: 'workflow' }
]
const MODES = [
  { value: 'workflow', label: 'Workflow' },
  { value: 'agentic', label: 'Agentic', icon: 'sparkles' }
]
const DEVICES = [
  { value: 'gpu', label: 'GPU' },
  { value: 'cpu', label: 'CPU' }
]

const ROLE_META = {
  writer: { label: 'Writer', what: 'drafts the prose', lane: 'gpu' },
  director: { label: 'Director', what: 'plans structure and spine', lane: 'gpu' },
  critic: { label: 'Critic', what: 'judges each draft', lane: 'cpu' },
  editor: { label: 'Editor', what: 'chooses the next move (agentic)', lane: 'cpu' },
  utility: { label: 'Utility', what: 'metadata, titles, short JSON', lane: 'gpu' },
  embedding: { label: 'Embedder', what: 'retrieval embeddings', lane: 'cpu' }
}
const EDITABLE_ROLES = ROLE_NAMES.filter((r) => r !== 'utility')

const availableModels = ref([])
const placements = ref({})
const issues = ref([])

function refreshPlacement() {
  const next = {}
  for (const role of ROLE_NAMES) next[role] = getRolePlacement(role)
  placements.value = next
  issues.value = placementProblems()
}

function savePlacement(role) {
  const pl = placements.value[role]
  setRolePlacement(role, { model: pl.model || null, device: pl.device })
  refreshPlacement()
}

function applyPreset() {
  applyRolePreset(MULTI_AGENT_PRESET)
  refreshPlacement()
}

function resetPlacement() {
  resetRolePlacements()
  refreshPlacement()
}

const modelOptions = computed(() => availableModels.value.map((m) => ({ value: m, label: m })))

onMounted(async () => {
  refreshPlacement()
  availableModels.value = await getAvailableModels()
})

// ── The live run ─────────────────────────────────────────────────────────
const run = computed(() => live.run)
const isGraph = computed(() => settings.orchestrator === 'langgraph')

const headerMeta = computed(() => {
  if (!isGraph.value) return 'Legacy'
  const mode = settings.orchestratorMode === 'agentic' ? 'agentic' : 'workflow'
  return live.active ? `step ${run.value.step} · ${mode}` : `LangGraph · ${mode}`
})

function laneFor(role) {
  const rt = run.value.roles?.[role]
  return rt ? rt.device : placements.value[role]?.device || ROLE_META[role].lane
}

function modelFor(role) {
  const rt = run.value.roles?.[role]
  if (rt?.model) return rt.model
  const pl = placements.value[role]
  if (pl?.model) return pl.model
  if (role === 'embedding') return settings.embeddingModel
  return role === 'writer' || role === 'director'
    ? settings.ollamaModel || 'prose model'
    : 'utility model'
}

/** What a role is doing now, from the lane it lives on. */
function activityFor(role) {
  if (!live.active) return null
  const lane = run.value.lanes[laneFor(role)]
  if (!lane || lane.kind === 'idle' || lane.role !== role) return null
  const verb = { draft: 'Drafting', revise: 'Revising', critique: 'Judging' }[lane.kind]
  const attempt = lane.attempt && lane.attempt > 1 ? ` (attempt ${lane.attempt})` : ''
  return `${verb} “${lane.sceneTitle || `scene ${(lane.sceneIndex ?? 0) + 1}`}”${attempt}`
}

function roleTone(role) {
  return activityFor(role) ? 'var(--vers-accent)' : 'var(--vers-text-muted)'
}

const STATUS_COLOR = {
  planned: 'neutral',
  drafting: 'accent',
  drafted: 'info',
  critiquing: 'accent',
  critiqued: 'info',
  committed: 'success',
  failed: 'danger'
}

const recentDecisions = computed(() => run.value.decisions.slice(-8).reverse())

function describeAction(a) {
  if (!a) return '—'
  if (a.target == null) return a.action
  return `${a.action} #${a.target + 1}`
}

const SOURCE_COLOR = { model: 'accent', workflow: 'neutral', fallback: 'warning' }

const elapsed = computed(() => {
  if (!run.value.startedAt) return ''
  const end = run.value.finishedAt ?? Date.now()
  const min = Math.round((end - run.value.startedAt) / 60000)
  return `${min} min`
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden" data-test="orchestration-panel">
    <BasePanelHeader title="Agents" icon="workflow" :meta="headerMeta" />

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      <BaseSection
        title="Orchestrator"
        description="How a one-click run is driven. Takes effect on the next run."
        first
      >
        <div class="space-y-3">
          <BaseSegmented
            :model-value="settings.orchestrator"
            :options="ORCHESTRATORS"
            size="sm"
            block
            aria-label="Orchestrator"
            data-test="orchestrator-segmented"
            @update:model-value="settings.setOrchestrator($event)"
          />
          <BaseSegmented
            :model-value="settings.orchestratorMode"
            :options="MODES"
            size="sm"
            block
            aria-label="Editor mode"
            :disabled="!isGraph"
            data-test="mode-segmented"
            @update:model-value="settings.setOrchestratorMode($event)"
          />
          <p class="font-ui text-11px leading-4 text-text-hint text-pretty">
            <template v-if="isGraph">
              Writer and Critic run on separate device lanes; the Critic judges scene N while the
              Writer drafts N+1.
              <strong>Workflow</strong> follows the fixed order; <strong>Agentic</strong> lets the
              Editor model choose among the legal moves.
            </template>
            <template v-else>
              The parallel strategy: anchors first, then middle scenes in waves, one model for every
              role.
            </template>
          </p>
        </div>
      </BaseSection>

      <BaseSection
        title="Agents"
        description="Which model each role runs, where, and what it is doing now. Placement changes apply to the next call."
        :meta="live.active ? 'live' : ''"
      >
        <BaseAlert
          v-for="(issue, i) in issues"
          :key="i"
          :variant="issue.level === 'error' ? 'danger' : 'warning'"
          class="mb-3"
          data-test="placement-issue"
        >
          {{ issue.message }}
        </BaseAlert>

        <ul class="divide-y divide-border-subtle -mx-1">
          <li
            v-for="role in EDITABLE_ROLES"
            :key="role"
            class="px-1 py-2.5 space-y-2"
            :data-test="'agent-' + role"
          >
            <div class="flex items-start gap-2">
              <BaseStatusDot
                :color="roleTone(role)"
                :shape="activityFor(role) ? 'target' : 'solid'"
                class="mt-1"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <span class="font-ui text-xs text-text-primary">{{ ROLE_META[role].label }}</span>
                  <span class="font-ui text-11px text-text-hint">{{ ROLE_META[role].what }}</span>
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <BaseChip size="sm" color="neutral">{{ modelFor(role) }}</BaseChip>
                  <BaseChip size="sm" :color="laneFor(role) === 'cpu' ? 'info' : 'accent'">
                    {{ laneFor(role).toUpperCase() }}
                  </BaseChip>
                  <span
                    v-if="activityFor(role)"
                    class="font-ui text-11px text-accent"
                    data-test="agent-activity"
                    >{{ activityFor(role) }}</span
                  >
                </div>
              </div>
            </div>
            <div v-if="role !== 'embedding'" class="grid grid-cols-[1fr_5.5rem] gap-2 pl-5">
              <BaseSelect
                v-if="placements[role]"
                v-model="placements[role].model"
                :options="modelOptions"
                placeholder="Inherit"
                size="sm"
                :aria-label="ROLE_META[role].label + ' model'"
                @update:model-value="savePlacement(role)"
              />
              <BaseSelect
                v-if="placements[role]"
                v-model="placements[role].device"
                :options="DEVICES"
                size="sm"
                :aria-label="ROLE_META[role].label + ' device'"
                @update:model-value="savePlacement(role)"
              />
            </div>
            <div v-else class="pl-5">
              <BaseSelect
                v-if="placements[role]"
                v-model="placements[role].device"
                :options="DEVICES"
                size="sm"
                :aria-label="ROLE_META[role].label + ' device'"
                hint="The model comes from the embedding settings."
                @update:model-value="savePlacement(role)"
              />
            </div>
          </li>
        </ul>
        <div class="mt-3 flex gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            icon="wand-sparkles"
            data-test="apply-preset"
            @click="applyPreset"
          >
            Multi-agent preset
          </BaseButton>
          <BaseButton variant="ghost" size="sm" @click="resetPlacement">Reset</BaseButton>
        </div>
      </BaseSection>

      <BaseSection
        v-if="isGraph"
        title="Now"
        :description="live.active ? 'The current superstep.' : 'The last run.'"
        :meta="elapsed"
        dense
      >
        <template v-if="run.runId">
          <dl class="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 font-ui text-xs">
            <dt class="label-micro text-text-hint">GPU lane</dt>
            <dd class="text-text-primary" data-test="lane-gpu">
              {{
                run.lanes.gpu.kind === 'idle'
                  ? 'idle'
                  : `${run.lanes.gpu.kind} “${run.lanes.gpu.sceneTitle}”`
              }}
            </dd>
            <dt class="label-micro text-text-hint">CPU lane</dt>
            <dd class="text-text-primary" data-test="lane-cpu">
              {{
                run.lanes.cpu.kind === 'idle'
                  ? 'idle'
                  : `${run.lanes.cpu.kind} “${run.lanes.cpu.sceneTitle}”`
              }}
            </dd>
            <dt class="label-micro text-text-hint">Status</dt>
            <dd class="text-text-primary">
              {{
                run.error
                  ? `failed — ${run.error}`
                  : run.finishedAt
                    ? 'finished'
                    : `running, step ${run.step}`
              }}
            </dd>
          </dl>
          <p
            v-for="(w, i) in run.warnings"
            :key="i"
            class="mt-2 font-ui text-11px leading-4 text-warning"
          >
            ⚠ {{ w }}
          </p>
        </template>
        <EmptyState
          v-else
          icon="workflow"
          title="No graph run yet"
          description="Start a one-click generation and the lanes, scenes and the Editor's decisions show up here as they happen."
          action-label="Open the generator"
          action-icon="sparkles"
          @action="emit('navigate', 'story-generator')"
        />
      </BaseSection>

      <BaseSection
        v-if="isGraph && run.scenes.length"
        title="Scenes"
        :meta="`${run.scenes.filter((s) => s.status === 'committed').length}/${run.scenes.length}`"
        dense
      >
        <ul class="space-y-1.5" data-test="scene-list">
          <li
            v-for="s in run.scenes"
            :key="s.index"
            class="flex items-center gap-2 font-ui text-xs"
          >
            <span class="w-5 tabular-nums text-text-hint">{{ s.index + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-text-primary">{{ s.title }}</span>
            <span v-if="s.score != null" class="tabular-nums text-text-hint">{{ s.score }}</span>
            <BaseChip size="sm" :color="STATUS_COLOR[s.status] || 'neutral'">{{
              s.status
            }}</BaseChip>
          </li>
        </ul>
      </BaseSection>

      <BaseSection
        v-if="isGraph && recentDecisions.length"
        title="Decisions"
        description="What the Editor chose each step and who decided: the model, the workflow order, or the fallback after a rejected answer."
        dense
      >
        <ol class="space-y-2" data-test="decision-list">
          <li
            v-for="(d, i) in recentDecisions"
            :key="i"
            class="font-ui text-11px leading-4 text-text-primary"
          >
            <div class="flex items-center gap-1.5">
              <BaseChip size="sm" :color="SOURCE_COLOR[d.source] || 'neutral'">{{
                d.source
              }}</BaseChip>
              <span class="tabular-nums">gpu: {{ describeAction(d.gpu) }}</span>
              <span class="text-text-hint">·</span>
              <span class="tabular-nums">cpu: {{ describeAction(d.cpu) }}</span>
            </div>
            <p class="mt-0.5 text-text-hint text-pretty">
              {{ d.why }}<template v-if="d.rejected"> — rejected: {{ d.rejected.reason }}</template>
            </p>
          </li>
        </ol>
      </BaseSection>
    </div>
  </div>
</template>
