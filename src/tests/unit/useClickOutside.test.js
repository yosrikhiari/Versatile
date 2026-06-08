import { describe, it, expect, vi } from 'vitest'

vi.mock('vue', () => ({
  onMounted: (cb) => cb(),
  onUnmounted: vi.fn()
}))

describe('useClickOutside', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('calls callback when clicking outside', async () => {
    const targetEl = document.createElement('div')
    document.body.appendChild(targetEl)
    const callback = vi.fn()
    const { useClickOutside } = await import('../../composables/useClickOutside')
    useClickOutside({ value: targetEl }, callback)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(callback).toHaveBeenCalledTimes(1)
    document.body.removeChild(targetEl)
  })

  it('does not call callback when clicking inside', async () => {
    const targetEl = document.createElement('div')
    document.body.appendChild(targetEl)
    const callback = vi.fn()
    const { useClickOutside } = await import('../../composables/useClickOutside')
    useClickOutside({ value: targetEl }, callback)
    targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(callback).not.toHaveBeenCalled()
    document.body.removeChild(targetEl)
  })

  it('handles null ref value', async () => {
    const callback = vi.fn()
    const { useClickOutside } = await import('../../composables/useClickOutside')
    useClickOutside({ value: null }, callback)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(callback).not.toHaveBeenCalled()
  })

  it('handles array of refs with some null', async () => {
    const targetEl = document.createElement('div')
    const el2 = document.createElement('div')
    document.body.appendChild(targetEl)
    document.body.appendChild(el2)
    const callback = vi.fn()
    const { useClickOutside } = await import('../../composables/useClickOutside')
    useClickOutside({ value: [targetEl, null, el2] }, callback)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(callback).toHaveBeenCalledTimes(1)
    document.body.removeChild(targetEl)
    document.body.removeChild(el2)
  })

  it('handles empty array ref', async () => {
    const callback = vi.fn()
    const { useClickOutside } = await import('../../composables/useClickOutside')
    useClickOutside({ value: [] }, callback)
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(callback).not.toHaveBeenCalled()
  })
})
