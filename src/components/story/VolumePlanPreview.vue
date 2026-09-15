<template>
  <div v-if="scenes.length">
    <BaseSection
      first
      :title="`${planLabel} plan`"
      description="Adjust any scene before writing begins. Fields left empty are decided by the writer."
      :meta="`${sceneCount || scenes.length} scene${(sceneCount || scenes.length) === 1 ? '' : 's'}`"
    >
      <!-- Tension arc: one hue, height is the level. Reads as a shape, not a
           traffic light. -->
      <div
        class="flex items-end gap-px h-6"
        role="img"
        :aria-label="`Tension across scenes: ${scenes.map((s) => s.tension || 'medium').join(', ')}`"
      >
        <div
          v-for="(scene, j) in scenes"
          :key="j"
          class="flex-1 rounded-t-sm transition-all duration-150"
          :class="j === open ? 'bg-accent' : 'bg-text-hint/30'"
          :style="{ height: tensionHeight(scene.tension) }"
          :title="`Scene ${j + 1}: ${scene.tension || 'medium'}`"
        />
      </div>

      <ul class="mt-3 -mx-1 divide-y divide-border-subtle">
        <li v-for="(scene, i) in scenes" :key="i">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-2 py-2.5 text-left rounded-md transition-colors duration-150 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            :aria-expanded="open === i"
            @click="toggle(i)"
          >
            <span class="font-ui text-xs text-text-hint tabular-nums w-5 shrink-0">{{
              scene.sceneNumber || i + 1
            }}</span>
            <span class="flex-1 min-w-0">
              <span class="block font-ui text-sm text-text-primary truncate">{{
                scene.title
              }}</span>
              <span
                v-if="open !== i && scene.goal"
                class="block font-ui text-xs text-text-hint truncate"
              >
                {{ scene.goal }}
              </span>
            </span>
            <span class="font-ui text-xs text-text-hint shrink-0">{{
              scene.tension || 'medium'
            }}</span>
            <BaseIcon
              name="chevron-right"
              :size="14"
              class="text-text-hint shrink-0 transition-transform duration-150"
              :class="open === i ? 'rotate-90' : ''"
            />
          </button>

          <div v-if="open === i" class="px-2 pb-4 pt-1 grid grid-cols-2 gap-x-4 gap-y-3">
            <label class="col-span-2 block">
              <span class="label-micro text-text-hint mb-1 block">Goal</span>
              <input
                :class="inputClass"
                :value="scene.goal || ''"
                @input="emit('scene-edit', i, 'goal', $event.target.value)"
              />
            </label>
            <label class="col-span-2 block">
              <span class="label-micro text-text-hint mb-1 block">What changes</span>
              <input
                :class="inputClass"
                :value="scene.obstacle || ''"
                @input="emit('scene-edit', i, 'obstacle', $event.target.value)"
              />
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Characters</span>
              <input
                :class="inputClass"
                :value="
                  scene.characters
                    ? scene.characters.join(', ')
                    : (scene.charactersPresent || []).join(', ')
                "
                placeholder="Comma separated"
                @input="
                  emit(
                    'scene-edit',
                    i,
                    'characters',
                    $event.target.value.split(',').map((s) => s.trim())
                  )
                "
              />
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Location</span>
              <input
                :class="inputClass"
                :value="scene.location || ''"
                @input="emit('scene-edit', i, 'location', $event.target.value)"
              />
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Sets up</span>
              <input
                :class="inputClass"
                :value="scene.setup || ''"
                @input="emit('scene-edit', i, 'setup', $event.target.value)"
              />
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Pays off</span>
              <input
                :class="inputClass"
                :value="scene.payoff || ''"
                @input="emit('scene-edit', i, 'payoff', $event.target.value)"
              />
            </label>
            <label class="col-span-2 block">
              <span class="label-micro text-text-hint mb-1 block">Sensory anchor</span>
              <input
                :class="inputClass"
                :value="scene.sensoryAnchor || ''"
                @input="emit('scene-edit', i, 'sensoryAnchor', $event.target.value)"
              />
            </label>
            <label class="col-span-2 block">
              <span class="label-micro text-text-hint mb-1 block">Character wants</span>
              <input
                :class="inputClass"
                :value="
                  scene.characterWants && Object.keys(scene.characterWants).length > 0
                    ? formatWants(scene.characterWants)
                    : ''
                "
                placeholder="Nesrin → keep the mules, Halim → collect the debt"
                @input="emit('wants-edit', i, $event.target.value)"
              />
            </label>

            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Tension</span>
              <select
                :class="inputClass"
                :value="scene.tension || 'medium'"
                @change="emit('scene-edit', i, 'tension', $event.target.value)"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="peak">peak</option>
              </select>
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Pacing</span>
              <select
                :class="inputClass"
                :value="scene.pacing || 'medium'"
                @change="emit('scene-edit', i, 'pacing', $event.target.value)"
              >
                <option value="slow">slow</option>
                <option value="medium">medium</option>
                <option value="fast">fast</option>
              </select>
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Arc position</span>
              <select
                :class="inputClass"
                :value="scene.arcPosition || ''"
                @change="emit('scene-edit', i, 'arcPosition', $event.target.value)"
              >
                <option value="">—</option>
                <option value="opening">opening</option>
                <option value="rising">rising</option>
                <option value="climax">climax</option>
                <option value="falling">falling</option>
                <option value="resolution">resolution</option>
              </select>
            </label>
            <label class="block">
              <span class="label-micro text-text-hint mb-1 block">Target words</span>
              <input
                type="number"
                min="100"
                max="5000"
                step="50"
                :class="inputClass"
                :value="scene.estimatedWords || 800"
                @input="
                  emit('scene-edit', i, 'estimatedWords', parseInt($event.target.value) || 800)
                "
              />
            </label>
          </div>
        </li>
      </ul>
    </BaseSection>

    <div class="px-4 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
      <BaseButton variant="ghost" size="md" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton variant="primary" size="md" icon="play" @click="emit('confirm')">
        Start writing
      </BaseButton>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSection from '../ui/BaseSection.vue'

defineProps({
  scenes: {
    type: Array,
    default: () => []
  },
  planLabel: {
    type: String,
    default: 'Scene'
  },
  sceneCount: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['scene-edit', 'wants-edit', 'confirm', 'cancel'])

/** Index of the scene whose fields are open; one at a time. */
const open = ref(-1)

function toggle(i) {
  open.value = open.value === i ? -1 : i
}

const inputClass =
  'w-full bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 text-sm text-text-primary font-ui placeholder:text-text-hint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors duration-150'

function formatWants(wants) {
  if (!wants || typeof wants !== 'object') return ''
  return Object.entries(wants)
    .map(([name, goal]) => `${name} → ${goal}`)
    .join(', ')
}

const TENSION_HEIGHT = { low: '30%', medium: '55%', high: '80%', peak: '100%' }

function tensionHeight(tension) {
  return TENSION_HEIGHT[tension] || TENSION_HEIGHT.medium
}
</script>
