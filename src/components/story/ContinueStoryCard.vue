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
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
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
  <div v-if="!isEmptyProject" class="border-b border-border-subtle">
    <BaseSection
      first
      title="Continue this story"
      :description="`${written} of ${totalScenes} scenes written · ${words.toLocaleString()} words${unwritten ? ` · ${unwritten} still empty` : ''}${short ? ` · ${short} ${short === 1 ? 'is a stub' : 'are stubs'}` : ''}`"
    >
      <template v-if="busy" #actions>
        <BaseButton variant="ghost" size="sm" icon="square" @click="emit('stop')">Stop</BaseButton>
      </template>

      <div class="space-y-3">
        <!-- Fill: write the scenes that were planned but never drafted -->
        <template v-if="unwritten || short">
          <BaseCheckbox
            v-if="short"
            v-model="redraftStubs"
            :label="
              short === 1 ? 'Also redraft the stub scene' : `Also redraft the ${short} stub scenes`
            "
          />
          <BaseButton
            variant="primary"
            size="sm"
            icon="edit-3"
            :loading="busy"
            :disabled="busy || !willWrite"
            @click="emit('continue', { includeShort: redraftStubs })"
          >
            {{
              busy
                ? 'Writing…'
                : willWrite === 0
                  ? 'Nothing to draft — tick the stub above'
                  : `Continue drafting (${willWrite} scene${willWrite === 1 ? '' : 's'})`
            }}
          </BaseButton>
        </template>
        <p v-else class="font-ui text-xs text-text-hint leading-5">
          Every planned scene has prose. Add more chapters to keep going.
        </p>

        <!-- Extend: plan and write new chapters onto the end of the draft -->
        <button
          type="button"
          class="flex items-center gap-1.5 label-micro text-text-hint hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded disabled:opacity-50"
          :aria-expanded="showExtend"
          :disabled="busy"
          @click="showExtend = !showExtend"
        >
          <BaseIcon
            name="chevron-right"
            :size="12"
            class="transition-transform duration-150"
            :class="showExtend ? 'rotate-90' : ''"
          />
          Extend with new chapters
        </button>

        <div v-if="showExtend" class="space-y-3">
          <div class="grid grid-cols-2 gap-x-4 gap-y-3">
            <BaseStepper v-model="extraVolumes" label="Volumes" :min="1" :max="10" size="sm" />
            <BaseStepper
              v-model="extraChapters"
              label="Chapters / volume"
              :min="1"
              :max="30"
              size="sm"
            />
            <BaseStepper
              v-model="extraScenes"
              label="Scenes / chapter"
              :min="1"
              :max="12"
              size="sm"
            />
            <BaseStepper
              v-model="extraWords"
              label="Words / chapter"
              :min="300"
              :max="20000"
              :step="100"
              size="sm"
            />
          </div>
          <p class="font-ui text-xs text-text-hint leading-5">
            {{ extraVolumes * extraChapters }} new chapter(s) planned from where the manuscript
            ends. The existing draft is passed to the planner as canon, so the continuation follows
            on rather than restarting the premise.
          </p>
          <BaseButton
            variant="secondary"
            size="sm"
            icon="plus"
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
          </BaseButton>
        </div>

        <!-- What the last run actually did, including what it did not reach. -->
        <p
          v-if="report && !busy"
          class="font-ui text-xs leading-5"
          :class="report.stoppedBy || report.failed ? 'text-warning' : 'text-text-hint'"
        >
          {{ reportLabel }}
        </p>
      </div>
    </BaseSection>
  </div>
</template>
