<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { getAllProjects, createProject } from '../services/db-projects'
import BaseIcon from '../components/shared/BaseIcon.vue'

const router = useRouter()
const auth = useAuthStore()

const projects = ref([])
const loading = ref(true)
const showCreate = ref(false)
const newProjectName = ref('')
const newProjectGenre = ref('')

const localUser = auth.localUser || { displayName: 'User' }

onMounted(async () => {
  if (auth.localUser?.id != null) {
    projects.value = await getAllProjects(auth.localUser.id)
  } else {
    projects.value = await getAllProjects()
  }
  loading.value = false
})

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
  <div class="min-h-[100dvh] bg-manuscript ambient-glow grain">
    <header class="h-12 border-b border-border-subtle flex items-center justify-between px-4 lg:px-8 bg-bg-primary/80 backdrop-blur-sm">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg liquid-glass flex items-center justify-center">
          <BaseIcon name="feather" :size="16" class="text-accent" />
        </div>
        <span class="text-text-primary font-medium text-sm">Versatile</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-text-secondary text-xs hidden sm:inline">{{ localUser.displayName }}</span>
        <button
          class="text-text-secondary hover:text-text-primary text-xs transition-colors px-2 py-1 rounded-md hover:liquid-glass focus:outline-none focus:ring-2 focus:ring-accent/50"
          @click="handleLogout"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="max-w-5xl mx-auto p-6 lg:p-10">
      <div class="flex items-end justify-between mb-8">
        <div class="spring-enter-active">
          <h1 class="text-3xl font-semibold text-text-primary">Your Projects</h1>
          <p class="text-sm text-text-secondary mt-1">Pick up where you left off</p>
        </div>
        <button
          class="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
          @click="showCreate = true"
        >
          <BaseIcon name="plus" :size="16" />
          New Project
        </button>
      </div>

      <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-text-secondary gap-3">
        <svg class="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="text-sm">Loading projects...</span>
      </div>

      <div v-else-if="projects.length === 0" class="flex flex-col items-center justify-center py-20 spring-enter-active">
        <div class="w-20 h-20 rounded-2xl liquid-glass flex items-center justify-center mb-6">
          <BaseIcon name="book-open" :size="36" class="text-text-tertiary" />
        </div>
        <p class="text-text-primary font-medium mb-1">No projects yet</p>
        <p class="text-text-secondary text-sm mb-6">Create your first project and begin writing</p>
        <button
          class="btn-primary px-5 py-2 rounded-lg text-sm"
          @click="showCreate = true"
        >
          Create Project
        </button>
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <div
          v-for="(project, index) in projects"
          :key="project.id"
          class="liquid-glass rounded-xl p-5 cursor-pointer group spring-enter-active"
          :style="{ transitionDelay: `${index * 60}ms` }"
          @click="openProject(project.id)"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="w-10 h-10 rounded-lg bg-bg-secondary border border-border-subtle flex items-center justify-center group-hover:border-accent/30 transition-colors">
              <BaseIcon name="book-open" :size="20" class="text-accent" />
            </div>
            <BaseIcon
              name="chevron-right"
              :size="18"
              class="text-text-tertiary opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-x-1 group-hover:translate-x-0"
            />
          </div>
          <h3 class="text-text-primary font-medium mb-1 truncate text-base">{{ project.name }}</h3>
          <p v-if="project.genre" class="text-text-tertiary text-xs mb-4">{{ project.genre }}</p>
          <p v-else class="text-text-tertiary text-xs mb-4 italic">No genre</p>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 mt-auto">
            <span class="text-text-secondary/60 text-xs">
              Updated {{ project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'Never' }}
            </span>
          </div>
        </div>
      </div>
    </main>

    <div v-if="showCreate" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" @click.self="showCreate = false">
      <div class="liquid-glass rounded-xl shadow-warm-lg p-6 w-full max-w-sm spring-enter-active">
        <h2 class="text-lg font-semibold text-text-primary mb-4">New Project</h2>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <div>
            <label class="block text-sm text-text-secondary mb-1">Project Name</label>
            <input
              ref="nameInput"
              v-model="newProjectName"
              type="text"
              required
              class="w-full px-3 py-2.5 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
              placeholder="My Novel"
            />
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-1">Genre (optional)</label>
            <input
              v-model="newProjectGenre"
              type="text"
              class="w-full px-3 py-2.5 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
              placeholder="Fantasy, Sci-Fi, ..."
            />
          </div>
          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 py-2 border border-border-subtle text-text-secondary rounded-lg text-sm hover:bg-surface-hover transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent/50" @click="showCreate = false">
              Cancel
            </button>
            <button type="submit" class="btn-primary flex-1 py-2 rounded-lg text-sm">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
