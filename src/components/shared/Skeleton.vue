<script setup>
/**
 * Skeleton — loading placeholder for async content.
 *
 * Variants:
 *   line   — a single bar (default); use `width`/`height` to size it
 *   text   — a stack of `count` lines, last line shortened for a natural ragged edge
 *   circle — a round placeholder (avatars, icons); `size` controls the diameter
 *   card   — a rounded block with a header line + text lines
 *   list   — `count` rows, each a circle + two lines
 *   panel  — a titled panel scaffold (header + several text blocks)
 *
 * Honors `prefers-reduced-motion`: the shimmer is replaced by a static tint.
 */
defineProps({
  variant: {
    type: String,
    default: 'line',
    validator: (v) => ['line', 'text', 'circle', 'card', 'list', 'panel'].includes(v)
  },
  // How many repeated units (text lines, list rows). Ignored by single-unit variants.
  count: {
    type: Number,
    default: 3
  },
  // CSS length for a `line`/`text` bar's width (e.g. '100%', '12rem').
  width: {
    type: String,
    default: '100%'
  },
  // CSS length for a `line` bar's height.
  height: {
    type: String,
    default: '0.75rem'
  },
  // Diameter for `circle`, and the leading circle in `list`.
  size: {
    type: String,
    default: '2.5rem'
  },
  // Accessible label announced by screen readers while content loads.
  label: {
    type: String,
    default: 'Loading…'
  }
})
</script>

<template>
  <div class="vers-skeleton" role="status" aria-live="polite" :aria-label="label">
    <!-- line -->
    <span v-if="variant === 'line'" class="sk-bar" :style="{ width, height }" />

    <!-- text -->
    <template v-else-if="variant === 'text'">
      <span
        v-for="i in count"
        :key="i"
        class="sk-bar sk-text-line"
        :style="{ width: i === count && count > 1 ? '62%' : width }"
      />
    </template>

    <!-- circle -->
    <span
      v-else-if="variant === 'circle'"
      class="sk-bar sk-circle"
      :style="{ width: size, height: size }"
    />

    <!-- card -->
    <div v-else-if="variant === 'card'" class="sk-card">
      <span class="sk-bar sk-card-title" />
      <span class="sk-bar sk-text-line" style="width: 100%" />
      <span class="sk-bar sk-text-line" style="width: 92%" />
      <span class="sk-bar sk-text-line" style="width: 68%" />
    </div>

    <!-- list -->
    <div v-else-if="variant === 'list'" class="sk-list">
      <div v-for="i in count" :key="i" class="sk-list-row">
        <span class="sk-bar sk-circle" :style="{ width: size, height: size }" />
        <div class="sk-list-lines">
          <span class="sk-bar sk-text-line" style="width: 55%" />
          <span class="sk-bar sk-text-line" style="width: 85%" />
        </div>
      </div>
    </div>

    <!-- panel -->
    <div v-else-if="variant === 'panel'" class="sk-panel">
      <span class="sk-bar sk-panel-title" />
      <div v-for="i in count" :key="i" class="sk-panel-block">
        <span class="sk-bar sk-text-line" style="width: 40%" />
        <span class="sk-bar sk-text-line" style="width: 100%" />
        <span class="sk-bar sk-text-line" style="width: 78%" />
      </div>
    </div>

    <span class="sr-only">{{ label }}</span>
  </div>
</template>

<style scoped>
.vers-skeleton {
  width: 100%;
}

.sk-bar {
  display: block;
  border-radius: 6px;
  background: var(--vers-bg-hover);
  background-image: linear-gradient(
    90deg,
    var(--vers-bg-hover) 0%,
    var(--vers-bg-elevated) 50%,
    var(--vers-bg-hover) 100%
  );
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
}

@keyframes sk-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.sk-text-line {
  height: 0.75rem;
}
.sk-text-line + .sk-text-line {
  margin-top: 0.5rem;
}

.sk-circle {
  border-radius: 9999px;
  flex-shrink: 0;
}

/* card */
.sk-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--vers-border-subtle);
  border-radius: 10px;
  background: var(--vers-bg-panel);
}
.sk-card-title {
  height: 1.05rem;
  width: 45%;
  margin-bottom: 0.35rem;
}

/* list */
.sk-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.sk-list-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.sk-list-lines {
  flex: 1;
  min-width: 0;
}

/* panel */
.sk-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.sk-panel-title {
  height: 1.15rem;
  width: 35%;
}
.sk-panel-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sk-bar {
    animation: none;
    background-image: none;
    background: var(--vers-bg-hover);
  }
}
</style>
