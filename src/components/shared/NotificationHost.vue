<script setup>
import { useNotifications } from '../../composables/useNotifications'
import BaseIcon from '../shared/BaseIcon.vue'

const { toasts, activeConfirm, removeToast } = useNotifications()
</script>

<template>
  <div>
    <!-- Toasts -->
    <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="px-5 py-2.5 rounded-lg shadow-lg text-sm font-ui bg-bg-tertiary border border-border-subtle max-w-md text-center pointer-events-auto flex items-center justify-between gap-3"
          :class="{
            'text-text-primary': toast.type === 'info',
            'text-success border-success/30 bg-success/10': toast.type === 'success',
            'text-danger border-danger/30 bg-danger/10': toast.type === 'danger',
            'text-accent border-accent/30 bg-accent/10': toast.type === 'warning'
          }"
        >
          <span>{{ toast.message }}</span>
          <button class="opacity-50 hover:opacity-100 transition-opacity" @click="removeToast(toast.id)">
            <BaseIcon name="x" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>

    <!-- Confirm Dialog -->
    <Transition name="fade">
      <div v-if="activeConfirm" class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bg-primary/80 backdrop-blur-sm">
        <div class="bg-bg-tertiary border border-border-subtle rounded-xl shadow-2xl max-w-md w-full p-6" @click.stop>
          <h3 class="text-lg font-display text-text-primary mb-2">{{ activeConfirm.title }}</h3>
          <p class="text-text-secondary text-sm font-ui mb-6 whitespace-pre-wrap">{{ activeConfirm.message }}</p>
          
          <div class="flex items-center justify-end gap-3">
            <button 
              class="px-4 py-2 text-sm font-ui text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
              @click="activeConfirm.resolve(false)"
            >
              Cancel
            </button>
            <button 
              class="px-4 py-2 text-sm font-ui font-medium rounded-lg text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-bg-tertiary"
              :class="{
                'bg-danger hover:bg-danger/90 focus:ring-danger': activeConfirm.type === 'danger',
                'bg-accent hover:bg-accent/90 focus:ring-accent': activeConfirm.type === 'primary'
              }"
              @click="activeConfirm.resolve(true)"
            >
              {{ activeConfirm.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>