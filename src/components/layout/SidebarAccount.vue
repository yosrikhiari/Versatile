<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { getAllProjects, getManuscript } from '../../services/db-projects'
import { useProjectStore } from '../../stores/projectStore'
import BaseIcon from '../shared/BaseIcon.vue'
import BasePopover from '../ui/BasePopover.vue'
import { editedAgo, initialsOf } from '../../utils/relativeTime'

/**
 * Sidebar footer identity, and the account card behind it.
 *
 * Before this existed the editor had no signed-in identity and no route back to
 * the project index — a writer deep in a manuscript could only leave via the
 * browser's own back button.
 */
const props = defineProps({
  collapsed: { type: Boolean, default: false }
})

const router = useRouter()
const auth = useAuthStore()
const projectStore = useProjectStore()

const recentProjects = ref([])
const loadingProjects = ref(false)

const displayName = computed(
  () => auth.localUser?.displayName || auth.user?.displayName || auth.user?.username || 'You'
)
const secondaryLine = computed(
  () => auth.localUser?.username || auth.user?.email || auth.user?.username || ''
)
const initials = computed(() => initialsOf(displayName.value))

/**
 * Loaded when the card opens rather than on mount: it is a per-project
 * IndexedDB read each, and the sidebar renders on every editor session.
 */
async function loadRecent() {
  loadingProjects.value = true
  try {
    const userId = auth.localUser?.id
    const raw = userId != null ? await getAllProjects(userId) : await getAllProjects()

    const withMeta = await Promise.all(
      raw.map(async (p) => {
        const manuscript = await getManuscript(p.id)
        const lastEdited =
          [p.updatedAt, manuscript?.updatedAt].filter(Boolean).sort().at(-1) || p.updatedAt
        return { id: p.id, name: p.name, updatedAt: lastEdited }
      })
    )

    recentProjects.value = withMeta
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 4)
  } finally {
    loadingProjects.value = false
  }
}

function openProject(id, close) {
  close()
  if (id !== projectStore.currentProjectId) router.push(`/editor/${id}`)
}

function goToWorkspace(close) {
  close()
  router.push('/workspace')
}

async function signOut(close) {
  close()
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <BasePopover
    placement="top"
    align="start"
    :width="252"
    :label="`Account: ${displayName}`"
    trigger-class="px-2 py-2 border-t border-border-subtle shrink-0"
    @open="loadRecent"
  >
    <template #trigger="{ open, toggle }">
      <button
        class="group/acct w-full flex items-center rounded-md min-h-[40px] text-[0.8125rem] text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary"
        :class="props.collapsed ? 'justify-center px-0' : 'gap-2.5 px-2'"
        :aria-expanded="open"
        aria-haspopup="dialog"
        :title="props.collapsed ? displayName : ''"
        @click="toggle"
      >
        <span
          class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-2xs font-semibold tracking-wide text-accent"
          aria-hidden="true"
        >
          {{ initials }}
        </span>
        <span v-if="!props.collapsed" class="truncate">{{ displayName }}</span>
        <BaseIcon
          v-if="!props.collapsed"
          name="chevron-up"
          :size="14"
          class="ml-auto shrink-0 opacity-50 transition-opacity duration-150 group-hover/acct:opacity-100"
        />
      </button>
    </template>

    <template #default="{ close }">
      <!-- Identity -->
      <div class="flex items-center gap-2.5 border-b border-border-subtle px-3 py-3">
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold tracking-wide text-accent"
          aria-hidden="true"
        >
          {{ initials }}
        </span>
        <div class="min-w-0">
          <p class="truncate font-ui text-xs font-medium text-text-primary">{{ displayName }}</p>
          <p v-if="secondaryLine" class="truncate font-ui text-xs text-text-hint">
            {{ secondaryLine }}
          </p>
        </div>
      </div>

      <!-- Recent work -->
      <div class="px-3 py-2.5">
        <p class="label-micro mb-1.5 text-text-hint">Recent projects</p>

        <p v-if="loadingProjects" class="px-1 py-1.5 font-ui text-xs text-text-hint">Loading…</p>
        <p
          v-else-if="!recentProjects.length"
          class="px-1 py-1.5 font-ui text-xs italic text-text-hint"
        >
          No projects yet
        </p>

        <button
          v-for="project in recentProjects"
          v-else
          :key="project.id"
          class="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors duration-150 hover:bg-surface-hover"
          @click="openProject(project.id, close)"
        >
          <BaseIcon
            name="file-text"
            :size="13"
            :class="
              project.id === projectStore.currentProjectId
                ? 'shrink-0 text-accent'
                : 'shrink-0 text-text-hint'
            "
          />
          <span
            class="min-w-0 flex-1 truncate font-ui text-xs"
            :class="
              project.id === projectStore.currentProjectId
                ? 'font-medium text-text-primary'
                : 'text-text-secondary'
            "
          >
            {{ project.name }}
          </span>
          <span class="shrink-0 font-ui text-xs tabular-nums text-text-hint">
            {{ editedAgo(project.updatedAt).replace('edited ', '') }}
          </span>
        </button>
      </div>

      <!-- Actions -->
      <div class="border-t border-border-subtle p-1.5">
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-ui text-xs text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary"
          @click="goToWorkspace(close)"
        >
          <BaseIcon name="layout-grid" :size="13" class="shrink-0" />
          All projects
        </button>
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-ui text-xs text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-danger"
          @click="signOut(close)"
        >
          <BaseIcon name="log-out" :size="13" class="shrink-0" />
          Sign out
        </button>
      </div>
    </template>
  </BasePopover>
</template>
