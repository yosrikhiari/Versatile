<script setup>
import { computed } from 'vue'
import { MODE_SCENE, MODE_CHAPTER } from '../../constants/generationModes'
import BaseChip from '../ui/BaseChip.vue'
import BaseCheckbox from '../ui/BaseCheckbox.vue'
import BaseStepper from '../ui/BaseStepper.vue'
import { useSettingsStore } from '../../stores/settingsStore'
import { estimateRun, formatDuration, LONG_RUN_WARNING_MS } from '../../services/generationEstimate'

// Settings fields for the story generator: synopsis display, genre, tone, word
// target, and the precise volumes/chapters/words structure. Extracted from
// StoryGeneratorPanel; the eight editable settings are two-way bound via
// defineModel so the panel keeps ownership of the state (its generate handler
// reads it), while the read-only display data comes in as props.
const genre = defineModel('genre', { type: String, default: '' })
const tone = defineModel('tone', { type: String, default: '' })
const wordTarget = defineModel('wordTarget', { type: Number, default: 2000 })
const usePreciseStructure = defineModel('usePreciseStructure', { type: Boolean, default: false })
const volumes = defineModel('volumes', { type: Number, default: 1 })
const chaptersPerVolume = defineModel('chaptersPerVolume', { type: Number, default: 10 })
const wordsPerChapter = defineModel('wordsPerChapter', { type: Number, default: 2000 })
const scenesPerChapter = defineModel('scenesPerChapter', { type: Number, default: 3 })

const props = defineProps({
  genres: { type: Array, default: () => [] },
  tones: { type: Array, default: () => [] },
  mode: { type: String, default: '' },
  synopsis: { type: String, default: '' },
  hasSynopsis: { type: Boolean, default: false },
  estimatedTotalWords: { type: Number, default: 0 }
})

/**
 * Chapter mode generates exactly one chapter, so the volume and chapter-count
 * steppers describe work it will never do. They are removed from the DOM rather
 * than hidden: a stepper a screen reader can still reach but the run will
 * ignore is worse than no stepper at all.
 */
const isChapterMode = computed(() => props.mode === MODE_CHAPTER)

// Genre and tone are both single-select-with-clear: tapping the active chip
// clears it. Written as two functions rather than one that takes the model,
// because a `defineModel` ref auto-unwraps in the template — passing `genre`
// from there would hand over the string, not the ref.
function toggleGenre(value) {
  genre.value = genre.value === value ? '' : value
}

function toggleTone(value) {
  tone.value = tone.value === value ? '' : value
}

// How long this structure will really take on THIS machine. Without it the form
// will cheerfully accept a request that takes six hours and give no sign of it
// until the run is already underway.
const settingsStore = useSettingsStore()

const runEstimate = computed(() => {
  // One chapter, and the word target the author typed is the chapter's own —
  // multiplying by a volume count the chapter run will never honour is what
  // made the estimate read ten times too long on this tab.
  if (isChapterMode.value) {
    return estimateRun({
      totalWords: wordTarget.value,
      scenes: scenesPerChapter.value,
      chapters: 1,
      model: settingsStore.ollamaModel
    })
  }
  const chapters = volumes.value * chaptersPerVolume.value
  return estimateRun({
    totalWords: chapters * wordsPerChapter.value,
    scenes: chapters * scenesPerChapter.value,
    chapters,
    model: settingsStore.ollamaModel
  })
})

const estimateLabel = computed(() => formatDuration(runEstimate.value.ms))
const isLongRun = computed(() => runEstimate.value.ms >= LONG_RUN_WARNING_MS)
</script>

