<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import {
  getRevisionComments,
  addRevisionComment,
  deleteRevisionComment
} from '../../services/dbService'
import EmptyState from '../shared/EmptyState.vue'

const projectStore = useProjectStore()

const comments = ref([])
const selectedText = ref('')
const selectedRange = ref(null)
const commentInput = ref('')
const showCommentInput = ref(false)
const commentInputPosition = ref({ top: 0, left: 0 })

async function loadComments() {
  if (!projectStore.currentProjectId) return
  comments.value = await getRevisionComments(projectStore.currentProjectId)
}

async function handleTextSelection() {
  const selection = window.getSelection()
  const text = selection.toString().trim()

  if (!text) {
    showCommentInput.value = false
    return
  }

  selectedText.value = text

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  selectedRange.value = {
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    paragraphIndex: getParagraphIndex(range.startContainer)
  }

  commentInputPosition.value = {
    top: rect.bottom + window.scrollY + 10,
    left: rect.left + window.scrollX
  }

  showCommentInput.value = true
}

function getParagraphIndex(node) {
  let current = node
  while (current && current.nodeName !== 'BODY') {
    if (current.classList && current.classList.contains('paragraph-block')) {
      return parseInt(current.dataset.index, 10)
    }
    current = current.parentNode
  }
  return 0
}

const justSaved = ref(false)

async function saveComment() {
  if (!commentInput.value.trim() || !selectedRange.value) return

  await addRevisionComment(projectStore.currentProjectId, {
    paragraphIndex: selectedRange.value.paragraphIndex,
    startOffset: selectedRange.value.startOffset,
    endOffset: selectedRange.value.endOffset,
    selectedText: selectedText.value,
    comment: commentInput.value.trim()
  })

  commentInput.value = ''
  showCommentInput.value = false
  await loadComments()

  justSaved.value = true
  setTimeout(() => {
    justSaved.value = false
  }, 1500)
}

async function removeComment(id) {
  await deleteRevisionComment(id)
  await loadComments()
}

function getCommentsForParagraph(index) {
  return comments.value.filter((c) => c.paragraphIndex === index)
}

const paragraphs = computed(() => {
  const paras = projectStore.documentContentRaw.split('\n').filter((p) => p.trim())
  return paras.map((text, index) => ({
    index,
    text,
    comments: getCommentsForParagraph(index)
  }))
})

onMounted(loadComments)

watch(() => projectStore.currentProjectId, loadComments)
</script>

<template>
  <div class="h-full flex flex-col bg-manuscript">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
      <div class="flex items-center justify-between">
        <span class="font-ui text-accent tracking-wide">Revise</span>
        <span class="text-xs text-text-hint font-ui"
          >{{ comments.length }} comment{{ comments.length !== 1 ? 's' : '' }}</span
        >
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-8" @mouseup="handleTextSelection">
      <div class="max-w-[680px] mx-auto">
        <EmptyState
          v-if="paragraphs.length === 0"
          icon="edit-3"
          title="Nothing to review"
          description="Write something in Flow mode, then come here to review"
        />

        <template v-for="(para, index) in paragraphs" :key="index">
          <div class="paragraph-block relative mb-6" :data-index="index">
            <div class="text-lg leading-relaxed text-text-primary">
              {{ para.text }}
            </div>

            <div
              v-for="comment in para.comments"
              :key="comment.id"
              :class="[
                'mt-3 p-3 bg-accent-muted/20 border-l-2 border-accent rounded-r-lg text-sm transition-all duration-300',
                justSaved ? 'ring-2 ring-success' : ''
              ]"
            >
              <div class="flex justify-between items-start gap-2">
                <div>
                  <span class="text-accent font-medium text-sm">"{{ comment.selectedText }}"</span>
                  <p class="text-text-secondary mt-1 font-ui text-sm">{{ comment.comment }}</p>
                </div>
                <button
                  class="text-text-hint hover:text-danger text-lg leading-none shrink-0 focus:outline-none focus:ring-2 focus:ring-accent rounded"
                  @click="removeComment(comment.id)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="index < paragraphs.length - 1 && para.comments.length > 0"
            class="border-b border-border-subtle/50 my-4"
          ></div>
        </template>
      </div>
    </div>

    <div
      v-if="showCommentInput"
      class="fixed bg-bg-tertiary rounded-lg shadow-lg border border-border-subtle p-3 z-50"
      :style="{ top: commentInputPosition.top + 'px', left: commentInputPosition.left + 'px' }"
    >
      <div class="text-xs text-text-hint font-ui mb-2 truncate max-w-[200px] italic">
        "{{ selectedText }}"
      </div>
      <textarea
        v-model="commentInput"
        class="w-64 h-20 px-2 py-1 border border-border-subtle rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 bg-bg-secondary text-text-primary font-ui placeholder:text-text-hint"
        placeholder="Add your comment..."
        autofocus
        @keydown.enter.ctrl="saveComment"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <button
          class="px-3 py-1 text-xs text-text-hint hover:text-text-secondary font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded"
          @click="showCommentInput = false"
        >
          Cancel
        </button>
        <button
          class="px-3 py-1 text-xs bg-accent text-accent-foreground rounded hover:bg-accent/90 font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @click="saveComment"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
