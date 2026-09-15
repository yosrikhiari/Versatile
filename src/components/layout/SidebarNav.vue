<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import BaseIcon from '../shared/BaseIcon.vue'
import SidebarAccount from './SidebarAccount.vue'
import { useLocalStorage } from '../../utils/useLocalStorage'
import { NAV_GROUPS, SYSTEM_ITEMS, navItemLabel } from '../../constants/navigation'
import { useProjectStore } from '../../stores/projectStore'

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

const router = useRouter()
const projectStore = useProjectStore()

function labelFor(item) {
  return navItemLabel(item, projectStore.terminology)
}
const collapsed = useLocalStorage('versatile:sidebar-collapsed', false)
const isDesktop = useMediaQuery('(min-width: 768px)')

// Collapse only applies on desktop — the mobile drawer is always full width.
const effectiveCollapsed = computed(() => isDesktop.value && collapsed.value)

// Shared with the command palette — see src/constants/navigation.ts.
const navGroups = NAV_GROUPS
const systemItems = SYSTEM_ITEMS

// ── Overflow ───────────────────────────────────────────────────────────────
// Seventeen panels plus the pinned system row need more height than a 900px
// laptop has. Two answers: groups fold away (remembered per browser), and the
// list shows a fade at whichever edge still has items past it, so nothing is
// silently clipped under the system row.
const collapsedGroups = useLocalStorage('versatile:sidebar-collapsed-groups', [])

function isGroupCollapsed(label) {
  return collapsedGroups.value.includes(label)
}

function toggleGroup(label) {
  collapsedGroups.value = isGroupCollapsed(label)
    ? collapsedGroups.value.filter((l) => l !== label)
    : [...collapsedGroups.value, label]
}

const navEl = ref(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

function updateScrollEdges() {
  const el = navEl.value
  if (!el) return
  canScrollUp.value = el.scrollTop > 2
  canScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 2
}

let resizeObserver = null
onMounted(() => {
  updateScrollEdges()
  if (typeof ResizeObserver !== 'undefined' && navEl.value) {
    resizeObserver = new ResizeObserver(updateScrollEdges)
    resizeObserver.observe(navEl.value)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
watch([collapsedGroups, effectiveCollapsed], () => nextTick(updateScrollEdges))

/**
 * A panel inside a folded group is still reachable from the palette; when it
 * becomes active, unfold its group so the highlight is visible.
 */
watch(
  () => props.activePanel,
  (panel) => {
    if (!panel) return
    const group = navGroups.find((g) => g.items.some((i) => i.panel === panel))
    if (group && isGroupCollapsed(group.label)) toggleGroup(group.label)
  }
)

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

function goToWorkspace() {
  if (!isDesktop.value) emit('close')
  router.push('/workspace')
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
          <!-- Clicking the wordmark returns to the project index — the first
               thing most people try when they want out of a document. -->
          <button
            class="truncate rounded text-sm font-semibold text-text-primary transition-colors duration-150 hover:text-accent"
            title="All projects"
            @click="goToWorkspace"
          >
            Versatile
          </button>
          <button
            class="ml-auto hidden md:grid place-items-center w-8 h-8 rounded-md text-text-hint hover:text-text-primary hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-150"
            title="Collapse sidebar"
            :aria-expanded="!effectiveCollapsed"
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
          :aria-expanded="!effectiveCollapsed"
          @click="toggleCollapse"
        >
          <BaseIcon name="panel-left-open" :size="18" />
        </button>
      </div>

      <!-- Grouped panels -->
      <div class="relative flex-1 min-h-0">
        <nav
          ref="navEl"
          class="h-full overflow-y-auto py-1.5 scrollbar-thin"
          aria-label="Panels"
          @scroll.passive="updateScrollEdges"
        >
          <div v-for="group in navGroups" :key="group.label" class="px-2">
            <button
              v-if="!effectiveCollapsed"
              type="button"
              class="label-micro w-full flex items-center justify-between px-2 pt-2.5 pb-1 text-text-hint rounded transition-colors duration-150 hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              :aria-expanded="!isGroupCollapsed(group.label)"
              @click="toggleGroup(group.label)"
            >
              <span>{{ group.label }}</span>
              <BaseIcon
                name="chevron-down"
                :size="12"
                class="transition-transform duration-150"
                :class="isGroupCollapsed(group.label) ? '-rotate-90' : ''"
                aria-hidden="true"
              />
            </button>
            <div v-else class="mx-2 my-1.5 border-t border-border-subtle"></div>

            <button
              v-for="item in group.items"
              v-show="effectiveCollapsed || !isGroupCollapsed(group.label)"
              :key="item.panel"
              class="nav-stagger group/item relative w-full flex items-center rounded-md min-h-[34px] text-[0.8125rem] transition-[color,background-color,transform] duration-150 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              :class="[
                effectiveCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                isActive(item.panel)
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              ]"
              :style="{
                animationDelay: staggerDelays[item.panel] + 'ms',
                ...(isActive(item.panel)
                  ? { background: 'rgb(var(--vers-accent-primary-rgb) / 0.12)' }
                  : {})
              }"
              :title="effectiveCollapsed ? labelFor(item) : ''"
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
              <span v-if="!effectiveCollapsed" class="truncate">{{ labelFor(item) }}</span>
            </button>
          </div>
        </nav>
        <div v-show="canScrollUp" class="nav-fade nav-fade-top" aria-hidden="true"></div>
        <div v-show="canScrollDown" class="nav-fade nav-fade-bottom" aria-hidden="true"></div>
      </div>

      <!-- System (pinned) -->
      <div class="shrink-0 px-2 py-1.5 border-t border-border-subtle">
        <button
          v-for="item in systemItems"
          :key="item.panel"
          class="group/item relative w-full flex items-center rounded-md min-h-[34px] text-[0.8125rem] transition-[color,background-color,transform] duration-150 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          :class="[
            effectiveCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
            isActive(item.panel)
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          ]"
          :style="
            isActive(item.panel) ? { background: 'rgb(var(--vers-accent-primary-rgb) / 0.12)' } : {}
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

      <!-- Signed-in identity, recent work, and the way back out to the index. -->
      <SidebarAccount :collapsed="effectiveCollapsed" />
    </aside>
  </div>
</template>

<style scoped>
/* Edge fades: only shown while the list can still scroll in that direction. */
.nav-fade {
  position: absolute;
  left: 0;
  right: 0;
  height: 28px;
  pointer-events: none;
}
.nav-fade-top {
  top: 0;
  background: linear-gradient(to bottom, rgb(var(--vers-bg-panel-rgb)), transparent);
}
.nav-fade-bottom {
  bottom: 0;
  background: linear-gradient(to top, rgb(var(--vers-bg-panel-rgb)), transparent);
}

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