<template>
  <div>
    <p class="label-micro text-text-hint mb-2">Story Synopsis</p>
    <div
      v-if="hasSynopsis"
      class="w-full min-h-20 px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary whitespace-pre-wrap"
    >
      {{ synopsis }}
    </div>
    <div
      v-else
      class="w-full min-h-20 px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-hint italic flex items-center justify-center text-center"
    >
      <span>No synopsis set — open Project Settings to add a category and description</span>
    </div>
  </div>

  <div>
    <p id="gen-genre-label" class="label-micro text-text-hint mb-2">Genre</p>
    <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="gen-genre-label">
      <BaseChip
        v-for="g in genres"
        :key="g"
        variant="filter"
        size="md"
        :active="genre === g"
        @click="toggleGenre(g)"
      >
        {{ g }}
      </BaseChip>
    </div>
  </div>

  <div>
    <p id="gen-tone-label" class="label-micro text-text-hint mb-2">Tone</p>
    <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="gen-tone-label">
      <BaseChip
        v-for="t in tones"
        :key="t"
        variant="filter"
        size="md"
        :active="tone === t"
        @click="toggleTone(t)"
      >
        {{ t }}
      </BaseChip>
    </div>
  </div>

  <div v-if="isChapterMode || !usePreciseStructure" data-test="word-target-stepper">
    <BaseStepper
      v-model="wordTarget"
      :label="
        isChapterMode
          ? 'Chapter Word Target'
          : mode === MODE_SCENE
            ? 'Words per Scene'
            : 'Total Word Target'
      "
      :min="500"
      :max="10000"
      :step="100"
      suffix="words"
    />
  </div>

  <!-- Chapter mode: one chapter, so the only structural choice is how many
       scenes it is cut into. -->
  <div v-if="isChapterMode" class="rounded-lg border border-border-subtle p-3 space-y-3">
    <div data-test="scenes-per-chapter-stepper" role="group" aria-label="Scenes in this chapter">
      <BaseStepper
        v-model="scenesPerChapter"
        label="Scenes / chapter"
        :min="1"
        :max="12"
        size="sm"
      />
    </div>

    <p
      data-test="estimate"
      role="status"
      aria-live="polite"
      class="text-xs font-ui leading-relaxed"
      :class="isLongRun ? 'text-warning' : 'text-text-hint'"
    >
      1 chapter · {{ scenesPerChapter }} scene(s) · ~{{
        Math.ceil(wordTarget / Math.max(1, scenesPerChapter)).toLocaleString()
      }}
      words per scene. Estimated generation time: <strong>{{ estimateLabel }}</strong>
      <template v-if="runEstimate.measured">
        at {{ runEstimate.tokensPerSecond.toFixed(1) }} tokens/sec measured on this machine.
      </template>
      <template v-else> (provisional — refined once a run has been measured here). </template>
    </p>
  </div>

  <!-- Precise structure: exact volumes / chapters / words -->
  <div v-else class="rounded-lg border border-border-subtle p-3 space-y-3">
    <BaseCheckbox
      v-model="usePreciseStructure"
      label="Precise structure (exact volumes, chapters & length)"
    />

    <div v-if="usePreciseStructure" class="grid grid-cols-2 gap-3">
      <div data-test="volumes-stepper" role="group" aria-label="Volumes">
        <BaseStepper v-model="volumes" label="Volumes" :min="1" :max="20" size="sm" />
      </div>
      <div data-test="chapters-per-volume-stepper" role="group" aria-label="Chapters per volume">
        <BaseStepper
          v-model="chaptersPerVolume"
          label="Chapters / volume"
          :min="1"
          :max="60"
          size="sm"
        />
      </div>
      <div data-test="words-per-chapter-stepper" role="group" aria-label="Words per chapter">
        <BaseStepper
          v-model="wordsPerChapter"
          label="Words / chapter"
          :min="300"
          :max="20000"
          :step="100"
          size="sm"
        />
      </div>
      <div data-test="scenes-per-chapter-stepper" role="group" aria-label="Scenes per chapter">
        <BaseStepper
          v-model="scenesPerChapter"
          label="Scenes / chapter"
          :min="1"
          :max="12"
          size="sm"
        />
      </div>
    </div>

    <p v-if="usePreciseStructure" class="text-xs text-text-hint font-ui leading-relaxed">
      {{ volumes * chaptersPerVolume }} chapters · ~{{ estimatedTotalWords.toLocaleString() }}
      words total. Chapters are linked via hook endings + a shared spine for continuity.
    </p>

    <p
      v-if="usePreciseStructure"
      class="text-xs font-ui leading-relaxed"
      :class="isLongRun ? 'text-warning' : 'text-text-hint'"
    >
      <template v-if="isLongRun">⏳ </template>Estimated generation time:
      <strong>{{ estimateLabel }}</strong>
      <template v-if="runEstimate.measured">
        at {{ runEstimate.tokensPerSecond.toFixed(1) }} tokens/sec measured on this machine.
      </template>
      <template v-else> (provisional — refined once a run has been measured here). </template>
      <template v-if="isLongRun">
        The run resumes if interrupted, but consider fewer chapters, a shorter chapter length, or a
        faster model.
      </template>
    </p>
  </div>
</template>
