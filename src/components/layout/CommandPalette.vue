<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { NAV_GROUPS, SYSTEM_ITEMS } from '../../constants/navigation'

/**
 * Ctrl/⌘-K launcher over every panel and global action.
 *
 * Versatile has sixteen panels and a dozen single-letter shortcuts; the sidebar
 * shows the panels but nothing surfaces the actions, and the shortcuts are only
 * discoverable from the help modal. One searchable list covers both, and gives
 * a keyboard route to panels that are otherwise a mouse trip to the sidebar.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  /** `[{ id, label, icon, hint?, keywords? }]` — non-panel commands. */
  actions: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:open', 'navigate', 'action'])

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref(null)
const listEl = ref(null)
let previouslyFocused = null

const panelCommands = computed(() => [
  ...NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      kind: 'panel',
      id: item.panel,
      label: item.label,
      icon: item.icon,
      group: group.label,
      keywords: item.keywords || []
    }))
  ),
  ...SYSTEM_ITEMS.map((item) => ({
    kind: 'panel',
    id: item.panel,
    label: item.label,
    icon: item.icon,
    group: 'Tools',
    keywords: item.keywords || []
  }))
])

const actionCommands = computed(() =>
  props.actions.map((action) => ({
    kind: 'action',
    id: action.id,
    label: action.label,
    icon: action.icon || 'zap',
    hint: action.hint,
    group: 'Actions',
    keywords: action.keywords || []
  }))
)

const allCommands = computed(() => [...panelCommands.value, ...actionCommands.value])

/**
 * Label matches rank above keyword-only matches, and a prefix above a match in
 * the middle — so typing "not" puts "Notes" before "Cannot".
 */
function score(command, needle) {
  const label = command.label.toLowerCase()
  if (label.startsWith(needle)) return 0
  if (label.includes(needle)) return 1
  if (command.group.toLowerCase().includes(needle)) return 2
  if (command.keywords.some((k) => k.toLowerCase().includes(needle))) return 3
  return -1
}

const results = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return allCommands.value

  return allCommands.value
    .map((command) => ({ command, rank: score(command, needle) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.command)
})

/** Group headers are rendered from the flat list, so the index stays simple. */
const rows = computed(() => {
  const out = []
  let lastGroup = null
  results.value.forEach((command, index) => {
    if (command.group !== lastGroup) {
      out.push({ type: 'header', label: command.group, key: `h-${command.group}-${index}` })
      lastGroup = command.group
    }
    out.push({ type: 'command', command, index, key: `${command.kind}-${command.id}` })
  })
  return out
})

function close() {
  emit('update:open', false)
}

function run(command) {
  close()
  if (command.kind === 'panel') emit('navigate', command.id)
  else emit('action', command.id)
}

function move(delta) {
  const count = results.value.length
  if (!count) return
  activeIndex.value = (activeIndex.value + delta + count) % count
  nextTick(scrollActiveIntoView)
}

function scrollActiveIntoView() {
  listEl.value
    ?.querySelector(`[data-index="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const command = results.value[activeIndex.value]
    if (command) run(command)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(query, () => {
  activeIndex.value = 0
})

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused = document.activeElement
      query.value = ''
      activeIndex.value = 0
      await nextTick()
      inputEl.value?.focus()
    } else if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus()
      previouslyFocused = null
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="anim-fade">
      <div v-if="open" class="fixed inset-0 z-[90] bg-black/50 px-4 pt-[12vh]" @click.self="close">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          class="mx-auto flex max-h-[65vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-strong bg-bg-elevated"
          @keydown="onKeydown"
        >
          <div class="flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-3">
            <BaseIcon name="search" :size="15" class="shrink-0 text-text-hint" />
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="Search panels and actions…"
              aria-label="Search panels and actions"
              class="min-w-0 flex-1 bg-transparent font-ui text-sm text-text-primary outline-none placeholder:text-text-hint"
            />
            <kbd
              class="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-ui text-xs text-text-hint"
            >
              Esc
            </kbd>
          </div>

          <div ref="listEl" class="min-h-0 flex-1 overflow-y-auto p-1.5">
            <p
              v-if="!results.length"
              class="px-2.5 py-6 text-center font-ui text-xs text-text-hint"
            >
              Nothing matches “{{ query }}”.
            </p>

            <template v-for="row in rows" :key="row.key">
              <p v-if="row.type === 'header'" class="label-micro px-2.5 pb-1 pt-2.5 text-text-hint">
                {{ row.label }}
              </p>
              <button
                v-else
                type="button"
                :data-index="row.index"
                :class="[
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150',
                  row.index === activeIndex ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                ]"
                @click="run(row.command)"
                @mousemove="activeIndex = row.index"
              >
                <BaseIcon
                  :name="row.command.icon"
                  :size="15"
                  :class="
                    row.index === activeIndex ? 'shrink-0 text-accent' : 'shrink-0 text-text-hint'
                  "
                />
                <span class="min-w-0 flex-1 truncate font-ui text-xs text-text-primary">
                  {{ row.command.label }}
                </span>
                <kbd
                  v-if="row.command.hint"
                  class="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-ui text-xs text-text-hint"
                >
                  {{ row.command.hint }}
                </kbd>
              </button>
            </template>
          </div>

          <div
            class="flex items-center gap-3 border-t border-border-subtle px-3.5 py-2 font-ui text-xs text-text-hint"
          >
            <span class="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span class="flex items-center gap-1"><kbd>↵</kbd> open</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
