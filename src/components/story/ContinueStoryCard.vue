<script setup>
/**
 * Generating on top of a manuscript that already exists.
 *
 * The generator's only entry point used to be "write a new story", which meant a
 * project holding a hundred planned-but-empty chapters had no route forward
 * except starting over. This card is the other direction: it reports what is
 * actually in the project and offers the three things you can do about it —
 * finish what was planned, add more chapters, or redraft the thin ones.
 *
 * Purely a control surface. It renders what `surveyContinuation` found and emits
 * intent; the generator owns every decision about how the work is done.
 */
import { ref, computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseStepper from '../ui/BaseStepper.vue'
import BaseCheckbox from '../ui/BaseCheckbox.vue'

const props = defineProps({
  /** Result of `volumeGenerator.surveyContinuation()`, or null while unknown. */
  survey: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  /** Last completed continuation run's report. */
  report: { type: Object, default: null },
  reportLabel: { type: String, default: '' }
})

const emit = defineEmits(['continue', 'extend', 'stop'])

const showExtend = ref(false)
const redraftStubs = ref(false)
const extraVolumes = ref(1)
const extraChapters = ref(3)
const extraScenes = ref(3)
const extraWords = ref(3000)

const unwritten = computed(() => props.survey?.unwritten?.length || 0)
const short = computed(() => props.survey?.short?.length || 0)
const written = computed(() => props.survey?.written?.length || 0)
const totalScenes = computed(() => props.survey?.scenes?.length || 0)
const words = computed(() => props.survey?.totalWords || 0)

/** Nothing to continue and nothing written — this is a blank project. */
const isEmptyProject = computed(() => totalScenes.value === 0)

const willWrite = computed(() => unwritten.value + (redraftStubs.value ? short.value : 0))
</script>

<template>
  <div
    v-if="!isEmptyProject"
    class="rounded-lg border border-border-subtle bg-bg-secondary p-3 space-y-3"
  >
    <div class="flex items-start gap-2">
      <BaseIcon name="edit-3" :size="15" class="text-accent shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        <p class="text-xs text-text-primary font-ui">Continue this story</p>
        <p class="text-2xs text-text-hint font-ui leading-relaxed mt-0.5">
          {{ written }} of {{ totalScenes }} scenes written · {{ words.toLocaleString() }} words
          <template v-if="unwritten"> · {{ unwritten }} still empty</template>
          <template v-if="short"> · {{ short }} are stubs</template>
        </p>
      </div>
    </div>

    <!-- Fill: write the scenes that were planned but never drafted -->
    <template v-if="unwritten || short">
      <BaseCheckbox
        v-if="short"
        v-model="redraftStubs"
        :label="`Also redraft ${short} stub scene(s)`"
      />
      <button
        class="w-full py-1.5 text-xs btn-primary rounded-md font-ui focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        :disabled="busy || !willWrite"
        @click="emit('continue', { includeShort: redraftStubs })"
      >
        {{
          busy ? 'Writing…' : `Continue drafting (${willWrite} scene${willWrite === 1 ? '' : 's'})`
        }}
      </button>
    </template>
    <p v-else class="text-2xs text-text-hint font-ui">
      Every planned scene has prose. Add more chapters below to keep going.
    </p>

    <!-- Extend: plan and write new chapters onto the end of the draft -->
    <button
      class="w-full flex items-center gap-2 py-1.5 px-2 text-xs text-text-secondary hover:text-text-primary border border-border-subtle rounded-md font-ui transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
      :disabled="busy"
      @click="showExtend = !showExtend"
    >
      <BaseIcon :name="showExtend ? 'chevron-down' : 'chevron-right'" :size="14" class="shrink-0" />
      <span class="flex-1 text-left">Extend with new chapters</span>
    </button>

    <div v-if="showExtend" class="space-y-3 pl-2">
      <div class="grid grid-cols-2 gap-3">
        <BaseStepper v-model="extraVolumes" label="Volumes" :min="1" :max="10" size="sm" />
        <BaseStepper
          v-model="extraChapters"
          label="Chapters / volume"
          :min="1"
          :max="30"
          size="sm"
        />
        <BaseStepper v-model="extraScenes" label="Scenes / chapter" :min="1" :max="12" size="sm" />
        <BaseStepper
          v-model="extraWords"
          label="Words / chapter"
          :min="300"
          :max="20000"
          :step="100"
          size="sm"
        />
      </div>
      <p class="text-2xs text-text-hint font-ui leading-relaxed">
        {{ extraVolumes * extraChapters }} new chapter(s) planned from where the manuscript
        currently ends — the existing draft is passed to the planner as canon, so the continuation
        follows on rather than restarting the premise.
      </p>
      <button
        class="w-full py-1.5 text-xs btn-primary rounded-md font-ui focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        :disabled="busy"
        @click="
          emit('extend', {
            volumes: extraVolumes,
            chaptersPerVolume: extraChapters,
            scenesPerChapter: extraScenes,
            wordsPerChapter: extraWords
          })
        "
      >
        {{ busy ? 'Writing…' : 'Plan & write new chapters' }}
      </button>
    </div>

    <button
      v-if="busy"
      class="w-full py-1.5 text-xs text-text-hint hover:text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent rounded-md"
      @click="emit('stop')"
    >
      Stop
    </button>

    <!-- What the last run actually did, including what it did not reach. -->
    <p
      v-if="report && !busy"
      class="text-2xs font-ui leading-relaxed"
      :class="report.stoppedBy || report.failed ? 'text-warning' : 'text-text-hint'"
    >
      {{ reportLabel }}
    </p>
  </div>
</template>
