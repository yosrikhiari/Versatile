<script setup>
import { watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  backdropClass: {
    type: String,
    default: 'bg-black/50'
  },
  panelClass: {
    type: String,
    default: ''
  },
  closeOnBackdrop: {
    type: Boolean,
    default: true
  },
  maxWidth: {
    type: String,
    default: 'max-w-md'
  }
})

const emit = defineEmits(['close'])

function handleBackdropClick() {
  if (props.closeOnBackdrop) {
    emit('close')
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape' && props.show) {
    emit('close')
  }
}

watch(() => props.show, (show) => {
  if (show) {
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        :class="['fixed inset-0 flex items-center justify-center z-50 p-4', backdropClass]"
        @click.self="handleBackdropClick"
      >
        <div
          :class="[
            'bg-bg-tertiary rounded-xl border border-border-subtle shadow-xl w-full overflow-y-auto max-h-[90vh]',
            maxWidth,
            panelClass
          ]"
          @click.stop
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>