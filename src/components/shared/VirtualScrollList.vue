<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
  itemHeight: { type: Number, default: 88 },
  buffer: { type: Number, default: 8 },
  keyProp: { type: String, default: 'id' }
})

const scrollContainer = ref(null)
const scrollTop = ref(0)
const containerHeight = ref(0)

const totalHeight = computed(() => props.items.length * props.itemHeight)

const visibleStart = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - props.buffer)
})

const visibleEnd = computed(() => {
  return Math.min(
    props.items.length,
    Math.ceil((scrollTop.value + containerHeight.value) / props.itemHeight) + props.buffer
  )
})

const visibleItems = computed(() => {
  const items = []
  for (let i = visibleStart.value; i < visibleEnd.value; i++) {
    items.push({ item: props.items[i], index: i })
  }
  return items
})

const offsetY = computed(() => visibleStart.value * props.itemHeight)

function onScroll() {
  scrollTop.value = scrollContainer.value?.scrollTop || 0
}

let observer = null

onMounted(() => {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight
    observer = new ResizeObserver(() => {
      containerHeight.value = scrollContainer.value?.clientHeight || 0
    })
    observer.observe(scrollContainer.value)
  }
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})
</script>

<template>
  <div
    ref="scrollContainer"
    class="virtual-scroll-container"
    @scroll="onScroll"
  >
    <div class="virtual-scroll-spacer" :style="{ height: totalHeight + 'px' }">
      <div class="virtual-scroll-content" :style="{ transform: 'translateY(' + offsetY + 'px)' }">
        <div v-for="{ item, index } in visibleItems" :key="item[keyProp] ?? index">
          <slot name="item" :item="item" :index="index" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-scroll-container {
  overflow-y: auto;
  position: relative;
  will-change: scroll-position;
}

.virtual-scroll-spacer {
  position: relative;
  overflow: hidden;
}

.virtual-scroll-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}
</style>
