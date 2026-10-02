<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { getAllProjects, getManuscript } from '../services/db-projects'
import { seedSampleStory } from '../services/seedSampleStory'
import { editedAgo } from '../utils/relativeTime'
import { useWritingStats } from '../composables/useWritingStats'
import WritingStatsPanel from '../components/workspace/WritingStatsPanel.vue'
import Sparkline from '../components/workspace/Sparkline.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import EmptyState from '../components/shared/EmptyState.vue'
import OrganizationSwitcher from '../components/org/OrganizationSwitcher.vue'
import CreateOrganizationDialog from '../components/org/CreateOrganizationDialog.vue'
import ImportNovelModal from '../components/import/ImportNovelModal.vue'
import NewProjectDialog from '../components/layout/NewProjectDialog.vue'

const router = useRouter()
const auth = useAuthStore()

const showCreateOrg = ref(false)

const projects = ref([])
const loading = ref(true)
const showCreate = ref(false)
const showImportNovel = ref(false)
const seedingSample = ref(false)

const localUser = auth.localUser || { displayName: 'User' }

// Destructured so each ref is a top-level binding and auto-unwraps in the
// template; reaching through `stats.x.value` works but silently renders a ref
// object the moment a `.value` is forgotten.
const {
  load: loadWritingStats,
  buildGrid,
  seriesFor,
  wordsThisWeek,
  streaks,
  activeDays,
  bestDay,
  bestWeekday,
  totalWordsWritten
} = useWritingStats()

const heatmapColumns = ref([])

onMounted(async () => {
  const raw =
    auth.localUser?.id != null ? await getAllProjects(auth.localUser.id) : await getAllProjects()
  // Attach each project's real word count from its manuscript (the app's own
  // authoritative per-project count — see projectStore).
  projects.value = await Promise.all(
    raw.map(async (p) => {
      const manuscript = await getManuscript(p.id)
      // "Last edited" = most recent of the project row (metadata edits) and the
      // manuscript (actual writing). ISO strings sort chronologically.
      const lastEdited =
        [p.updatedAt, manuscript?.updatedAt].filter(Boolean).sort().at(-1) || p.updatedAt
      // The project row carries the whole-manuscript total (root + sections),
      // written on every save. Projects predating that field fall back to the
      // root document's count.
      const wordCount = typeof p.wordCount === 'number' ? p.wordCount : manuscript?.wordCount || 0
      return { ...p, wordCount, updatedAt: lastEdited }
    })
  )

  // Writing history for the activity panel — one query over dailyGoals for all
  // of this user's projects, after the list is known.
  // An imported book starts from what it arrived with; one imported before
  // `importedWords` existed starts from its first recorded day.
  const startFrom = Object.fromEntries(
    projects.value
      .filter((p) => p.source === 'import')
      .map((p) => [String(p.id), typeof p.importedWords === 'number' ? p.importedWords : 'first'])
  )
  await loadWritingStats(
    projects.value.map((p) => p.id),
    startFrom
  )
  heatmapColumns.value = buildGrid(26)

  loading.value = false
})

function formatWords(count) {
  if (!count) return 'Empty draft'
  return `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`
}

function openProject(projectId) {
  router.push(`/editor/${projectId}`)
}

/**
 * A first run has nothing to open. The sample is four scenes of real prose
 * with a small bible, so every panel has something true to show before the
 * writer has typed a word; it is a normal project once created.
 */
async function openSample() {
  seedingSample.value = true
  try {
    const { projectId } = await seedSampleStory(auth.localUser?.id ?? null)
    openProject(projectId)
  } finally {
    seedingSample.value = false
  }
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
        <!-- Organizations live on the server. A local session has none to
             join and nowhere to create one, so the link is not shown to it. -->
        <BaseButton
          v-else-if="!auth.localUser"
          variant="ghost"
          size="sm"
          custom-class="underline underline-offset-2"
          @click="showCreateOrg = true"
        >
          Create organization
        </BaseButton>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-text-secondary text-xs hidden sm:inline">
          {{ localUser.displayName }}
        </span>
        <BaseButton variant="ghost" size="sm" @click="handleLogout"> Sign out </BaseButton>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 lg:px-8 py-10 animate-fade-in">
      <div class="flex items-end justify-between mb-8">
        <div>
          <h1 class="type-display text-base text-text-primary">Your projects</h1>
          <p class="text-sm text-text-secondary mt-1">
            {{
              projects.length
                ? 'Pick up where you left off.'
                : 'Start a project, or open the sample to see the tools on a real draft.'
            }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <BaseButton
            variant="ghost"
            size="lg"
            icon="book-open"
            data-test="import-novel"
            @click="showImportNovel = true"
          >
            Import a novel
          </BaseButton>
          <BaseButton variant="primary" size="lg" icon="plus" @click="showCreate = true">
            New
          </BaseButton>
        </div>
      </div>

      <!-- Stats only once there is something to chart; a first run got a
           panel that could only say it had nothing to say. -->
      <WritingStatsPanel
        v-if="!loading && projects.length > 0"
        class="mb-8"
        :columns="heatmapColumns"
        :words-this-week="wordsThisWeek"
        :streaks="streaks"
        :active-days="activeDays"
        :best-day="bestDay"
        :best-weekday="bestWeekday"
        :total-words-written="totalWordsWritten"
      />

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

      <EmptyState
        v-else-if="projects.length === 0"
        icon="book-open"
        title="No projects yet"
        description="Create your first project and begin writing — or open the sample story: two chapters, a small story bible, every panel with something to show."
        action-label="Create project"
        class="border-t border-border-subtle"
        @action="showCreate = true"
      >
        <BaseButton
          variant="ghost"
          size="sm"
          icon="book-marked"
          custom-class="mt-3"
          :loading="seedingSample"
          :disabled="seedingSample"
          data-test="open-sample"
          @click="openSample"
        >
          Open the sample story
        </BaseButton>
        <BaseButton
          variant="ghost"
          size="sm"
          icon="book-open"
          custom-class="mt-1"
          data-test="import-novel-empty"
          @click="showImportNovel = true"
        >
          Import a novel you have already written
        </BaseButton>
      </EmptyState>

      <div v-else class="border-t border-border-subtle">
        <BaseButton
          v-for="project in projects"
          :key="project.id"
          variant="ghost"
          size="lg"
          custom-class="group w-full flex flex-col gap-1 border-b border-border-subtle px-2 py-4 text-left"
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
          <span class="w-full flex items-center justify-between gap-4">
            <span class="text-xs text-text-hint">
              {{ formatWords(project.wordCount) }}
              <span aria-hidden="true" class="px-1">·</span>
              {{ editedAgo(project.updatedAt) }}
            </span>
            <!-- Growth glyph, not a chart: it answers "is this one moving?" -->
            <Sparkline :points="seriesFor(project.id)" />
          </span>
        </BaseButton>
      </div>
    </main>

    <NewProjectDialog :show="showCreate" @close="showCreate = false" />

    <CreateOrganizationDialog v-if="showCreateOrg" @close="showCreateOrg = false" />
    <ImportNovelModal :show="showImportNovel" @close="showImportNovel = false" />
  </div>
</template>
