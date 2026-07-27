import { ref } from 'vue'

const toasts = ref<any[]>([])
const activeConfirm = ref<any>(null)

let toastIdCounter = 0

// Cap on simultaneously visible toasts; oldest is evicted past this (M-3.5).
const MAX_VISIBLE_TOASTS = 5
const VALID_POSITIONS = ['bottom-center', 'bottom-right', 'top-center', 'top-right']

// Default position for the toast stack; overridable per-toast.
const toastPosition = ref('bottom-center')

/**
 * Show a toast.
 * @param {string} message
 * @param {'info'|'success'|'danger'|'warning'} type
 * @param {number} duration ms; 0 keeps it until dismissed. Auto-timeout is
 *   suppressed when an action is present so the user can reach it.
 * @param {object} [options]
 * @param {{label: string, onClick: Function}} [options.action] action button
 * @param {string} [options.position] one of VALID_POSITIONS
 * @returns {number} the toast id (dismiss with removeToast)
 */
function addToast(message: any, type: any = 'info', duration: any = 3000, options: any = {}) {
  const id = toastIdCounter++
  const { action = null, position = null } = options

  toasts.value.push({ id, message, type, action, position })

  // Enforce the visible cap — drop the oldest so newest is always shown.
  while (toasts.value.length > MAX_VISIBLE_TOASTS) {
    toasts.value.shift()
  }

  // Toasts with an action stay until explicitly dismissed or acted on, unless
  // the caller passes an explicit positive duration.
  const effectiveDuration = action && duration === 3000 ? 0 : duration
  if (effectiveDuration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, effectiveDuration)
  }

  return id
}

function removeToast(id: any) {
  const index = toasts.value.findIndex((t) => t.id === id)
  if (index !== -1) {
    toasts.value.splice(index, 1)
  }
}

function dismissAllToasts() {
  toasts.value = []
}

/** Run a toast's action callback, then dismiss it. */
function runToastAction(toast: any) {
  try {
    toast.action?.onClick?.()
  } finally {
    removeToast(toast.id)
  }
}

function setToastPosition(position: any) {
  if (VALID_POSITIONS.includes(position)) {
    toastPosition.value = position
  }
}

function showConfirm(title: any, message: any, confirmText: any = 'Confirm', type: any = 'danger') {
  return new Promise((resolve) => {
    activeConfirm.value = {
      title,
      message,
      confirmText,
      type,
      resolve: (value: any) => {
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
    toastPosition,
    MAX_VISIBLE_TOASTS,
    addToast,
    removeToast,
    dismissAllToasts,
    runToastAction,
    setToastPosition,
    showConfirm
  }
}
