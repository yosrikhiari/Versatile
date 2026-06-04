import { ref } from 'vue'

const toasts = ref([])
const activeConfirm = ref(null)

let toastIdCounter = 0

function addToast(message, type = 'info', duration = 3000) {
  const id = toastIdCounter++
  toasts.value.push({ id, message, type })
  
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }
}

function removeToast(id) {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index !== -1) {
    toasts.value.splice(index, 1)
  }
}

function showConfirm(title, message, confirmText = 'Confirm', type = 'danger') {
  return new Promise((resolve) => {
    activeConfirm.value = {
      title,
      message,
      confirmText,
      type,
      resolve: (value) => {
        activeConfirm.value = null
        resolve(value)
      }
    }
  })
}

export function useNotifications() {
  return {
    toasts,
    activeConfirm,
    addToast,
    removeToast,
    showConfirm
  }
}