<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  message: String
})

const emit = defineEmits(['dismiss'])

const visible = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true
  })
  setTimeout(() => {
    visible.value = false
    setTimeout(() => emit('dismiss'), 300)
  }, 3000)
})
</script>

<template>
  <div
    :class="[
      'fixed bottom-6 left-1/2 z-50 px-5 py-2.5 rounded-lg shadow-lg text-sm font-ui text-text-primary bg-bg-tertiary border border-border-subtle max-w-sm text-center transition-all duration-300',
      visible ? 'toast-slide-up opacity-100' : 'opacity-0'
    ]"
  >
    {{ message }}
  </div>
</template>
