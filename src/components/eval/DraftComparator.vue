<script setup>
import { computed, ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import { usePreferenceStore } from '../../stores/preferenceStore'
import { useProjectStore } from '../../stores/projectStore'

/**
 * Side-by-side pairwise draft ranking.
 *
 * Two rules shape this screen. The drafts are *prose*, so they render in the
 * manuscript face at manuscript measure — judging which one reads better in a
 * 12px UI sans is judging the wrong artifact. And the two columns are
 * deliberately identical in weight: any styling that favours one side biases
 * the very preference this component exists to collect.
 */
const props = defineProps({
  draftA: { type: Object, default: null },
  draftB: { type: Object, default: null },
  sceneId: { type: String, default: '' }
})

const emit = defineEmits(['preference-recorded', 'skip'])

const preferenceStore = usePreferenceStore()
const projectStore = useProjectStore()

const selected = ref('')
const preferenceCount = ref(0)
const saving = ref(false)

const hasPair = computed(() => Boolean(props.draftA && props.draftB))

const sides = computed(() => [
  { key: 'A', label: 'Draft A', draft: props.draftA },
  { key: 'B', label: 'Draft B', draft: props.draftB }
])

/** Cheap enough at draft length, and it is the first thing a reader compares. */
function wordCount(text) {
  const trimmed = (text || '').trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function modelOf(draft) {
  return draft?.modelLabel || draft?.model || ''
}

async function recordPreference() {
  if (!selected.value || saving.value) return
  saving.value = true

  const isA = selected.value === 'A'
  const winner = isA ? props.draftA : props.draftB
  const loser = isA ? props.draftB : props.draftA

  try {
    await preferenceStore.addPreference({
      winnerId: winner.id,
      loserId: loser.id,
      sceneId: props.sceneId,
      projectId: projectStore.currentProjectId || 'unknown',
      timestamp: new Date().toISOString(),
      modelContext: {
        winnerProvider: winner.provider || 'unknown',
        winnerModel: winner.model || 'unknown',
        loserProvider: loser.provider || 'unknown',
        loserModel: loser.model || 'unknown'
      }
    })
    preferenceCount.value += 1
    selected.value = ''
    emit('preference-recorded')
  } finally {
    saving.value = false
  }
}

function skip() {
  selected.value = ''
  emit('skip')
}

/** Left/right arrows move between the two drafts, per the radiogroup pattern. */
function onKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  selected.value = event.key === 'ArrowLeft' ? 'A' : 'B'
}
</script>

<template>
  <section class="space-y-3">
    <header class="flex items-baseline justify-between gap-3">
      <h4 class="label-micro text-text-hint">Pairwise draft ranking</h4>
      <p v-if="preferenceCount > 0" class="font-ui text-xs tabular-nums text-text-hint">
        {{ preferenceCount }} recorded this session
      </p>
    </header>

    <div
      v-if="!hasPair"
      class="rounded-xl border border-border-subtle bg-bg-tertiary p-6 text-center"
    >
      <BaseIcon name="columns-2" :size="22" class="mx-auto mb-2 text-text-hint" />
      <p class="font-ui text-sm text-text-secondary">Select two drafts to compare</p>
      <p class="mt-1 font-ui text-xs text-text-hint">
        Drafts from different models, or the same model after edits.
      </p>
    </div>

    <template v-else>
      <div
        role="radiogroup"
        aria-label="Which draft reads better?"
        class="grid grid-cols-1 gap-3 md:grid-cols-2"
        @keydown="onKeydown"
      >
        <button
          v-for="side in sides"
          :key="side.key"
          type="button"
          role="radio"
          :aria-checked="selected === side.key ? 'true' : 'false'"
          :tabindex="selected === side.key || (!selected && side.key === 'A') ? 0 : -1"
          :class="[
            'flex flex-col rounded-xl border p-3 text-left transition-colors duration-150',
            selected === side.key
              ? 'border-accent bg-accent/8'
              : 'border-border-subtle bg-bg-tertiary hover:border-border-strong'
          ]"
          @click="selected = side.key"
        >
          <span class="mb-2 flex items-center gap-2">
            <BaseIcon
              :name="selected === side.key ? 'circle-check' : 'circle'"
              :size="14"
              :class="selected === side.key ? 'shrink-0 text-accent' : 'shrink-0 text-text-hint'"
            />
            <span class="label-micro text-text-secondary">{{ side.label }}</span>

            <span
              v-if="modelOf(side.draft)"
              class="ml-auto truncate rounded-full bg-surface-hover px-2 py-0.5 font-ui text-xs text-text-secondary"
            >
              {{ modelOf(side.draft) }}
            </span>
          </span>

          <p class="mb-2 font-ui text-xs tabular-nums text-text-hint">
            {{ wordCount(side.draft.content).toLocaleString() }} words
          </p>

          <!-- The artifact under judgement, in the face it will be read in. -->
          <div
            class="vers-draft-body max-h-72 overflow-y-auto whitespace-pre-wrap font-manuscript text-sm leading-relaxed text-text-primary"
          >
            {{ side.draft.content }}
          </div>
        </button>
      </div>

      <div class="flex items-center justify-center gap-2">
        <BaseButton
          variant="primary"
          size="md"
          icon="thumbs-up"
          :disabled="!selected"
          :loading="saving"
          @click="recordPreference"
        >
          {{ selected ? `Prefer ${selected === 'A' ? 'Draft A' : 'Draft B'}` : 'Pick a draft' }}
        </BaseButton>
        <BaseButton variant="secondary" size="md" icon="x" @click="skip"> Neither </BaseButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* The app hides scrollbars globally; inside a fixed-height prose column that
   removes the only cue that there is more draft below. Put one back, quietly. */
.vers-draft-body {
  scrollbar-width: thin;
  scrollbar-color: var(--vers-border) transparent;
}
.vers-draft-body::-webkit-scrollbar {
  display: block;
  width: 6px;
}
.vers-draft-body::-webkit-scrollbar-thumb {
  background: var(--vers-border);
  border-radius: 4px;
}
</style>
