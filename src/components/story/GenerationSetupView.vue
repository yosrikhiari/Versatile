<script setup>
import BaseIcon from '../shared/BaseIcon.vue'
import BaseSection from '../ui/BaseSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSwitch from '../ui/BaseSwitch.vue'
import BaseCheckbox from '../ui/BaseCheckbox.vue'

/**
 * Everything around the settings form that an idle pipeline shows: the
 * unfinished-run card, the research sources, the Spark badge, the run
 * options and the action row. Shared by the chapter and arc tabs; the form
 * itself is passed in through the default slot, anything tab-specific (the
 * continuation card) through `before`.
 */
defineProps({
  /** { written, total } for an interrupted run, or null. */
  resumable: { type: Object, default: null },
  /** Research library state, or null when the project has no documents. */
  research: { type: Object, default: null },
  sparkContext: { type: String, default: '' },
  sparkContextLabel: { type: String, default: '' },
  generateLabel: { type: String, default: 'Generate' },
  disabled: Boolean,
  /** Line under the action row: what the run will cost. */
  footnote: { type: String, default: '' },
  testPrefix: { type: String, default: '' }
})

const autoRun = defineModel('autoRun', { type: Boolean, default: false })
const sceneReview = defineModel('sceneReview', { type: Boolean, default: false })
const inlineEval = defineModel('inlineEval', { type: Boolean, default: false })

const emit = defineEmits([
  'resume',
  'discard-resume',
  'clear-spark',
  'generate',
  'toggle-research',
  'select-all-research',
  'select-no-research',
  'toggle-doc'
])
</script>

<template>
  <div>
    <!-- Unfinished run -->
    <div
      v-if="resumable"
      :data-test="testPrefix ? `${testPrefix}-resume-card` : undefined"
      class="mx-4 mt-4 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5 flex items-center gap-3"
    >
      <BaseIcon name="history" :size="16" class="text-accent shrink-0" />
      <p class="flex-1 min-w-0 font-ui text-xs text-text-primary">
        Unfinished draft — {{ resumable.written }} of {{ resumable.total }} scenes written.
      </p>
      <BaseButton variant="ghost" size="sm" @click="emit('discard-resume')">Discard</BaseButton>
      <BaseButton
        variant="primary"
        size="sm"
        :data-test="testPrefix ? `${testPrefix}-resume-btn` : undefined"
        @click="emit('resume')"
      >
        Resume
      </BaseButton>
    </div>

    <slot name="before" />

    <!-- The settings form: Brief / Style / Length -->
    <slot />

    <!-- Sources -->
    <BaseSection
      v-if="research"
      title="Sources"
      description="Imported research the planner and writer may quote from."
      :meta="research.use ? `${research.selectedCount} of ${research.docs.length}` : ''"
    >
      <template #actions>
        <BaseSwitch
          :model-value="research.use"
          size="sm"
          label="Use research"
          @update:model-value="emit('toggle-research', $event)"
        />
      </template>
      <div v-if="research.use" class="space-y-2">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="font-ui text-xs text-text-hint hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            @click="emit('select-all-research')"
          >
            All
          </button>
          <button
            type="button"
            class="font-ui text-xs text-text-hint hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            @click="emit('select-no-research')"
          >
            None
          </button>
        </div>
        <ul
          class="max-h-40 overflow-y-auto divide-y divide-border-subtle -mx-1 pr-1 scrollbar-thin"
        >
          <li v-for="doc in research.docs" :key="doc.id" class="px-1 py-1.5">
            <BaseCheckbox
              :model-value="research.selectedIds.has(doc.id)"
              :label="doc.fileName"
              @update:model-value="emit('toggle-doc', doc.id)"
            />
          </li>
        </ul>
        <p v-if="research.selectedCount === 0" class="font-ui text-xs text-text-hint">
          No sources selected — the run proceeds without research.
        </p>
      </div>
    </BaseSection>

    <!-- How it runs -->
    <BaseSection title="How it runs" description="Stops, reviews and checks along the way.">
      <div class="space-y-3">
        <BaseSwitch
          v-model="autoRun"
          size="sm"
          label="One click"
          description="Write everything with no stops"
        />
        <BaseSwitch
          v-model="sceneReview"
          size="sm"
          label="Pause per scene"
          description="Approve, reject or redirect each scene as it lands"
          :disabled="autoRun"
        />
        <BaseSwitch
          v-model="inlineEval"
          size="sm"
          label="Critique each scene"
          description="Run the critic inline and show its verdict"
        />
      </div>
    </BaseSection>

    <!-- Action row -->
    <div class="px-4 py-4 border-t border-border-subtle space-y-3">
      <div
        v-if="sparkContext"
        class="flex items-center gap-2 rounded-md bg-accent/5 border border-accent/20 px-2.5 py-1.5"
      >
        <BaseIcon name="sparkles" :size="13" class="text-accent shrink-0" />
        <p
          class="flex-1 min-w-0 font-ui text-xs text-text-secondary truncate"
          :title="sparkContext"
        >
          Spark context · {{ sparkContextLabel }}
        </p>
        <button
          type="button"
          class="text-text-hint hover:text-text-primary rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title="Remove Spark context"
          @click="emit('clear-spark')"
        >
          <BaseIcon name="x" :size="13" />
        </button>
      </div>

      <div class="flex items-center justify-between gap-3">
        <p class="font-ui text-xs text-text-hint leading-5 min-w-0">{{ footnote }}</p>
        <BaseButton
          variant="primary"
          size="md"
          icon="wand-2"
          :disabled="disabled"
          :data-test="testPrefix ? `generate-${testPrefix}-btn` : undefined"
          custom-class="shrink-0"
          @click="emit('generate')"
        >
          {{ generateLabel }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
