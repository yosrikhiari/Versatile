<script setup>
import { ref, computed, watch } from 'vue'
import BaseIcon from './BaseIcon.vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Add tag, press Enter'
  }
})

const emit = defineEmits(['update:modelValue'])

const inputValue = ref('')
const tags = ref([...props.modelValue])

watch(() => props.modelValue, (newVal) => {
  tags.value = [...newVal]
}, { deep: true })

function addTag() {
  const tag = inputValue.value.trim().toLowerCase()
  if (tag && !tags.value.includes(tag)) {
    tags.value.push(tag)
    emit('update:modelValue', tags.value)
  }
  inputValue.value = ''
}

function removeTag(index) {
  tags.value.splice(index, 1)
  emit('update:modelValue', tags.value)
}

function handleKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace' && !inputValue.value && tags.value.length > 0) {
    removeTag(tags.value.length - 1)
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 p-2 border border-border-subtle rounded-lg bg-bg-secondary min-h-[40px]">
    <div
      v-for="(tag, index) in tags"
      :key="index"
      class="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full font-ui"
    >
      <span>{{ tag }}</span>
      <button
        @click="removeTag(index)"
        class="text-accent hover:text-white focus:outline-none focus:ring-1 focus:ring-accent rounded"
        type="button"
      >
        <BaseIcon name="x" :size="12" />
      </button>
    </div>
    <input
      v-model="inputValue"
      type="text"
      :placeholder="tags.length === 0 ? placeholder : ''"
      class="flex-1 min-w-[60px] bg-transparent text-sm text-text-primary placeholder:text-text-hint focus:outline-none font-ui"
      @keydown="handleKeydown"
      @blur="addTag"
    />
  </div>
</template>