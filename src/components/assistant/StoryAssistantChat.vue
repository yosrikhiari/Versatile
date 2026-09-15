<script setup>
import { ref, watch, nextTick } from 'vue'
import Modal from '../shared/Modal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseChip from '../ui/BaseChip.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useStoryAssistantStore } from '../../stores/useStoryAssistantStore'

/**
 * Ask your story — grounded answers with citation chips that open the scene.
 * Not a character: the manuscript answering about itself.
 */
const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'navigate'])

const assistant = useStoryAssistantStore()
const question = ref('')
const input = ref(null)
const log = ref(null)

const KIND_LABEL = {
  subsection: 'Scene',
  section: 'Chapter',
  character: 'Character',
  location: 'Location',
  thread: 'Thread'
}

async function submit() {
  const q = question.value.trim()
  if (!q || assistant.isAnswering) return
  question.value = ''
  await assistant.ask(q)
  await nextTick()
  log.value?.scrollTo?.({ top: log.value.scrollHeight, behavior: 'smooth' })
}

function openCitation(c) {
  const { handled } = assistant.openCitation(c)
  if (!handled) emit('navigate', { kind: c.kind, refId: c.refId, title: c.title })
  emit('close')
}

watch(
  () => props.show,
  async (open) => {
    if (open) {
      await nextTick()
      input.value?.focus?.()
    }
  }
)
</script>

<template>
  <Modal :show="show" @close="emit('close')">
    <div class="p-5 w-[min(44rem,92vw)] flex flex-col" data-test="story-assistant">
      <div class="flex items-baseline justify-between gap-3">
        <div>
          <h3 class="type-display text-[11px] text-text-primary">Ask your story</h3>
          <p class="mt-1 font-ui text-xs text-text-hint leading-5">
            Answers come only from your scenes and bible, with citations. Nothing leaves the device.
          </p>
        </div>
        <BaseButton
          v-if="assistant.hasHistory"
          variant="ghost"
          size="sm"
          data-test="clear-chat"
          @click="assistant.clear()"
        >
          Clear
        </BaseButton>
      </div>

      <div
        ref="log"
        class="mt-3 max-h-[50vh] overflow-y-auto space-y-3 scrollbar-thin"
        data-test="turns"
      >
        <div
          v-if="!assistant.hasHistory"
          class="py-6 text-center font-ui text-xs text-text-hint leading-5"
        >
          Try "where does Ines first doubt Halim?" or "what does the ledger prove?"
        </div>
        <div
          v-for="t in assistant.turns"
          :key="t.id"
          :data-test="`turn-${t.role}`"
          class="rounded-lg px-3 py-2"
          :class="t.role === 'user' ? 'bg-bg-elevated ml-8' : 'bg-bg-secondary mr-8'"
        >
          <p v-if="t.error" class="font-ui text-xs text-danger">{{ t.error }}</p>
          <p
            v-else-if="t.role === 'assistant' && !t.text && assistant.isAnswering"
            class="flex items-center gap-2 font-ui text-xs text-text-hint"
          >
            <BaseIcon name="loader-2" :size="12" class="animate-spin text-accent" /> Reading…
          </p>
          <p v-else class="font-ui text-sm text-text-primary leading-6 whitespace-pre-wrap">
            {{ t.text }}
          </p>
          <div v-if="t.citations.length" class="mt-2 flex flex-wrap gap-1.5" data-test="citations">
            <BaseChip
              v-for="c in t.citations"
              :key="`${c.kind}:${c.refId}`"
              variant="filter"
              :title="c.text"
              :data-test="`cite-${c.n}`"
              @click="openCitation(c)"
            >
              [{{ c.n }}] {{ KIND_LABEL[c.kind] || c.kind }} · {{ c.title || c.refId }}
            </BaseChip>
          </div>
        </div>
      </div>

      <form class="mt-3 flex gap-2" @submit.prevent="submit">
        <input
          ref="input"
          v-model="question"
          type="text"
          placeholder="Ask about the manuscript…"
          aria-label="Ask your story"
          :disabled="assistant.isAnswering"
          class="flex-1 px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-text-hint"
        />
        <BaseButton
          type="submit"
          variant="primary"
          size="md"
          icon="send"
          :loading="assistant.isAnswering"
          :disabled="assistant.isAnswering || !question.trim()"
        >
          Ask
        </BaseButton>
      </form>
    </div>
  </Modal>
</template>
