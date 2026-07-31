import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'
import type { GuardrailEvent, GuardrailKind, GuardrailLayer } from '../types'
import { GuardrailRegistry } from '../registry'

interface GuardrailUserNotification {
  id: string
  kind: GuardrailKind
  layer: GuardrailLayer
  message: string
  severity: 'warning' | 'error' | 'info'
  timestamp: number
  resolved: boolean
  details: Record<string, unknown>
}

type Listener = (notifications: GuardrailUserNotification[]) => void

const listeners = new Set<Listener>()
let notifications: GuardrailUserNotification[] = []

GuardrailRegistry.onEvent((event: GuardrailEvent) => {
  const notification = eventToNotification(event)
  if (notification) {
    notifications = [notification, ...notifications].slice(0, 100)
    for (const cb of listeners) {
      try { cb(notifications) } catch { /* noop */ }
    }
  }
})

function eventToNotification(event: GuardrailEvent): GuardrailUserNotification | null {
  const sev = event.result.severity === 'blocking' ? 'error' : 'warning'
  return {
    id: event.id,
    kind: event.kind,
    layer: event.layer,
    message: event.result.message,
    severity: sev,
    timestamp: event.result.timestamp,
    resolved: false,
    details: (event.result.details ?? {}) as Record<string, unknown>,
  }
}

export function onGuardrailNotification(cb: Listener): () => void {
  listeners.add(cb)
  cb(notifications)
  return () => listeners.delete(cb)
}

export function getGuardrailNotifications(): GuardrailUserNotification[] {
  return notifications
}

export function dismissGuardrailNotification(id: string): void {
  notifications = notifications.map(n => n.id === id ? { ...n, resolved: true } : n)
  for (const cb of listeners) {
    try { cb(notifications) } catch { /* noop */ }
  }
}

export function clearGuardrailNotifications(): void {
  notifications = []
  for (const cb of listeners) {
    try { cb(notifications) } catch { /* noop */ }
  }
}

/**
 * Vue-reactive view over the notification feed. Unsubscribes automatically
 * when used inside a component; callers outside a setup scope get the returned
 * `stop` handle instead.
 */
export function useGuardrailNotifications() {
  const list = ref<GuardrailUserNotification[]>(notifications)
  const stop = onGuardrailNotification(next => {
    list.value = next
  })

  if (getCurrentInstance()) onUnmounted(stop)

  const unresolved = computed(() => list.value.filter(n => !n.resolved))
  const errorCount = computed(() => unresolved.value.filter(n => n.severity === 'error').length)
  const warningCount = computed(() => unresolved.value.filter(n => n.severity === 'warning').length)

  return {
    notifications: list,
    unresolved,
    errorCount,
    warningCount,
    dismiss: dismissGuardrailNotification,
    clear: clearGuardrailNotifications,
    stop,
  }
}

export type { GuardrailUserNotification }
