import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useNotifications', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function createNotifications() {
    const mod = await import('../../composables/useNotifications')
    return mod.useNotifications()
  }

  describe('addToast', () => {
    it('adds a toast to the list', async () => {
      const n = await createNotifications()
      n.addToast('Hello')
      expect(n.toasts.value).toHaveLength(1)
      expect(n.toasts.value[0].message).toBe('Hello')
      expect(n.toasts.value[0].type).toBe('info')
    })

    it('adds toast with custom type', async () => {
      const n = await createNotifications()
      n.addToast('Error', 'error')
      expect(n.toasts.value[0].type).toBe('error')
    })

    it('removes toast after duration', async () => {
      const n = await createNotifications()
      n.addToast('Temp', 'info', 5000)
      expect(n.toasts.value).toHaveLength(1)
      vi.advanceTimersByTime(5000)
      expect(n.toasts.value).toHaveLength(0)
    })

    it('does not auto-remove with duration 0', async () => {
      const n = await createNotifications()
      n.addToast('Persistent', 'info', 0)
      vi.advanceTimersByTime(10000)
      expect(n.toasts.value).toHaveLength(1)
    })

    it('adds multiple toasts', async () => {
      const n = await createNotifications()
      n.addToast('First')
      n.addToast('Second')
      expect(n.toasts.value).toHaveLength(2)
    })
  })

  describe('removeToast', () => {
    it('removes a toast by id', async () => {
      const n = await createNotifications()
      n.addToast('First')
      n.addToast('Second')
      const id = n.toasts.value[0].id
      n.removeToast(id)
      expect(n.toasts.value).toHaveLength(1)
      expect(n.toasts.value[0].message).toBe('Second')
    })

    it('does nothing for unknown id', async () => {
      const n = await createNotifications()
      n.addToast('Test')
      n.removeToast(999)
      expect(n.toasts.value).toHaveLength(1)
    })
  })

  describe('showConfirm', () => {
    it('sets activeConfirm and returns promise', async () => {
      const n = await createNotifications()
      const promise = n.showConfirm('Title', 'Message')
      expect(n.activeConfirm.value.title).toBe('Title')
      expect(n.activeConfirm.value.message).toBe('Message')
      expect(n.activeConfirm.value.type).toBe('danger')
      n.activeConfirm.value.resolve(true)
      await expect(promise).resolves.toBe(true)
      expect(n.activeConfirm.value).toBeNull()
    })

    it('uses custom confirmText and type', async () => {
      const n = await createNotifications()
      n.showConfirm('Title', 'Message', 'OK', 'info')
      expect(n.activeConfirm.value.confirmText).toBe('OK')
      expect(n.activeConfirm.value.type).toBe('info')
    })
  })
})
