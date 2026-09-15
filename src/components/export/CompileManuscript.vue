<script setup>
import { ref, computed, watch } from 'vue'
import Modal from '../shared/Modal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseCheckbox from '../ui/BaseCheckbox.vue'
import { compileManuscript, exportCompiled } from '../../services/compileManuscript'
import { useNotifications } from '../../composables/useNotifications'

/**
 * Compile — one workflow, four formats (Longform Compile analog). The
 * options are the compile workflow; the preview is the Markdown the
 * workflow produces, recomputed as the options change.
 */
const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: [String, Number], default: null }
})
const emit = defineEmits(['close', 'export-pdf'])
const { addToast } = useNotifications()

const TITLE_STYLES = [
  { value: 'section', label: 'Chapter titles' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'none', label: 'No headings' }
]

const titleStyle = ref('section')
const includeSceneTitles = ref(false)
const stripFrontmatter = ref(true)
const separator = ref('* * *')
const result = ref(null)
const isCompiling = ref(false)
const exporting = ref(null)
const error = ref(null)

const workflow = computed(() => ({
  titleStyle: titleStyle.value,
  includeSceneTitles: includeSceneTitles.value,
  stripFrontmatter: stripFrontmatter.value,
  separator: separator.value.trim() ? `\n\n${separator.value.trim()}\n\n` : '\n\n'
}))

async function preview() {
  if (!props.projectId) return
  isCompiling.value = true
  error.value = null
  try {
    result.value = await compileManuscript(props.projectId, workflow.value)
  } catch (e) {
    error.value = e?.message || 'Compile failed'
    result.value = null
  } finally {
    isCompiling.value = false
  }
}

async function doExport(format) {
  if (!props.projectId) return
  if (format === 'pdf') {
    emit('export-pdf')
    return
  }
  exporting.value = format
  error.value = null
  try {
    const stats = await exportCompiled(props.projectId, format, workflow.value)
    addToast(
      `Compiled ${stats.sections} chapter${stats.sections === 1 ? '' : 's'}, ${stats.words.toLocaleString()} words as ${format.toUpperCase()}`,
      'success'
    )
  } catch (e) {
    error.value = e?.message || 'Export failed'
  } finally {
    exporting.value = null
  }
}

watch(
  () => [props.show, props.projectId, workflow.value],
  ([open]) => {
    if (open) preview()
  },
  { immediate: true, deep: true }
)

const previewText = computed(() => {
  const md = result.value?.markdown || ''
  return md.length > 4000 ? md.slice(0, 4000) + '\n…' : md
})
</script>

<template>
  <Modal :show="show" @close="emit('close')">
    <div class="p-5 w-[min(44rem,92vw)]" data-test="compile-manuscript">
      <h3 class="type-display text-[11px] text-text-primary">Compile manuscript</h3>
      <p class="mt-1 font-ui text-xs text-text-hint leading-5">
        Every chapter and scene in narrative order — volumes, then chapters, then scenes — as one
        document.
      </p>

      <div class="mt-4 space-y-3">
        <BaseSegmented
          v-model="titleStyle"
          :options="TITLE_STYLES"
          size="sm"
          block
          aria-label="Headings"
        />
        <div class="flex flex-wrap items-center gap-4">
          <BaseCheckbox v-model="includeSceneTitles" label="Scene titles" />
          <BaseCheckbox v-model="stripFrontmatter" label="Strip frontmatter" />
          <label class="flex items-center gap-2 font-ui text-xs text-text-hint">
            Scene break
            <input
              v-model="separator"
              type="text"
              aria-label="Scene separator"
              class="w-24 px-2 py-1 border border-border-subtle rounded bg-bg-secondary text-text-primary font-ui text-xs focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        </div>
      </div>

      <div class="mt-4 flex items-baseline justify-between">
        <span class="label-micro text-text-hint">Preview</span>
        <span v-if="result" class="font-ui text-xs text-text-hint tabular-nums" data-test="stats">
          {{ result.stats.sections }} chapter{{ result.stats.sections === 1 ? '' : 's' }} ·
          {{ result.stats.subsections }} scene{{ result.stats.subsections === 1 ? '' : 's' }} ·
          {{ result.stats.words.toLocaleString() }} words
        </span>
      </div>
      <p v-if="error" class="mt-2 font-ui text-xs text-danger">{{ error }}</p>
      <pre
        v-else
        class="mt-1 max-h-[40vh] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 font-manuscript text-xs text-text-secondary whitespace-pre-wrap leading-5 scrollbar-thin"
        data-test="preview"
        >{{
          isCompiling
            ? 'Compiling…'
            : previewText || 'Nothing to compile yet — add chapters and scenes.'
        }}</pre
      >

      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <BaseButton variant="ghost" size="sm" @click="emit('close')">Close</BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          icon="file-text"
          :disabled="!result?.stats.words"
          data-test="export-markdown"
          :loading="exporting === 'markdown'"
          @click="doExport('markdown')"
        >
          Markdown
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          icon="file-text"
          :disabled="!result?.stats.words"
          data-test="export-docx"
          :loading="exporting === 'docx'"
          @click="doExport('docx')"
        >
          Word (.docx)
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          icon="book-open"
          :disabled="!result?.stats.words"
          data-test="export-epub"
          :loading="exporting === 'epub'"
          @click="doExport('epub')"
        >
          EPUB
        </BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          icon="printer"
          data-test="export-pdf"
          @click="doExport('pdf')"
        >
          PDF
        </BaseButton>
      </div>
    </div>
  </Modal>
</template>
