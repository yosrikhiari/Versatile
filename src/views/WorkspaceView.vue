<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { getAllProjects, createProject, getManuscript } from '../services/db-projects'
import BaseIcon from '../components/shared/BaseIcon.vue'
import OrganizationSwitcher from '../components/org/OrganizationSwitcher.vue'
import CreateOrganizationDialog from '../components/org/CreateOrganizationDialog.vue'

const router = useRouter()
const auth = useAuthStore()

const showCreateOrg = ref(false)

const projects = ref([])
const loading = ref(true)
const showCreate = ref(false)
const newProjectName = ref('')
const newProjectGenre = ref('')

const localUser = auth.localUser || { displayName: 'User' }

onMounted(async () => {
  const raw =
    auth.localUser?.id != null
      ? await getAllProjects(auth.localUser.id)
      : await getAllProjects()
  // Attach each project's real word count from its manuscript (the app's own
  // authoritative per-project count — see projectStore).
  projects.value = await Promise.all(
    raw.map(async (p) => {
      const manuscript = await getManuscript(p.id)
      // "Last edited" = most recent of the project row (metadata edits) and the
      // manuscript (actual writing). ISO strings sort chronologically.
      const lastEdited =
        [p.updatedAt, manuscript?.updatedAt].filter(Boolean).sort().at(-1) || p.updatedAt
      return { ...p, wordCount: manuscript?.wordCount || 0, updatedAt: lastEdited }
    })
  )
  loading.value = false
})

function formatWords(count) {
  if (!count) return 'Empty draft'
  return `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
}

function editedAgo(iso) {
  if (!iso) return 'never edited'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'edited just now'
  if (min < 60) return `edited ${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `edited ${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `edited ${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `edited ${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `edited ${mo}mo ago`
  return `edited ${Math.floor(day / 365)}y ago`
}

function openProject(projectId) {
  router.push(`/editor/${projectId}`)
}

async function handleCreate() {
  if (!newProjectName.value.trim()) return
  const id = await createProject(
    newProjectName.value.trim(),
    newProjectGenre.value,
    '',
    auth.localUser?.id ?? undefined
  )
  showCreate.value = false
  newProjectName.value = ''
  newProjectGenre.value = ''
  router.push(`/editor/${id}`)
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <!-- Manuscript Mono · projects as a manuscript index: hairline-ruled rows, no glass/glow. -->
  <div class="min-h-[100dvh] bg-manuscript text-text-primary overflow-y-auto">
    <header
      class="h-14 border-b border-border-subtle flex items-center justify-between px-6 lg:px-8"
    >
      <div class="flex items-center gap-6">
        <span class="font-manuscript text-sm uppercase tracking-[0.2em] text-text-primary">
          Versatile
        </span>
        <div v-if="auth.organizations.length > 0" class="hidden sm:block">
          <OrganizationSwitcher @create-org="showCreateOrg = true" />
        </div>
        <button
          v-else
          class="text-xs text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2"
          @click="showCreateOrg = true"
        >
          Create organization
        </button>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-text-secondary text-xs hidden sm:inline">
          {{ localUser.displayName }}
        </span>
        <button
          class="text-text-secondary hover:text-text-primary text-xs transition-colors"
          @click="handleLogout"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 lg:px-8 py-10 animate-fade-in">
      <div class="flex items-end justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-text-primary">Your projects</h1>
          <p class="text-sm text-text-secondary mt-1">Pick up where you left off.</p>
        </div>
        <button
          class="btn-primary flex items-center gap-2 px-4 py-2 rounded-md text-sm shrink-0"
          @click="showCreate = true"
        >
          <BaseIcon name="plus" :size="16" />
          New
        </button>
      </div>

      <div
        v-if="loading"
        class="flex flex-col items-center justify-center py-20 text-text-secondary gap-3"
      >
        <svg class="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span class="text-sm">Loading projects…</span>
      </div>

      <div
        v-else-if="projects.length === 0"
        class="border-t border-border-subtle py-20 flex flex-col items-center text-center"
      >
        <BaseIcon name="book-open" :size="28" class="text-text-hint mb-4" />
        <p class="text-text-primary font-medium mb-1">No projects yet</p>
        <p class="text-text-secondary text-sm mb-6">Create your first project and begin writing.</p>
        <button class="btn-primary px-5 py-2 rounded-md text-sm" @click="showCreate = true">
          Create project
        </button>
      </div>

      <div v-else class="border-t border-border-subtle">
        <button
          v-for="project in projects"
          :key="project.id"
          type="button"
          class="group w-full flex flex-col gap-1 border-b border-border-subtle px-2 py-4 text-left transition-colors hover:bg-surface-hover"
          @click="openProject(project.id)"
        >
          <span class="w-full flex items-baseline justify-between gap-4">
            <span
              class="min-w-0 truncate text-base font-medium text-text-primary group-hover:text-accent transition-colors"
            >
              {{ project.name }}
            </span>
            <span v-if="project.genre" class="shrink-0 text-xs text-text-hint">
              {{ project.genre }}
            </span>
          </span>
          <span class="text-xs text-text-hint">
            {{ formatWords(project.wordCount) }}
            <span aria-hidden="true" class="px-1">·</span>
            {{ editedAgo(project.updatedAt) }}
          </span>
        </button>
      </div>
    </main>

    <div
      v-if="showCreate"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      @click.self="showCreate = false"
    >
      <div
        class="bg-bg-secondary border border-border-subtle rounded-xl shadow-warm-lg p-6 w-full max-w-sm animate-fade-in"
      >
        <h2 class="text-lg font-semibold text-text-primary mb-4">New project</h2>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <div>
            <label for="wp-name" class="block font-manuscript text-xs text-text-secondary mb-2">
              Project name
            </label>
            <input
              id="wp-name"
              ref="nameInput"
              v-model="newProjectName"
              type="text"
              required
              autofocus
              class="w-full px-3.5 py-2.5 border border-border-subtle bg-bg-primary text-text-primary rounded-md text-sm focus:border-accent placeholder:text-text-hint transition-colors"
              placeholder="My Novel"
            />
          </div>
          <div>
            <label for="wp-genre" class="block font-manuscript text-xs text-text-secondary mb-2">
              Genre <span class="text-text-hint">(optional)</span>
            </label>
            <input
              id="wp-genre"
              v-model="newProjectGenre"
              type="text"
              class="w-full px-3.5 py-2.5 border border-border-subtle bg-bg-primary text-text-primary rounded-md text-sm focus:border-accent placeholder:text-text-hint transition-colors"
              placeholder="Fantasy, Sci-Fi, …"
            />
          </div>
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              class="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-sm hover:bg-surface-hover transition-colors"
              @click="showCreate = false"
            >
              Cancel
            </button>
            <button type="submit" class="btn-primary flex-1 py-2 rounded-md text-sm">Create</button>
          </div>
        </form>
      </div>
    </div>

    <CreateOrganizationDialog
      v-if="showCreateOrg"
      @close="showCreateOrg = false"
    />
  </div>
</template>
