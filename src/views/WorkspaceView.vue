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
  <div class="min-h-screen bg-manuscript ambient-glow grain">
    <header class="h-12 border-b border-border-subtle flex items-center justify-between px-4 bg-bg-primary/80 backdrop-blur-sm">
      <div class="flex items-center gap-2">
        <BaseIcon name="feather" :size="20" class="text-accent" />
        <span class="text-text-primary font-medium text-sm">Versatile</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-text-secondary text-sm">{{ localUser.displayName }}</span>
        <button
          class="text-text-secondary hover:text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1 transition-colors"
          @click="handleLogout"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="max-w-4xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold text-text-primary">Your Projects</h1>
        <button
          class="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
          @click="showCreate = true"
        >
          <BaseIcon name="plus" :size="16" />
          New Project
        </button>
      </div>

      <div v-if="loading" class="text-center py-12 text-text-secondary">
        Loading projects...
      </div>

      <div v-else-if="projects.length === 0" class="text-center py-12">
        <BaseIcon name="book-open" :size="48" class="mx-auto text-text-tertiary mb-4" />
        <p class="text-text-secondary mb-2">No projects yet</p>
        <p class="text-text-tertiary text-sm mb-4">Create your first project to get started</p>
        <button
          class="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
          @click="showCreate = true"
        >
          Create Project
        </button>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="project in projects"
          :key="project.id"
          class="glass-card rounded-xl p-5 cursor-pointer hover:bg-surface-hover transition-all hover:shadow-warm-lg group"
          @click="openProject(project.id)"
        >
          <div class="flex items-start justify-between mb-3">
            <BaseIcon name="book-open" :size="20" class="text-accent mt-0.5" />
            <span class="text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
          </div>
          <h3 class="text-text-primary font-medium mb-1 truncate">{{ project.name }}</h3>
          <p v-if="project.genre" class="text-text-tertiary text-xs mb-3">{{ project.genre }}</p>
          <p v-else class="text-text-tertiary text-xs mb-3 italic">No genre</p>
          <p class="text-text-tertiary text-xs">
            Updated {{ project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'Never' }}
          </p>
        </div>
      </div>
    </main>

    <div v-if="showCreate" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" @click.self="showCreate = false">
      <div class="glass-modal rounded-xl shadow-warm-lg p-6 w-full max-w-sm animate-scale-in">
        <h2 class="text-lg font-semibold text-text-primary mb-4">New Project</h2>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <div>
            <label class="block text-sm text-text-secondary mb-1">Project Name</label>
            <input
              ref="nameInput"
              v-model="newProjectName"
              type="text"
              required
              class="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="My Novel"
            />
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-1">Genre (optional)</label>
            <input
              v-model="newProjectGenre"
              type="text"
              class="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Fantasy, Sci-Fi, ..."
            />
          </div>
          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 py-2 border border-border-subtle text-text-secondary rounded-lg text-sm hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-accent transition-colors" @click="showCreate = false">
              Cancel
            </button>
            <button type="submit" class="flex-1 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent transition-colors">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
