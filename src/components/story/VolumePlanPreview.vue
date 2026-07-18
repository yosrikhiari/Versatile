<template>
  <div v-if="scenes.length" class="space-y-4">
    <div>
      <div class="rounded-lg bg-bg-secondary border border-border-subtle p-4 space-y-3">
        <h3 class="text-sm font-semibold text-text-primary font-ui">
          {{ planLabel }} Plan — {{ sceneCount || scenes.length }} scene{{
            (sceneCount || scenes.length) === 1 ? '' : 's'
          }}
        </h3>
        <p class="text-xs text-text-hint">
          Edit scene fields before writing begins. Narrative pitches are auto-generated previews —
          edit the underlying fields to update them.
        </p>
      </div>
    </div>

    <div class="space-y-2">
      <h3 class="text-xs uppercase tracking-widest text-text-hint font-ui">Scenes</h3>

      <!-- Tension arc visualization -->
      <div
        class="flex gap-0.5 h-3 rounded overflow-hidden bg-bg-tertiary"
        title="Tension arc across scenes"
      >
        <div
          v-for="(scene, j) in scenes"
          :key="j"
          :class="getTensionBarClass(scene.tension)"
          class="h-full transition-colors"
          :style="{ width: 100 / scenes.length + '%' }"
          :title="'Scene ' + (j + 1) + ': ' + scene.tension"
        />
      </div>

      <div
        v-for="(scene, i) in scenes"
        :key="i"
        class="rounded-lg bg-bg-secondary border border-border-subtle p-3 space-y-2"
      >
        <!-- Header -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-text-primary font-ui"
            >Scene {{ scene.sceneNumber || i + 1 }}: {{ scene.title }}</span
          >
          <span :class="['px-2 py-0.5 rounded text-xs font-ui', getTensionColor(scene.tension)]">{{
            scene.tension
          }}</span>
        </div>

        <!-- Collapsible narrative pitch -->
        <div class="rounded-lg bg-bg-tertiary border border-border-subtle">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-hover hover:text-text-primary transition-colors font-ui focus:outline-none"
            @click="togglePitch(i)"
          >
            <BaseIcon :name="pitchOpen === i ? 'chevron-down' : 'chevron-right'" :size="12" />
            <span class="font-medium">Narrative Pitch</span>
          </button>
          <div
            v-if="pitchOpen === i"
            class="px-3 pb-2.5 text-xs text-text-secondary leading-relaxed space-y-1.5 border-t border-border-subtle pt-2"
          >
            <p v-if="scene.goal">
              Emotional goal:
              <span class="text-text-primary font-medium">{{ scene.goal }}</span
              >.
            </p>
            <p v-if="scene.obstacle">
              What changes / obstacle:
              <span class="text-text-primary">{{ scene.obstacle }}</span
              >.
            </p>
            <p v-if="scene.setup">
              Sets up: <span class="text-text-primary">{{ scene.setup }}</span
              >.
            </p>
            <p v-if="scene.payoff">
              Pays off: <span class="text-text-primary">{{ scene.payoff }}</span
              >.
            </p>
            <p v-if="scene.sensoryAnchor">
              Sensory anchor:
              <span class="text-text-primary italic">{{ scene.sensoryAnchor }}</span
              >.
            </p>
            <p v-if="scene.location">
              Location: <span class="text-text-primary">{{ scene.location }}</span
              >.
            </p>
            <p v-if="scene.tension">
              Tension: <span class="text-text-primary font-medium">{{ scene.tension }}</span
              >.
            </p>
            <p v-if="scene.pacing">
              Pacing: <span class="text-text-primary font-medium">{{ scene.pacing }}</span
              >.
            </p>
            <p v-if="scene.arcPosition">
              Arc position:
              <span class="text-text-primary font-medium">{{ scene.arcPosition }}</span
              >.
            </p>
            <p v-if="scene.emotionalGoal">
              Reader's emotional response:
              <span class="text-text-primary">{{ scene.emotionalGoal }}</span
              >.
            </p>
            <p v-if="scene.characterWants && Object.keys(scene.characterWants).length > 0">
              Character wants:
              <span class="text-text-primary">{{ formatWants(scene.characterWants) }}</span
              >.
            </p>
            <p v-if="scene.estimatedWords">
              Target words: <span class="text-text-primary">{{ scene.estimatedWords }}</span
              >.
            </p>
            <p
              v-if="
                !scene.goal &&
                !scene.setup &&
                !scene.payoff &&
                !scene.sensoryAnchor &&
                !scene.obstacle &&
                !scene.tension &&
                !scene.pacing
              "
              class="text-text-hint italic"
            >
              No narrative details yet.
            </p>
          </div>
        </div>

        <!-- 2-column editable field grid -->
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <!-- Left column -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Goal:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.goal || ''"
                @input="emit('scene-edit', i, 'goal', $event.target.value)"
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Characters:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="
                  scene.characters
                    ? scene.characters.join(', ')
                    : (scene.charactersPresent || []).join(', ')
                "
                @input="
                  emit(
                    'scene-edit',
                    i,
                    'characters',
                    $event.target.value.split(',').map((s) => s.trim())
                  )
                "
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Setup:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.setup || ''"
                @input="emit('scene-edit', i, 'setup', $event.target.value)"
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Sensory:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.sensoryAnchor || ''"
                @input="emit('scene-edit', i, 'sensoryAnchor', $event.target.value)"
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Tension:</span>
              <select
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.tension || 'medium'"
                @change="emit('scene-edit', i, 'tension', $event.target.value)"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="peak">peak</option>
              </select>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Arc Pos:</span>
              <select
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
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
            </div>
          </div>

          <!-- Right column -->
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Changes:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.obstacle || ''"
                @input="emit('scene-edit', i, 'obstacle', $event.target.value)"
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Location:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.location || ''"
                @input="emit('scene-edit', i, 'location', $event.target.value)"
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Payoff:</span>
              <input
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.payoff || ''"
                @input="emit('scene-edit', i, 'payoff', $event.target.value)"
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Words:</span>
              <input
                type="number"
                min="100"
                max="5000"
                step="50"
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.estimatedWords || 800"
                @input="
                  emit('scene-edit', i, 'estimatedWords', parseInt($event.target.value) || 800)
                "
              />
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-hint font-ui w-16 shrink-0">Pacing:</span>
              <select
                class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                :value="scene.pacing || 'medium'"
                @change="emit('scene-edit', i, 'pacing', $event.target.value)"
              >
                <option value="slow">slow</option>
                <option value="medium">medium</option>
                <option value="fast">fast</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Editable characterWants full-width display -->
        <div class="text-xs text-text-hint border-t border-border-subtle pt-1.5">
          <span class="font-ui text-text-hover">Character Wants:</span>
          <input
            class="ml-1 flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-0.5 text-xs text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent w-full mt-1"
            :value="
              scene.characterWants && Object.keys(scene.characterWants).length > 0
                ? formatWants(scene.characterWants)
                : ''
            "
            placeholder="CharacterName → goal description, AnotherChar → their goal"
            @input="emit('wants-edit', i, $event.target.value)"
          />
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        class="flex-1 py-2.5 btn-primary rounded-lg font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="emit('confirm')"
      >
        <span class="flex items-center justify-center gap-2">
          <BaseIcon name="play" :size="16" />
          Confirm & Start Writing
        </span>
      </button>
      <button
        class="px-4 py-2.5 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

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

const pitchOpen = ref(-1)

function togglePitch(i) {
  pitchOpen.value = pitchOpen.value === i ? -1 : i
}

function formatWants(wants) {
  if (!wants || typeof wants !== 'object') return ''
  return Object.entries(wants)
    .map(([name, goal]) => `${name} → ${goal}`)
    .join(', ')
}

function getTensionBarClass(tension) {
  switch (tension) {
    case 'peak':
      return 'bg-danger'
    case 'high':
      return 'bg-warning'
    case 'medium':
      return 'bg-info'
    case 'low':
      return 'bg-surface-hover'
    default:
      return 'bg-surface-hover'
  }
}

function getTensionColor(tension) {
  switch (tension) {
    case 'peak':
      return 'text-danger bg-bg-secondary'
    case 'high':
      return 'text-warning bg-bg-secondary'
    case 'medium':
      return 'text-info bg-bg-secondary'
    case 'low':
      return 'text-text-secondary bg-bg-secondary'
    default:
      return 'text-text-secondary bg-bg-secondary'
  }
}
</script>
