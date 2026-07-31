<script setup>
import { ref, computed } from 'vue'
import BaseIcon from '../../../components/shared/BaseIcon.vue'
import { useGuardrailNotifications } from '../useGuardrailReporting'

const { unresolved, errorCount, warningCount, dismiss } = useGuardrailNotifications()

const expanded = ref(false)

// Errors dominate the badge — a blocked generation matters more than a warning.
const tone = computed(() => {
  if (errorCount.value > 0) return 'text-danger'
  if (warningCount.value > 0) return 'text-warning'
  return 'text-text-hint'
})

const icon = computed(() => (errorCount.value > 0 ? 'shield-alert' : 'shield'))

const label = computed(() => {
  const total = unresolved.value.length
  return total === 0 ? 'Clear' : String(total)
})

const title = computed(() => {
  if (unresolved.value.length === 0) return 'Guardrails: no open findings'
  const parts = []
  if (errorCount.value) parts.push(`${errorCount.value} blocking`)
  if (warningCount.value) parts.push(`${warningCount.value} advisory`)
  return `Guardrails: ${parts.join(', ')}`
})

const recent = computed(() => unresolved.value.slice(0, 6))

function toneFor(severity) {
  return severity === 'error' ? 'text-danger' : 'text-warning'
}

function formatKind(kind) {
  return kind.replace(/_/g, ' ')
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1 px-2 py-1 text-label rounded font-ui transition-colors"
      :class="
        expanded
          ? 'bg-surface-hover ' + tone
          : tone + ' hover:text-text-secondary hover:bg-surface-hover'
      "
      :title="title"
      :aria-expanded="expanded"
      aria-haspopup="true"
      @click="expanded = !expanded"
    >
      <BaseIcon :name="icon" :size="12" />
      <span>{{ label }}</span>
    </button>

    <div
      v-if="expanded"
      class="absolute right-0 top-full mt-1 w-80 bg-bg-secondary border border-border-subtle rounded-lg z-50 p-3 max-h-96 overflow-y-auto"
      @click.stop
    >
      <div class="text-label uppercase tracking-wider text-text-hint font-ui mb-1.5">
        Guardrail findings
      </div>

      <div v-if="recent.length === 0" class="text-label text-text-hint font-ui">
        Nothing flagged this session.
      </div>

      <div v-else class="space-y-1.5">
        <div v-for="n in recent" :key="n.id" class="flex items-start gap-1.5 text-label">
          <span :class="toneFor(n.severity)" class="shrink-0 mt-0.5">•</span>
          <span class="text-text-secondary flex-1">
            <span :class="toneFor(n.severity)">[{{ formatKind(n.kind) }}]</span>
            {{ n.message }}
          </span>
          <button
            class="shrink-0 text-text-hint hover:text-text-secondary transition-colors"
            title="Dismiss"
            @click="dismiss(n.id)"
          >
            <BaseIcon name="x" :size="11" />
          </button>
        </div>

        <div
          v-if="unresolved.length > recent.length"
          class="text-label text-text-hint font-ui pt-1"
        >
          +{{ unresolved.length - recent.length }} more
        </div>
      </div>
    </div>
  </div>
</template>
