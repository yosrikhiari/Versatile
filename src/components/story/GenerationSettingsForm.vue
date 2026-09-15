<script setup>
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSwitch from '../ui/BaseSwitch.vue'
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
const focus = defineModel('focus', { type: String, default: '' })
const wordTarget = defineModel('wordTarget', { type: Number, default: 2000 })
const usePreciseStructure = defineModel('usePreciseStructure', { type: Boolean, default: false })
const volumes = defineModel('volumes', { type: Number, default: 1 })
const chaptersPerVolume = defineModel('chaptersPerVolume', { type: Number, default: 10 })
const wordsPerChapter = defineModel('wordsPerChapter', { type: Number, default: 2000 })
const scenesPerChapter = defineModel('scenesPerChapter', { type: Number, default: 3 })

const emit = defineEmits(['open-context'])

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
  <!-- ── Brief ──────────────────────────────────────────────────────────── -->
  <BaseSection
    first
    title="Brief"
    description="What the model already knows about this book, and what you want from this run."
  >
    <template #actions>
      <BaseButton variant="ghost" size="sm" icon="book-open" @click="emit('open-context')">
        Story context
      </BaseButton>
    </template>

    <div class="space-y-4">
      <div>
        <p class="label-micro text-text-hint mb-1.5">Story synopsis</p>
        <div
          v-if="hasSynopsis"
          class="font-ui text-sm text-text-secondary leading-5 whitespace-pre-wrap border-l-2 border-border-subtle pl-3"
        >
          {{ synopsis }}
        </div>
        <p v-else class="font-ui text-xs text-text-hint leading-5">
          No synopsis set — open Project Settings to add a category and description. The generator
          needs one to plan from.
        </p>
      </div>

      <div>
        <label for="gen-focus" class="label-micro text-text-hint mb-1.5 block">
          What should this be about?
        </label>
        <textarea
          id="gen-focus"
          v-model="focus"
          data-test="focus-input"
          rows="3"
          maxlength="2000"
          placeholder="e.g. A tense reunion between two estranged siblings at a harbour market…"
          class="w-full px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent resize-y font-ui transition-colors duration-150"
        />
      </div>
    </div>
  </BaseSection>

  <!-- ── Style ──────────────────────────────────────────────────────────── -->
  <BaseSection
    title="Style"
    description="One genre, one tone. Leave both unset to let the synopsis decide."
  >
    <div class="space-y-3">
      <div>
        <p id="gen-genre-label" class="label-micro text-text-hint mb-1.5">Genre</p>
        <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="gen-genre-label">
          <BaseChip
            v-for="g in genres"
            :key="g"
            variant="filter"
            size="sm"
            :active="genre === g"
            @click="toggleGenre(g)"
          >
            {{ g }}
          </BaseChip>
        </div>
      </div>

      <div>
        <p id="gen-tone-label" class="label-micro text-text-hint mb-1.5">Tone</p>
        <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="gen-tone-label">
          <BaseChip
            v-for="t in tones"
            :key="t"
            variant="filter"
            size="sm"
            :active="tone === t"
            @click="toggleTone(t)"
          >
            {{ t }}
          </BaseChip>
        </div>
      </div>
    </div>
  </BaseSection>

  <!-- ── Length ─────────────────────────────────────────────────────────── -->
  <BaseSection
    title="Length"
    :description="
      isChapterMode
        ? 'One chapter, cut into scenes. The estimate is measured on this machine once a run has been timed here.'
        : mode === MODE_SCENE
          ? 'A single scene.'
          : 'A whole arc — either a total word target, or an exact structure.'
    "
  >
    <div class="space-y-4">
      <div v-if="isChapterMode || !usePreciseStructure" data-test="word-target-stepper">
        <BaseStepper
          v-model="wordTarget"
          :label="
            isChapterMode
              ? 'Chapter word target'
              : mode === MODE_SCENE
                ? 'Words per scene'
                : 'Total word target'
          "
          :min="500"
          :max="10000"
          :step="100"
          suffix="words"
        />
      </div>

      <!-- Chapter mode: one chapter, so the only structural choice is how many
           scenes it is cut into. -->
      <template v-if="isChapterMode">
        <div
          data-test="scenes-per-chapter-stepper"
          role="group"
          aria-label="Scenes in this chapter"
        >
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
          class="font-ui text-xs leading-5"
          :class="isLongRun ? 'text-warning' : 'text-text-hint'"
        >
          1 chapter · {{ scenesPerChapter }} {{ scenesPerChapter === 1 ? 'scene' : 'scenes' }} · ~{{
            Math.ceil(wordTarget / Math.max(1, scenesPerChapter)).toLocaleString()
          }}
          words per scene. Estimated generation time: <strong>{{ estimateLabel }}</strong>
          <template v-if="runEstimate.measured">
            at {{ runEstimate.tokensPerSecond.toFixed(1) }} tokens/sec measured on this machine.
          </template>
          <template v-else> (provisional — refined once a run has been measured here). </template>
        </p>
      </template>

      <!-- Precise structure: exact volumes / chapters / words -->
      <template v-else>
        <BaseSwitch
          v-model="usePreciseStructure"
          size="sm"
          label="Precise structure"
          description="Exact volumes, chapters and words per chapter"
        />
        <div v-if="usePreciseStructure" class="grid grid-cols-2 gap-x-4 gap-y-3">
          <div data-test="volumes-stepper" role="group" aria-label="Volumes">
            <BaseStepper v-model="volumes" label="Volumes" :min="1" :max="20" size="sm" />
          </div>
          <div
            data-test="chapters-per-volume-stepper"
            role="group"
            aria-label="Chapters per volume"
          >
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
        <p v-if="usePreciseStructure" class="font-ui text-xs text-text-hint leading-5">
          {{ volumes * chaptersPerVolume }} chapters · ~{{ estimatedTotalWords.toLocaleString() }}
          words total. Chapters are linked via hook endings + a shared spine for continuity.
        </p>
        <p
          v-if="usePreciseStructure"
          class="font-ui text-xs leading-5"
          :class="isLongRun ? 'text-warning' : 'text-text-hint'"
        >
          Estimated generation time:
          <strong>{{ estimateLabel }}</strong>
          <template v-if="runEstimate.measured">
            at {{ runEstimate.tokensPerSecond.toFixed(1) }} tokens/sec measured on this machine.
          </template>
          <template v-else> (provisional — refined once a run has been measured here). </template>
          <template v-if="isLongRun">
            The run resumes if interrupted, but consider fewer chapters, a shorter chapter length,
            or a faster model.
          </template>
        </p>
      </template>
    </div>
  </BaseSection>
</template>
