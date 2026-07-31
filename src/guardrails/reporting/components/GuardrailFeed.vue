<script setup>
import { ref, computed } from 'vue'
import BaseIcon from '../../../components/shared/BaseIcon.vue'
import { useGuardrailNotifications } from '../useGuardrailReporting'

const props = defineProps({
  // Hide dismissed findings by default; the toggle brings them back.
  showResolved: { type: Boolean, default: false }
})

const { notifications, unresolved, errorCount, warningCount, dismiss, clear } =
  useGuardrailNotifications()

const includeResolved = ref(props.showResolved)
const filter = ref('all')

const visible = computed(() => {
  const base = includeResolved.value ? notifications.value : unresolved.value
  if (filter.value === 'blocking') return base.filter((n) => n.severity === 'error')
  if (filter.value === 'advisory') return base.filter((n) => n.severity === 'warning')
  return base
})

const filters = [
  { id: 'all', label: 'All' },
  { id: 'blocking', label: 'Blocking' },
  { id: 'advisory', label: 'Advisory' }
]

function toneFor(severity) {
  return severity === 'error' ? 'text-danger' : 'text-warning'
}

function formatKind(kind) {
  return kind.replace(/_/g, ' ')
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function detailPairs(details) {
  return Object.entries(details || {})
    .slice(0, 6)
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    }))
}
</script>

<template>
  <section
    class="flex flex-col h-full min-h-0 bg-bg-secondary border border-border-subtle rounded-lg"
  >
    <header class="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
      <BaseIcon :name="errorCount > 0 ? 'shield-alert' : 'shield'" :size="13" />
      <span class="text-label uppercase tracking-wider text-text-hint font-ui">Guardrails</span>

      <span v-if="errorCount" class="text-label text-danger">{{ errorCount }} blocking</span>
      <span v-if="warningCount" class="text-label text-warning">{{ warningCount }} advisory</span>

      <button
        v-if="notifications.length"
        class="ml-auto text-label text-text-hint hover:text-text-secondary font-ui transition-colors"
        @click="clear()"
      >
        Clear
      </button>
    </header>

    <div class="flex items-center gap-1 px-3 py-1.5 border-b border-border-subtle">
      <button
        v-for="f in filters"
        :key="f.id"
        class="px-2 py-0.5 text-label rounded font-ui transition-colors"
        :class="
          filter === f.id
            ? 'bg-surface-hover text-accent'
            : 'text-text-hint hover:text-text-secondary hover:bg-surface-hover'
        "
        @click="filter = f.id"
      >
        {{ f.label }}
      </button>

      <label
        class="ml-auto flex items-center gap-1 text-label text-text-hint font-ui cursor-pointer"
      >
        <input v-model="includeResolved" type="checkbox" class="accent-current" />
        Dismissed
      </label>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-3">
      <div v-if="visible.length === 0" class="text-label text-text-hint font-ui">
        No findings to show.
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="n in visible"
          :key="n.id"
          class="flex items-start gap-2 text-label"
          :class="n.resolved ? 'opacity-50' : ''"
        >
          <span :class="toneFor(n.severity)" class="shrink-0 mt-0.5">•</span>

          <div class="flex-1 min-w-0 space-y-0.5">
            <div class="flex items-baseline gap-1.5">
              <span :class="toneFor(n.severity)" class="font-ui">{{ formatKind(n.kind) }}</span>
              <span class="text-text-hint font-ui">{{ n.layer.replace(/_/g, ' ') }}</span>
              <span class="text-text-hint font-ui ml-auto shrink-0">{{
                formatTime(n.timestamp)
              }}</span>
            </div>

            <p class="text-text-secondary break-words">{{ n.message }}</p>

            <details v-if="detailPairs(n.details).length">
              <summary
                class="text-text-hint cursor-pointer hover:text-text-secondary font-ui select-none"
              >
                Details
              </summary>
              <dl class="mt-1 p-2 bg-bg-tertiary rounded space-y-0.5">
                <div v-for="pair in detailPairs(n.details)" :key="pair.key" class="flex gap-1.5">
                  <dt class="text-text-hint shrink-0 font-ui">{{ pair.key }}</dt>
                  <dd class="text-text-secondary break-all">{{ pair.value }}</dd>
                </div>
              </dl>
            </details>
          </div>

          <button
            v-if="!n.resolved"
            class="shrink-0 text-text-hint hover:text-text-secondary transition-colors"
            title="Dismiss"
            @click="dismiss(n.id)"
          >
            <BaseIcon name="x" :size="11" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
