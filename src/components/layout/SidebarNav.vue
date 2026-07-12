<script setup>
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import BaseIcon from '../shared/BaseIcon.vue'
import { useLocalStorage } from '../../composables/useLocalStorage'

const props = defineProps({
  activePanel: {
    type: String,
    default: null
  },
  mobileOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['navigate', 'close'])

const collapsed = useLocalStorage('versatile:sidebar-collapsed', false)
const isDesktop = useMediaQuery('(min-width: 768px)')

// Collapse only applies on desktop — the mobile drawer is always full width.
const effectiveCollapsed = computed(() => isDesktop.value && collapsed.value)

// Panels grouped by what the writer is doing, not by panel type.
const navGroups = [
  {
    label: 'Write',
    items: [
      { label: 'Generator', panel: 'story-generator', icon: 'sparkles' },
      { label: 'Polish', panel: 'polish', icon: 'brush' },
      { label: 'Voice Lab', panel: 'voice-lab', icon: 'message-square' }
    ]
  },
  {
    label: 'Structure',
    items: [
      { label: 'Outline', panel: 'outline', icon: 'list' },
      { label: 'Sections', panel: 'sections', icon: 'book-marked' },
      { label: 'Canvas', panel: 'canvas', icon: 'palette' },
      { label: 'Consistency', panel: 'consistency', icon: 'clipboard-check' },
      { label: 'Beta Reader', panel: 'beta-reader', icon: 'eye' }
    ]
  },
  {
    label: 'World',
    items: [
      { label: 'Story Bible', panel: 'story-bible', icon: 'book-open' },
      { label: 'Network', panel: 'network', icon: 'network' },
      { label: 'Timeline', panel: 'timeline', icon: 'clock' },
      { label: 'Story Shape', panel: 'story-shape', icon: 'activity' }
    ]
  }
]

const systemItems = [
  { label: 'Research', panel: 'research', icon: 'search' },
  { label: 'Archive', panel: 'archive', icon: 'archive' },
  { label: 'Benchmarks', panel: 'benchmarks', icon: 'bar-chart' },
  { label: 'Settings', panel: 'settings', icon: 'settings' }
]

// Stable per-item delay (ms) for the staggered enter animation.
const staggerDelays = (() => {
  const map = {}
  let i = 0
  for (const group of navGroups) {
    for (const item of group.items) map[item.panel] = i++ * 30
  }
  for (const item of systemItems) map[item.panel] = i++ * 30
  return map
})()

function isActive(panel) {
  return props.activePanel === panel
}

function onNavClick(panel) {
  emit('navigate', panel)
  if (!isDesktop.value) emit('close')
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <div style="display: contents">
    <!-- Mobile backdrop -->
    <Transition name="fade">
      <div
        v-if="mobileOpen"
        class="md:hidden fixed inset-0 bg-black/50 z-40"
        aria-hidden="true"
        @click="emit('close')"
      ></div>
    </Transition>

    <aside
      :class="[
        'flex flex-col bg-bg-secondary border-r border-border-subtle select-none shrink-0 overflow-hidden',
        'transition-[width,transform] duration-200 ease-out',
        'fixed inset-y-0 left-0 z-50 w-[220px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'md:static md:translate-x-0 md:z-auto',
        effectiveCollapsed ? 'md:w-[56px]' : 'md:w-[220px]'
      ]"
      aria-label="Workspace navigation"
    >
      <!-- Brand -->
      <div
        class="flex items-center h-12 border-b border-border-subtle shrink-0"
        :class="effectiveCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3.5'"
      >
        <template v-if="!effectiveCollapsed">
          <span class="w-2 h-2 rounded-full bg-accent shrink-0"></span>
          <span class="text-[0.9375rem] font-semibold text-text-primary truncate">Versatile</span>
          <button
            class="ml-auto hidden md:grid place-items-center w-8 h-8 rounded-md text-text-hint hover:text-text-primary hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-150"
            title="Collapse sidebar"
            @click="toggleCollapse"
          >
            <BaseIcon name="panel-left-close" :size="18" />
          </button>
          <button
            class="ml-auto md:hidden grid place-items-center w-9 h-9 rounded-md text-text-hint hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-150"
            title="Close menu"
            @click="emit('close')"
          >
            <BaseIcon name="x" :size="18" />
          </button>
        </template>
        <button
          v-else
          class="grid place-items-center w-9 h-9 rounded-md text-text-hint hover:text-text-primary hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-150"
          title="Expand sidebar"
          @click="toggleCollapse"
        >
          <BaseIcon name="panel-left-open" :size="18" />
        </button>
      </div>

      <!-- Grouped panels -->
      <nav class="flex-1 overflow-y-auto py-2 scrollbar-thin" aria-label="Panels">
        <div v-for="group in navGroups" :key="group.label" class="px-2">
          <div
            v-if="!effectiveCollapsed"
            class="px-2 pt-3 pb-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em]"
            style="color: #8c8c84"
          >
            {{ group.label }}
          </div>
          <div v-else class="mx-2 my-2 border-t border-border-subtle"></div>

          <button
            v-for="item in group.items"
            :key="item.panel"
            class="nav-stagger group/item relative w-full flex items-center rounded-md min-h-[40px] text-[0.8125rem] transition-[color,background-color,transform] duration-150 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            :class="[
              effectiveCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
              isActive(item.panel)
                ? 'text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            ]"
            :style="{
              animationDelay: staggerDelays[item.panel] + 'ms',
              ...(isActive(item.panel)
                ? { background: 'rgba(var(--vers-accent-primary-rgb),0.12)' }
                : {})
            }"
            :title="effectiveCollapsed ? item.label : ''"
            :aria-current="isActive(item.panel) ? 'page' : undefined"
            @click="onNavClick(item.panel)"
          >
            <span
              v-if="isActive(item.panel)"
              class="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[2px] rounded-r-sm bg-accent"
            ></span>
            <BaseIcon
              :name="item.icon"
              :size="18"
              :class="
                isActive(item.panel)
                  ? 'text-accent'
                  : 'opacity-70 group-hover/item:opacity-100 transition-opacity duration-150'
              "
            />
            <span v-if="!effectiveCollapsed" class="truncate">{{ item.label }}</span>
          </button>
        </div>
      </nav>

      <!-- System (pinned) -->
      <div class="shrink-0 px-2 py-2 border-t border-border-subtle">
        <button
          v-for="item in systemItems"
          :key="item.panel"
          class="group/item relative w-full flex items-center rounded-md min-h-[40px] text-[0.8125rem] transition-[color,background-color,transform] duration-150 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          :class="[
            effectiveCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
            isActive(item.panel)
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          ]"
          :style="
            isActive(item.panel) ? { background: 'rgba(var(--vers-accent-primary-rgb),0.12)' } : {}
          "
          :title="effectiveCollapsed ? item.label : ''"
          :aria-current="isActive(item.panel) ? 'page' : undefined"
          @click="onNavClick(item.panel)"
        >
          <span
            v-if="isActive(item.panel)"
            class="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[2px] rounded-r-sm bg-accent"
          ></span>
          <BaseIcon
            :name="item.icon"
            :size="18"
            :class="
              isActive(item.panel)
                ? 'text-accent'
                : 'opacity-70 group-hover/item:opacity-100 transition-opacity duration-150'
            "
          />
          <span v-if="!effectiveCollapsed" class="truncate">{{ item.label }}</span>
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.nav-stagger {
  animation: navItemIn 0.25s ease-out backwards;
}

@keyframes navItemIn {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .nav-stagger {
    animation: none;
  }
}
</style>
