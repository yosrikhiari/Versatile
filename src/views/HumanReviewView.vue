<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseAlert from '../components/ui/BaseAlert.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import BaseSection from '../components/ui/BaseSection.vue'
import BaseSegmented from '../components/ui/BaseSegmented.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseSpinner from '../components/ui/BaseSpinner.vue'
import { useHumanReviewStore } from '../stores/humanReviewStore'
import { RUBRIC_DIMENSIONS } from '../services/humanReviewPack'
import { downloadHumanReviewExport } from '../services/humanReviewExport'

const router = useRouter()
const store = useHumanReviewStore()

const fileInput = ref(null)
const selectedStudyId = ref(null)
const raterId = ref('')
const passLabel = ref('Pass 1')
const importing = ref(false)
const saving = ref(false)
const exportedNotice = ref('')
const draft = ref({ overall: null, dims: {}, note: '' })

const OVERALL_OPTIONS = [
  { value: 'Keep', label: 'Keep' },
  { value: 'Revise', label: 'Revise' }
]
const MARK_OPTIONS = [
  { value: 'Problem', label: 'Problem' },
  { value: 'Fine', label: 'Fine' },
  { value: 'Unsure', label: 'Unsure' }
]

const DIMENSIONS = [
  {
    key: 'continuity',
    label: 'Continuity',
    hint: 'A sentence states something that cannot be true given the listed facts, or given an earlier sentence in this scene.'
  },
  {
    key: 'voice',
    label: 'Voice',
    hint: 'Six or more lines of dialogue, most of which could be swapped between speakers without a reader noticing. Use Unsure with a note for N/A.'
  },
  {
    key: 'show_tell',
    label: 'Show vs tell',
    hint: 'Two or more passages report what happened or name a feeling at a moment that matters instead of showing it.'
  },
  {
    key: 'pacing',
    label: 'Pacing',
    hint: 'Two or more paragraphs could be deleted without losing anything the plot, a character or the tension needs.'
  },
  {
    key: 'emotional_goal',
    label: 'Emotional goal',
    hint: 'After reading, you do not feel roughly the stated emotional goal, or feel it only because the text says so.'
  }
]

const studyOptions = computed(() =>
  store.studies.map((study) => ({
    value: study.id,
    label: `${study.title} · ${study.scenes.length} scenes`
  }))
)
const selectedStudy = computed(
  () => store.studies.find((study) => study.id === selectedStudyId.value) || null
)
const currentScene = computed(() => store.currentScene)
const currentNumber = computed(() =>
  store.currentSceneIndex >= 0 ? store.currentSceneIndex + 1 : store.sceneOrder.length
)
const totalScenes = computed(() => store.sceneOrder.length)
const allAnswered = computed(
  () =>
    !!draft.value.overall && RUBRIC_DIMENSIONS.every((dimension) => !!draft.value.dims[dimension])
)
const sessionsView = computed(() =>
  store.sessions.map((session) => {
    const study = store.studies.find((item) => item.id === session.studyRecordId)
    return {
      ...session,
      total: study?.scenes.length || 12,
      answered: store.sessionProgress[session.id] || 0
    }
  })
)

function backToWorkspace() {
  router.push('/workspace')
}

function openFilePicker() {
  fileInput.value?.click()
}

async function onFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  importing.value = true
  exportedNotice.value = ''
  try {
    const text = await file.text()
    const study = await store.importStudy(text)
    selectedStudyId.value = study.id
  } catch {
    // The store exposes the validation message in `error`.
  } finally {
    importing.value = false
    event.target.value = ''
  }
}

function resetDraft() {
  draft.value = { overall: null, dims: {}, note: '' }
}

async function startSession() {
  if (!selectedStudyId.value || !raterId.value.trim()) return
  exportedNotice.value = ''
  try {
    await store.startSession({
      studyRecordId: selectedStudyId.value,
      raterId: raterId.value,
      passLabel: passLabel.value
    })
    resetDraft()
  } catch {
    // Store error is rendered.
  }
}

async function resumeSession(sessionId) {
  exportedNotice.value = ''
  try {
    await store.resumeSession(sessionId)
    resetDraft()
  } catch {
    // Store error is rendered.
  }
}

async function saveAndNext() {
  if (saving.value || !allAnswered.value) return
  saving.value = true
  const sceneId = currentScene.value?.sceneId
  try {
    await store.saveDraft(draft.value, sceneId)
    resetDraft()
  } catch {
    // Store error is rendered.
  } finally {
    saving.value = false
  }
}

async function exportSession(sessionId) {
  try {
    const data = await store.exportSession(sessionId)
    downloadHumanReviewExport(data)
    exportedNotice.value = `Exported ${data.labels.length} labels for ${data.raterId} (${data.pass}).`
  } catch {
    // Store error is rendered.
  }
}

