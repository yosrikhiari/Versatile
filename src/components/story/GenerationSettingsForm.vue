<script setup>
import { MODE_SCENE } from '../../constants/generationModes'

// Settings fields for the story generator: synopsis display, genre, tone, word
// target, and the precise volumes/chapters/words structure. Extracted from
// StoryGeneratorPanel; the eight editable settings are two-way bound via
// defineModel so the panel keeps ownership of the state (its generate handler
// reads it), while the read-only display data comes in as props.
const genre = defineModel('genre')
const tone = defineModel('tone')
const wordTarget = defineModel('wordTarget')
const usePreciseStructure = defineModel('usePreciseStructure')
const volumes = defineModel('volumes')
const chaptersPerVolume = defineModel('chaptersPerVolume')
const wordsPerChapter = defineModel('wordsPerChapter')
const scenesPerChapter = defineModel('scenesPerChapter')

defineProps({
  genres: { type: Array, default: () => [] },
  tones: { type: Array, default: () => [] },
  mode: { type: String, default: '' },
  synopsis: { type: String, default: '' },
  hasSynopsis: { type: Boolean, default: false },
  estimatedTotalWords: { type: Number, default: 0 }
})
</script>

<template>
  <div>
    <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2"
      >Story Synopsis</label
    >
    <div
      v-if="hasSynopsis"
      class="w-full min-h-20 px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary whitespace-pre-wrap"
    >
      {{ synopsis }}
    </div>
    <div
      v-else
      class="w-full min-h-20 px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-hint italic flex items-center justify-center"
    >
      <span>No synopsis set — open Project Settings to add a category and description</span>
    </div>
  </div>

  <div>
    <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">Genre</label>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="g in genres"
        :key="g"
        :class="[
          'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent',
          genre === g
            ? 'bg-surface-hover text-accent'
            : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
        ]"
        @click="genre = genre === g ? '' : g"
      >
        {{ g }}
      </button>
    </div>
  </div>

  <div>
    <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">Tone</label>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="t in tones"
        :key="t"
        :class="[
          'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent',
          tone === t
            ? 'bg-surface-hover text-accent'
            : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
        ]"
        @click="tone = tone === t ? '' : t"
      >
        {{ t }}
      </button>
    </div>
  </div>

  <div v-if="!usePreciseStructure">
    <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">{{
      mode === MODE_SCENE ? 'Words per Scene' : 'Total Word Target'
    }}</label>
    <input
      v-model.number="wordTarget"
      type="number"
      min="500"
      max="10000"
      step="100"
      class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
    />
  </div>

  <!-- Precise structure: exact volumes / chapters / words -->
  <div class="rounded-lg border border-border-subtle p-3 space-y-3">
    <label
      class="flex items-center gap-2 text-xs text-text-primary font-ui cursor-pointer select-none"
    >
      <input
        v-model="usePreciseStructure"
        type="checkbox"
        class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent"
      />
      Precise structure (exact volumes, chapters & length)
    </label>

    <div v-if="usePreciseStructure" class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-2xs uppercase tracking-widest text-text-hint font-ui mb-1"
          >Volumes</label
        >
        <input
          v-model.number="volumes"
          type="number"
          min="1"
          max="20"
          class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label class="block text-2xs uppercase tracking-widest text-text-hint font-ui mb-1"
          >Chapters / volume</label
        >
        <input
          v-model.number="chaptersPerVolume"
          type="number"
          min="1"
          max="60"
          class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label class="block text-2xs uppercase tracking-widest text-text-hint font-ui mb-1"
          >Words / chapter</label
        >
        <input
          v-model.number="wordsPerChapter"
          type="number"
          min="300"
          max="20000"
          step="100"
          class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label class="block text-2xs uppercase tracking-widest text-text-hint font-ui mb-1"
          >Scenes / chapter</label
        >
        <input
          v-model.number="scenesPerChapter"
          type="number"
          min="1"
          max="12"
          class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>

    <p v-if="usePreciseStructure" class="text-2xs text-text-hint font-ui">
      {{ volumes * chaptersPerVolume }} chapters · ~{{ estimatedTotalWords.toLocaleString() }}
      words total. Chapters are linked via hook endings + a shared spine for continuity.
    </p>
  </div>
</template>
