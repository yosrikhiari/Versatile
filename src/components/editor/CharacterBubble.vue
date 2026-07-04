<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useBubbleStore } from '../../stores/bubbleStore'
import { useProjectStore } from '../../stores/projectStore'

const props = defineProps({ bubble: Object, containerWidth: Number, containerHeight: Number })
const store = useBubbleStore()
const projectStore = useProjectStore()
const bubbleEl = ref(null)

let dragging = false
let startX, startY, origX, origY
let bubbleWidth = 0, bubbleHeight = 0

const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function onContextMenu(e) {
  e.preventDefault()
  e.stopPropagation()
  showMenu.value = true
  menuX.value = e.clientX
  menuY.value = e.clientY
}

function closeMenu() {
  showMenu.value = false
}

function bringToFront() {
  store.bringToFront(props.bubble.id)
  closeMenu()
}

async function dismiss() {
  closeMenu()
  await store.removeBubbleAndPersist(props.bubble.id)
}

async function chat() {
  closeMenu()
  await store.findOrCreateChatSession(props.bubble.characterId, props.bubble.characterName, projectStore.currentProjectId)
}

function startDrag(e) {
  if (showMenu.value) { closeMenu(); return }
  dragging = true
  store.bringToFront(props.bubble.id)
  startX = e.clientX
  startY = e.clientY
  origX = props.bubble.x
  origY = props.bubble.y
  const el = bubbleEl.value
  if (el) {
    bubbleWidth = el.offsetWidth
    bubbleHeight = el.offsetHeight
  } else {
    bubbleWidth = 0
    bubbleHeight = 0
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!dragging) return
  let newX = origX + e.clientX - startX
  let newY = origY + e.clientY - startY
  const cw = props.containerWidth || Infinity
  const ch = props.containerHeight || Infinity
  newX = Math.max(0, Math.min(newX, cw - bubbleWidth))
  newY = Math.max(0, Math.min(newY, ch - bubbleHeight))
  store.updatePosition(props.bubble.id, newX, newY)
}

function stopDrag() {
  dragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  store.persistBubblePosition(props.bubble.id, projectStore.currentProjectId)
}

function handleClick() {
  if (dragging) return
  store.bringToFront(props.bubble.id)
}

async function handleDoubleClick() {
  await store.removeBubbleAndPersist(props.bubble.id)
}

function onGlobalClick(e) {
  if (showMenu.value) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick)
})
</script>

<template>
  <div
    ref="bubbleEl"
    class="character-bubble"
    :style="{ left: bubble.x + 'px', top: bubble.y + 'px', zIndex: bubble.zIndex }"
    @mousedown.prevent="startDrag"
    @click.stop="handleClick"
    @dblclick.stop="handleDoubleClick"
    @contextmenu.stop="onContextMenu"
  >
    <img
      v-if="bubble.portrait"
      :src="bubble.portrait"
      alt=""
      class="bubble-avatar"
    />
    <div v-else class="bubble-avatar-placeholder">
      {{ bubble.characterName?.[0] || '?' }}
    </div>
    <span class="bubble-name">{{ bubble.characterName }}</span>

    <Teleport to="body">
      <div v-if="showMenu" class="bubble-context-menu" :style="{ left: menuX + 'px', top: menuY + 'px' }">
        <button class="context-item" @click="bringToFront">Bring to Front</button>
        <button class="context-item" @click="dismiss">Dismiss</button>
        <button class="context-item" @click="chat">Chat with Character</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.character-bubble {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  background: var(--vers-bg-elevated, #fff);
  border: 1px solid var(--vers-border, #e0e0e0);
  border-radius: 20px;
  cursor: grab;
  user-select: none;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  font-size: 13px;
  line-height: 1;
}
.character-bubble:active {
  cursor: grabbing;
}
.bubble-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}
.bubble-avatar-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--vers-accent, #6b7280);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.bubble-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style>
.bubble-context-menu {
  position: fixed;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  background: var(--vers-bg-elevated, #fff);
  border: 1px solid var(--vers-border, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  padding: 4px;
  min-width: 160px;
}
.context-item {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 12px;
  text-align: left;
  font-size: 13px;
  color: var(--vers-text-primary, inherit);
  border-radius: 4px;
}
.context-item:hover {
  background: var(--vers-accent, #6b7280);
  color: #fff;
}
</style>
