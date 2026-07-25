<script setup>
import { computed } from 'vue'
import { useNotifications } from '../../composables/useNotifications'
import BaseIcon from '../shared/BaseIcon.vue'

const { toasts, activeConfirm, toastPosition, removeToast, dismissAllToasts, runToastAction } =
  useNotifications()

// Map the configured stack position to fixed-position utility classes.
const positionClass = computed(
  () =>
    ({
      'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2 flex-col',
      'bottom-right': 'bottom-6 right-6 flex-col items-end',
      'top-center': 'top-6 left-1/2 -translate-x-1/2 flex-col',
      'top-right': 'top-6 right-6 flex-col items-end'
    })[toastPosition] || 'bottom-6 left-1/2 -translate-x-1/2 flex-col'
)
</script>

<template>
  <div>
    <!-- Toasts -->
    <div
      class="fixed z-[100] flex gap-2 pointer-events-none"
      :class="positionClass"
      aria-live="polite"
    >
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="px-5 py-2.5 rounded-lg shadow-lg text-sm font-ui bg-bg-tertiary border border-border-subtle max-w-md pointer-events-auto flex items-center justify-between gap-3"
          :class="{
            'text-text-primary': toast.type === 'info',
            'text-success': toast.type === 'success',
            'text-danger': toast.type === 'danger',
            'text-warning': toast.type === 'warning'
          }"
        >
          <span class="flex-1">{{ toast.message }}</span>
          <button
            v-if="toast.action"
            class="shrink-0 text-xs font-semibold text-accent hover:text-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded px-1"
            @click="runToastAction(toast)"
          >
            {{ toast.action.label }}
          </button>
          <button
            class="shrink-0 opacity-50 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-accent rounded"
            aria-label="Dismiss notification"
            @click="removeToast(toast.id)"
          >
            <BaseIcon name="x" :size="14" />
          </button>
        </div>
        <button
          v-if="toasts.length > 1"
          key="dismiss-all"
          class="self-center text-2xs font-ui text-text-hint hover:text-text-primary transition-colors pointer-events-auto focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-0.5"
          @click="dismissAllToasts"
        >
          Dismiss all
        </button>
      </TransitionGroup>
    </div>

    <!-- Confirm Dialog -->
    <Transition name="fade">
      <div
        v-if="activeConfirm"
        class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      >
        <div
          class="bg-bg-tertiary border border-border-subtle rounded-xl shadow-2xl max-w-md w-full p-6"
          @click.stop
        >
          <h3 class="text-lg font-ui text-text-primary mb-2">{{ activeConfirm.title }}</h3>
          <p class="text-text-secondary text-sm font-ui mb-6 whitespace-pre-wrap">
            {{ activeConfirm.message }}
          </p>

          <div class="flex items-center justify-end gap-3">
            <button
              class="px-4 py-2 text-sm font-ui text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
              @click="activeConfirm.resolve(false)"
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 text-sm font-ui font-medium rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-bg-tertiary"
              :class="{
                'bg-danger text-white hover:bg-danger focus:ring-danger':
                  activeConfirm.type === 'danger',
                'bg-accent text-bg-primary hover:bg-accent-hover focus:ring-accent':
                  activeConfirm.type === 'primary'
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
