<script setup>
/**
 * Import a novel (WHATIF-AND-IMPORT-PLAN.md, step 2): pick a .txt / .md /
 * .docx / .epub / .html file, check the chapters Versatile found, fix what it
 * got wrong, then create the project. Nothing is written before "Import".
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '../shared/Modal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseField from '../ui/BaseField.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { decodeFile } from '../../services/import/decoders'
import { detectStructure } from '../../services/import/structure'
import {
  allChapters,
  renameChapter,
  mergeIntoPrevious,
  excludeChapter
} from '../../services/import/bookEdits'
import { createProjectFromBook } from '../../services/import/writeProject'
import { useAuthStore } from '../../stores/authStore'

const props = defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'imported'])

const router = useRouter()
const ACCEPT = '.txt,.text,.md,.markdown,.docx,.epub,.html,.htm,.xhtml'
const METHOD_LABEL = {
  headings: 'from the headings in the file',
  contents: 'from the book’s table of contents',
  numbering: 'from numbered headings',
  files: 'one chapter per file in the epub',
  none: 'no chapters found'
}

const fileInput = ref(null)
const fileName = ref('')
const encoding = ref('')
const book = ref(null)
const projectName = ref('')
const error = ref('')
const reading = ref(false)
const importing = ref(false)
const dragging = ref(false)

const chapters = computed(() => (book.value ? allChapters(book.value) : []))
const stats = computed(() => {
  const ch = chapters.value
  return {
    chapters: ch.length,
    scenes: ch.reduce((n, c) => n + c.scenes.length, 0),
    words: ch.reduce((n, c) => n + c.scenes.reduce((m, s) => m + s.words, 0), 0)
  }
})

watch(
  () => props.show,
  (open) => {
    if (!open) reset()
  }
)

function reset() {
  fileName.value = ''
  encoding.value = ''
  book.value = null
  projectName.value = ''
  error.value = ''
  reading.value = false
  importing.value = false
}

async function readFile(file) {
  if (!file) return
  reset()
  reading.value = true
  fileName.value = file.name
  try {
    const decoded = await decodeFile(file.name, await file.arrayBuffer())
    encoding.value = decoded.encoding && decoded.encoding !== 'utf-8' ? decoded.encoding : ''
    book.value = detectStructure(decoded.blocks, { title: decoded.title, author: decoded.author })
    projectName.value = book.value.title
    if (!stats.value.words) error.value = 'No text was found in this file.'
  } catch (e) {
    error.value = e?.message || 'This file could not be read.'
    book.value = null
  } finally {
    reading.value = false
  }
}

function onPick(e) {
  readFile(e.target.files?.[0])
  e.target.value = ''
}

function onDrop(e) {
  dragging.value = false
  readFile(e.dataTransfer?.files?.[0])
}

function rename(i, title) {
  book.value = renameChapter(book.value, i, title)
}
function merge(i) {
  book.value = mergeIntoPrevious(book.value, i)
}
function exclude(i) {
  book.value = excludeChapter(book.value, i)
}

async function doImport() {
  if (!book.value || !stats.value.scenes || importing.value) return
  importing.value = true
  error.value = ''
  try {
    const auth = useAuthStore()
    const ownerId = auth.localUser?.id ?? auth.user?.id ?? null
    const written = await createProjectFromBook(book.value, {
      name: projectName.value,
      ownerId
    })
    emit('imported', written)
    emit('close')
    await router.push(`/editor/${written.projectId}`)
  } catch (e) {
    error.value = e?.message || 'The import failed; nothing was saved.'
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <Modal :show="show" max-width="max-w-3xl" aria-label="Import a novel" @close="emit('close')">
    <div class="p-5 w-[min(48rem,94vw)]" data-test="import-novel">
      <h3 class="type-display text-[11px] text-text-primary">Import a novel</h3>
      <p class="mt-1 font-ui text-xs text-text-hint leading-5">
        A .txt, .md, .docx, .epub or .html file. You will see the chapters Versatile found and can
        fix them before anything is saved.
      </p>

      <div
        v-if="!book"
        class="mt-4 grid place-items-center gap-2 rounded border border-dashed px-4 py-10 text-center transition-colors"
        :class="dragging ? 'border-accent bg-bg-secondary' : 'border-border'"
        data-test="drop-zone"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <BaseIcon name="book-open" :size="20" class="text-text-hint" />
        <p class="font-ui text-sm text-text-secondary">
          {{ reading ? `Reading ${fileName}…` : 'Drop a manuscript here' }}
        </p>
        <BaseButton
          variant="secondary"
          size="sm"
          :loading="reading"
          data-test="choose-file"
          @click="fileInput?.click()"
        >
          Choose a file
        </BaseButton>
        <input
          ref="fileInput"
          type="file"
          :accept="ACCEPT"
          class="sr-only"
          aria-label="Manuscript file"
          @change="onPick"
        />
      </div>

      <BaseAlert v-if="error" variant="danger" class="mt-3">{{ error }}</BaseAlert>

      <template v-if="book">
        <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <BaseField v-model="projectName" label="Project name" data-test="project-name" />
          <p class="font-ui text-xs text-text-hint tabular-nums sm:text-right" data-test="stats">
            {{ stats.chapters }} chapter{{ stats.chapters === 1 ? '' : 's' }} ·
            {{ stats.scenes }} scene{{ stats.scenes === 1 ? '' : 's' }} ·
            {{ stats.words.toLocaleString() }} words
          </p>
        </div>
        <p class="mt-2 font-ui text-xs text-text-hint">
          {{ fileName }} · chapters {{ METHOD_LABEL[book.method] }}
          <template v-if="book.author"> · by {{ book.author }}</template>
          <template v-if="encoding"> · read as {{ encoding }}</template>
        </p>
        <BaseAlert v-for="w in book.warnings" :key="w" variant="warning" class="mt-2">
          {{ w }}
        </BaseAlert>

        <div class="mt-4 flex items-baseline justify-between">
          <span class="label-micro text-text-hint">Chapters</span>
          <span class="font-ui text-xs text-text-hint">
            Rename, merge a false chapter into the one before, or leave one out.
          </span>
        </div>
        <ol
          class="mt-1 max-h-[42vh] overflow-auto rounded border border-border-subtle divide-y divide-border-subtle scrollbar-thin"
          data-test="chapter-list"
        >
          <li
            v-for="(c, i) in chapters"
            :key="`${i}-${c.title}`"
            class="flex items-center gap-2 px-3 py-1.5"
          >
            <span class="w-8 shrink-0 font-mono text-xs text-text-hint tabular-nums">
              {{ i + 1 }}
            </span>
            <input
              :value="c.title"
              :aria-label="`Title of chapter ${i + 1}`"
              class="min-w-0 flex-1 bg-transparent font-ui text-sm text-text-primary rounded px-1 py-0.5 hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              @change="rename(i, $event.target.value)"
            />
            <span class="shrink-0 font-mono text-xs text-text-hint tabular-nums">
              {{ c.scenes.length }} sc ·
              {{ c.scenes.reduce((n, s) => n + s.words, 0).toLocaleString() }} w
            </span>
            <BaseButton
              v-if="i > 0"
              variant="ghost"
              size="sm"
              icon="arrow-up"
              :aria-label="`Merge chapter ${i + 1} into the one before`"
              title="Not a chapter: merge into the one before"
              @click="merge(i)"
            />
            <BaseButton
              variant="ghost"
              size="sm"
              icon="x"
              :aria-label="`Leave chapter ${i + 1} out`"
              title="Leave out of the import"
              @click="exclude(i)"
            />
          </li>
        </ol>

        <details v-if="book.frontMatter.length" class="mt-3">
          <summary class="cursor-pointer font-ui text-xs text-text-hint">
            Not imported: {{ book.frontMatter.length }} line{{
              book.frontMatter.length === 1 ? '' : 's'
            }}
            of front matter (title page, contents)
          </summary>
          <p class="mt-1 max-h-32 overflow-auto font-ui text-xs text-text-hint whitespace-pre-line">
            {{ book.frontMatter.slice(0, 40).join('\n') }}
          </p>
        </details>

        <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="reset">Choose another file</BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            :loading="importing"
            :disabled="!stats.scenes || !projectName.trim()"
            data-test="do-import"
            @click="doImport"
          >
            Import {{ stats.chapters }} chapter{{ stats.chapters === 1 ? '' : 's' }}
          </BaseButton>
        </div>
      </template>
      <div v-else class="mt-4 flex justify-end">
        <BaseButton variant="ghost" size="sm" @click="emit('close')">Cancel</BaseButton>
      </div>
    </div>
  </Modal>
</template>
