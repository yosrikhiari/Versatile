<script setup>
import { ref, computed, watch } from 'vue'
import BasePanelHeader from '../ui/BasePanelHeader.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseChip from '../ui/BaseChip.vue'
import { useLabelStore } from '../../stores/labelStore'
import { OVERALL_LABELS, DIMENSION_LABEL_VALUES } from '../../types/label'

const props = defineProps({
  storyId: { type: String, required: true },
  sceneTitle: { type: String, default: '' },
  sceneExcerpt: { type: String, default: '' },
  wordCount: { type: Number, default: 0 },
  dimensions: {
    type: Array,
    default: () => ['continuity', 'voice', 'show_tell', 'pacing', 'emotional_goal']
  },
  reviewerName: { type: String, default: '' }
})

const emit = defineEmits(['saved'])

const store = useLabelStore()

const overallLabel = ref('pass')
const dimensionLabels = ref({})
const dimensionScores = ref({})
const notes = ref('')
const saving = ref(false)
const error = ref('')

const dimensionLabelsForDisplay = computed(() =>
  props.dimensions.map((d) => ({
    key: d,
    label: d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: dimensionLabels.value[d] || null,
    score: dimensionScores.value[d] || null
  }))
)

watch(
  () => props.sceneTitle,
  () => {
    overallLabel.value = 'pass'
    dimensionLabels.value = {}
    dimensionScores.value = {}
    notes.value = ''
  }
)

async function save() {
  if (!props.reviewerName) {
    error.value = 'Reviewer name is required'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await store.upsert({
      storyId: props.storyId,
      sceneTitle: props.sceneTitle,
      reviewerName: props.reviewerName,
      overallLabel: overallLabel.value,
      dimensionLabels: dimensionLabels.value,
      dimensionScores: dimensionScores.value,
      notes: notes.value,
      wordCount: props.wordCount,
      sceneExcerpt: props.sceneExcerpt
    })
    emit('saved')
  } catch (e) {
    error.value = e.message || 'Failed to save label'
  } finally {
    saving.value = false
  }
}

function setDimensionLabel(dim, value) {
  dimensionLabels.value[dim] = value
}

function setDimensionScore(dim, value) {
  const num = parseInt(value, 10)
  if (!isNaN(num) && num >= 1 && num <= 10) {
    dimensionScores.value[dim] = num
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <BasePanelHeader title="Scene Label" subtitle="Human review for judge calibration" />

    <BaseSection title="Overall Verdict">
      <div class="flex flex-col gap-3">
        <BaseSegmented
          v-model="overallLabel"
          :options="OVERALL_LABELS.map((l) => ({ value: l.value, label: l.label }))"
        />
        <p class="text-sm text-text-hint">
          {{ OVERALL_LABELS.find((l) => l.value === overallLabel)?.description }}
        </p>
      </div>
    </BaseSection>

    <BaseSection title="Per-Dimension Labels">
      <div class="flex flex-col gap-3">
        <div v-for="dim in dimensionLabelsForDisplay" :key="dim.key" class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-text-primary">{{ dim.label }}</span>
            <div class="flex gap-1">
              <BaseChip
                v-for="val in DIMENSION_LABEL_VALUES"
                :key="val"
                :active="dim.value === val"
                @click="setDimensionLabel(dim.key, val)"
              >
                {{ val }}
              </BaseChip>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-text-hint">Score (1-10):</span>
            <input
              type="number"
              min="1"
              max="10"
              :value="dim.score || ''"
              class="w-16 rounded border border-border-subtle bg-bg-secondary px-2 py-1 text-sm text-text-primary"
              @input="setDimensionScore(dim.key, $event.target.value)"
            />
          </div>
        </div>
      </div>
    </BaseSection>

    <BaseSection title="Notes">
      <textarea
        v-model="notes"
        rows="3"
        placeholder="Optional reviewer notes..."
        class="w-full rounded border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-hint"
      />
    </BaseSection>

    <div class="flex items-center justify-between">
      <span v-if="error" class="text-sm text-danger">{{ error }}</span>
      <span v-else />
      <BaseButton :disabled="saving" @click="save">
        {{ saving ? 'Saving...' : 'Save Label' }}
      </BaseButton>
    </div>
  </div>
</template>