async function removeSession(sessionId) {
  const ok = window.confirm(
    'Delete this local review session and its labels? Export it first if you need it.'
  )
  if (!ok) return
  try {
    await store.removeSession(sessionId)
  } catch {
    // Store error is rendered.
  }
}

onMounted(() => {
  store.load().then(() => {
    if (!selectedStudyId.value && store.studies.length === 1) {
      selectedStudyId.value = store.studies[0].id
    }
  })
})
</script>

<template>
  <div class="min-h-screen bg-bg-primary text-text-primary">
    <header class="border-b border-border-subtle bg-bg-secondary/70 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div class="flex min-w-0 items-center gap-3">
          <BaseButton variant="ghost" size="sm" icon="arrow-left" @click="backToWorkspace">
            Workspace
          </BaseButton>
          <div class="min-w-0">
            <h1 class="type-display truncate text-sm">Review study</h1>
            <p class="truncate text-11px text-text-hint">
              Frozen rubric v1 · local only · no critic or gate output
            </p>
          </div>
        </div>
        <div v-if="store.activeSession" class="flex items-center gap-2">
          <span class="label-micro text-text-hint"> {{ currentNumber }} / {{ totalScenes }} </span>
          <BaseButton variant="secondary" size="sm" @click="store.leaveSession()">
            Sessions
          </BaseButton>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6">
      <div class="space-y-4">
        <BaseAlert v-if="store.error" variant="danger" title="Review study">
          {{ store.error }}
        </BaseAlert>
        <BaseAlert v-if="exportedNotice" variant="success" title="Export ready">
          {{ exportedNotice }}
        </BaseAlert>

        <div v-if="store.loading" class="flex items-center gap-2 py-8 text-xs text-text-hint">
          <BaseSpinner size="sm" />
          Loading study data…
        </div>

        <template v-else-if="store.activeSession">
          <template v-if="store.isComplete">
            <BaseSection title="Study complete" first>
              <div class="space-y-3">
                <BaseAlert variant="success" title="All scenes labelled">
                  {{ store.activeStudy?.title }} · {{ store.activeSession.raterId }} ·
                  {{ store.activeSession.passLabel }}. Export the raw JSON for agreement analysis.
                  Nothing was sent to a server.
                </BaseAlert>
                <div class="flex flex-wrap gap-2">
                  <BaseButton
                    variant="primary"
                    icon="download"
                    @click="exportSession(store.activeSession.id)"
                  >
                    Export rater labels
                  </BaseButton>
                  <BaseButton variant="secondary" @click="store.leaveSession()">
                    Back to sessions
                  </BaseButton>
                </div>
              </div>
            </BaseSection>
          </template>

          <template v-else-if="currentScene">
            <BaseSection title="Scene" :meta="`${currentNumber} of ${totalScenes}`" first>
              <div class="space-y-4">
                <div>
                  <h2 class="type-display text-sm text-text-primary">
                    {{ currentScene.sceneTitle }}
                  </h2>
                  <p
                    v-if="currentScene.brief"
                    class="mt-2 whitespace-pre-line text-xs leading-relaxed text-text-secondary"
                  >
                    {{ currentScene.brief }}
                  </p>
                </div>

                <div
                  v-if="currentScene.facts?.length"
                  class="rounded-sm border border-border-subtle p-3"
                >
                  <p class="label-micro text-text-hint">Facts you may use</p>
                  <ul
                    class="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-text-secondary"
                  >
                    <li v-for="(fact, index) in currentScene.facts" :key="index">{{ fact }}</li>
                  </ul>
                </div>

                <div class="whitespace-pre-wrap text-[15px] leading-7 text-text-primary">
                  {{ currentScene.text }}
                </div>
              </div>
            </BaseSection>

            <BaseSection title="Overall decision" description="Would you keep this scene as it is?">
              <BaseSegmented
                v-model="draft.overall"
                :options="OVERALL_OPTIONS"
                block
                aria-label="Overall decision"
              />
            </BaseSection>

            <BaseSection
              title="Rubric v1"
              description="Answer every dimension. Unsure is a real answer and is excluded from agreement, not counted as Fine."
            >
              <div class="space-y-5">
                <div
                  v-for="dimension in DIMENSIONS"
                  :key="dimension.key"
                  class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div class="min-w-0 sm:max-w-[55%]">
                    <p class="text-xs font-medium text-text-primary">{{ dimension.label }}</p>
                    <p class="mt-0.5 text-11px leading-relaxed text-text-hint">
                      {{ dimension.hint }}
                    </p>
                  </div>
                  <BaseSegmented
                    v-model="draft.dims[dimension.key]"
                    :options="MARK_OPTIONS"
                    size="sm"
                    :aria-label="dimension.label"
                  />
                </div>
              </div>
            </BaseSection>

            <BaseSection title="Notes">
              <BaseField
                v-model="draft.note"
                :rows="3"
                label="Optional note"
                placeholder="Only when it helps: a paragraph number, a repeated phrase, a disagreement you want to explain later."
              />
            </BaseSection>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-11px text-text-hint">
                {{ store.responses.length }} of {{ totalScenes }} saved · answers save when you
                continue
              </p>
              <BaseButton
                variant="primary"
                icon="arrow-right"
                :disabled="!allAnswered || saving"
                :loading="saving"
                @click="saveAndNext"
              >
                {{ currentNumber === totalScenes ? 'Save and finish' : 'Save and next scene' }}
              </BaseButton>
            </div>
          </template>
        </template>

        <template v-else>
          <BaseSection title="Import the frozen pack" first>
            <div class="space-y-4">
              <BaseAlert variant="warning" title="Local-only pilot">
                Use an anonymous participant code, not a name. The pack is refused if it contains
                critic, score or gate output. Nothing here is synced or sent to a cloud provider.
              </BaseAlert>

              <input
                ref="fileInput"
                type="file"
                accept="application/json,.json"
                class="hidden"
                @change="onFile"
              />
              <div class="flex flex-wrap items-center gap-2">
                <BaseButton
                  variant="secondary"
                  icon="file-up"
                  :loading="importing"
                  @click="openFilePicker"
                >
                  Import study pack
                </BaseButton>
                <span class="text-11px text-text-hint">
                  A v1 JSON pack with exactly 12 scenes.
                </span>
              </div>

              <div v-if="store.studies.length" class="space-y-2">
                <p class="label-micro text-text-hint">Imported packs</p>
                <div
                  v-for="study in store.studies"
                  :key="study.id"
                  class="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2"
                >
                  <div class="min-w-0">
                    <p class="truncate text-xs text-text-primary">{{ study.title }}</p>
                    <p class="text-11px text-text-hint">
                      {{ study.studyId }} · {{ study.scenes.length }} scenes · pack
                      {{ study.packHash.slice(0, 10) }}…
                    </p>
                  </div>
                  <span class="text-11px text-text-hint">rubric {{ study.rubricVersion }}</span>
                </div>
              </div>
            </div>
          </BaseSection>

          <BaseSection
            v-if="store.studies.length"
            title="Start a session"
            description="One session is one rater and one pass. Start the same rater/pass again to resume it."
          >
            <div class="space-y-4">
              <BaseSelect
                v-model="selectedStudyId"
                :options="studyOptions"
                label="Study pack"
                placeholder="Choose an imported pack"
              />
              <div class="grid gap-4 sm:grid-cols-2">
                <BaseField
                  v-model="raterId"
                  label="Rater ID"
                  required
                  placeholder="Rater A"
                  hint="Anonymous participant code. AI/model names are refused."
                />
                <BaseField
                  v-model="passLabel"
                  label="Pass"
                  placeholder="Pass 1"
                  hint="Use another pass only for the planned re-label pass."
                />
              </div>
              <BaseButton
                variant="primary"
                icon="play"
                :disabled="!selectedStudy || !raterId.trim()"
                @click="startSession"
              >
                Start review
              </BaseButton>
            </div>
          </BaseSection>

          <BaseSection
            v-if="sessionsView.length"
            title="Sessions"
            :meta="`${sessionsView.length} local`"
          >
            <div class="space-y-2">
              <div
                v-for="session in sessionsView"
                :key="session.id"
                class="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0"
              >
                <div class="min-w-0">
                  <p class="truncate text-xs text-text-primary">
                    {{ session.raterId }} · {{ session.passLabel }}
                  </p>
                  <p class="text-11px text-text-hint">
                    {{ session.answered }} of {{ session.total }} ·
                    {{ session.status === 'complete' ? 'complete' : 'in progress' }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <BaseButton
                    v-if="session.status !== 'complete'"
                    variant="soft"
                    size="sm"
                    @click="resumeSession(session.id)"
                  >
                    Resume
                  </BaseButton>
                  <BaseButton
                    v-if="session.status === 'complete'"
                    variant="secondary"
                    size="sm"
                    icon="download"
                    @click="exportSession(session.id)"
                  >
                    Export
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    icon="trash-2"
                    @click="removeSession(session.id)"
                  >
                    Delete
                  </BaseButton>
                </div>
              </div>
            </div>
          </BaseSection>
        </template>
      </div>
    </main>
  </div>
</template>
