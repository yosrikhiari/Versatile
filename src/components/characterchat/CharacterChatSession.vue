<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useCharacterChatStore } from '../../stores/characterChatStore'
import { useCharacterChat } from '../../composables/useCharacterChat'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  characterIds: {
    type: Array,
    required: true
  },
  projectId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['close'])

const chatStore = useCharacterChatStore()
const storyBibleStore = useStoryBibleStore()
const { sendMessage, cancelStream } = useCharacterChat()

const inputText = ref('')
const messagesContainer = ref(null)

const characters = computed(() => {
  return props.characterIds
    .map((id) => storyBibleStore.characters.find((c) => c.id === id))
    .filter(Boolean)
})

const headerTitle = computed(() => {
  const names = characters.value.map((c) => c.name)
  if (names.length === 0) return 'Chat'
  if (names.length === 1) return `Chat with ${names[0]}`
  return `Chat with ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
})

const lastStreamingMessage = computed(() => {
  const msgs = chatStore.activeMessages
  if (msgs.length === 0) return null
  const last = msgs[msgs.length - 1]
  if (last.role === 'assistant' && chatStore.isStreaming) return last
  return null
})

function matchesCharacterSet(session) {
  return (
    session &&
    session.characterIds.length === props.characterIds.length &&
    props.characterIds.every((id) => session.characterIds.includes(id))
  )
}

function startOrResumeSession() {
  // Already on the right session — keep its history
  if (matchesCharacterSet(chatStore.activeSession)) return

  // Resume a persisted session for this character set instead of duplicating it
  const existing = chatStore.sessionList.find(
    (s) => s.projectId === props.projectId && matchesCharacterSet(s)
  )
  if (existing) {
    chatStore.setActiveSession(existing.id)
  } else {
    chatStore.startSession(props.characterIds, props.projectId)
  }
}

startOrResumeSession()

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return
  inputText.value = ''
  await sendMessage(text)
  nextTick(scrollToBottom)
}

function handleAbort() {
  cancelStream()
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function getMessageCharacterName(msg) {
  if (!msg.characterId) return null
  const c = storyBibleStore.characters.find((ch) => ch.id === msg.characterId)
  return c?.name || null
}

function getMessagePortrait(msg) {
  if (!msg.characterId) return null
  const c = storyBibleStore.characters.find((ch) => ch.id === msg.characterId)
  return c?.portrait || null
}

watch(
  () => chatStore.activeMessages.length,
  () => nextTick(scrollToBottom)
)

watch(
  () => chatStore.isStreaming,
  () => nextTick(scrollToBottom)
)
</script>

<template>
  <div class="flex flex-col h-full bg-bg-primary rounded-lg overflow-hidden">
    <div
      class="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-tertiary/50"
    >
      <h3 class="text-sm font-medium text-text-primary">{{ headerTitle }}</h3>
      <button
        class="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
        title="Close"
        @click="emit('close')"
      >
        <BaseIcon name="x" :size="16" class="text-text-hint" />
      </button>
    </div>

    <div
      v-if="chatStore.activeMessages.length === 0"
      class="flex-1 flex flex-col items-center justify-center text-center px-6"
    >
      <BaseIcon name="message-square" :size="40" class="text-text-hint/40 mb-3" />
      <p class="text-sm text-text-hint max-w-xs">
        Start a conversation with
        {{ characters.length === 1 ? characters[0].name : 'your characters' }}. Ask questions,
        explore their backstory, or develop dialogue.
      </p>
    </div>

    <div
      v-else
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth"
    >
      <div
        v-for="msg in chatStore.activeMessages"
        :key="msg.id"
        :class="['flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start']"
      >
        <div v-if="msg.role !== 'user'" class="flex-shrink-0 self-end">
          <img
            v-if="getMessagePortrait(msg)"
            :src="getMessagePortrait(msg)"
            :alt="getMessageCharacterName(msg) || 'Character'"
            class="w-7 h-7 rounded-full object-cover"
          />
          <div v-else class="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
            <BaseIcon name="user" :size="12" class="text-accent" />
          </div>
        </div>

        <div
          :class="[
            'max-w-[75%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
            msg.role === 'user'
              ? 'bg-accent/15 text-text-primary rounded-br-md'
              : 'bg-bg-tertiary border border-border-subtle text-text-primary rounded-bl-md'
          ]"
        >
          <div
            v-if="msg.role !== 'user' && getMessageCharacterName(msg)"
            class="text-xs font-medium text-accent mb-1"
          >
            {{ getMessageCharacterName(msg) }}
          </div>
          <div>{{ msg.content }}</div>
        </div>
      </div>

      <div v-if="chatStore.isStreaming" class="flex justify-start gap-2">
        <div
          class="max-w-[75%] rounded-lg px-3 py-2 bg-bg-tertiary border border-border-subtle text-sm rounded-bl-md"
        >
          <div class="flex items-center gap-1.5">
            <span
              class="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
              style="animation-delay: 0ms"
            />
            <span
              class="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
              style="animation-delay: 150ms"
            />
            <span
              class="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
              style="animation-delay: 300ms"
            />
          </div>
        </div>
      </div>

      <div v-if="chatStore.streamError && !chatStore.isStreaming" class="flex justify-center">
        <div class="text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg">
          {{ chatStore.streamError }}
        </div>
      </div>
    </div>

    <div class="px-4 py-3 border-t border-border-subtle bg-bg-tertiary/50">
      <div class="flex items-center gap-2">
        <textarea
          v-model="inputText"
          class="flex-1 bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-hint resize-none outline-none focus:ring-1 focus:ring-accent/50 min-h-[38px] max-h-[120px]"
          placeholder="Type a message..."
          rows="1"
          :disabled="chatStore.isStreaming"
          @keydown="handleKeydown"
        />
        <button
          v-if="!chatStore.isStreaming"
          class="p-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          :disabled="!inputText.trim()"
          title="Send"
          @click="handleSend"
        >
          <BaseIcon name="send" :size="16" />
        </button>
        <button
          v-else
          class="p-2 bg-red-400/10 text-red-400 rounded-lg hover:bg-red-400/20 transition-colors flex-shrink-0"
          title="Stop generating"
          @click="handleAbort"
        >
          <BaseIcon name="stop-circle" :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
